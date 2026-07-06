import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpAuthInfo, McpExecutionContext, McpModuleOptions } from '@nest-mcp/common';
import { MCP_OPTIONS } from '@nest-mcp/common';
import { McpTransportType } from '@nest-mcp/common';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MCP_BEARER_TOKEN_VERIFIER } from '../../auth/auth.constants';
import type { BearerTokenVerifier } from '../../auth/verifiers/bearer-verifier.interface';
import type {
  RegisteredPrompt,
  RegisteredResource,
  RegisteredResourceTemplate,
  RegisteredTool,
} from '../../discovery/registry.service';
import { McpRegistryService } from '../../discovery/registry.service';
import { McpContextFactory } from '../../execution/context.factory';
import { McpExecutorService } from '../../execution/executor.service';
import { ExecutionPipelineService } from '../../execution/pipeline.service';
import { createMcpServer } from '../../server/server.factory';
import { ResourceSubscriptionManager } from '../../subscription/resource-subscription.manager';
import { TaskManager } from '../../task/task.manager';
import {
  registerHandlers,
  registerPromptOnServer,
  registerResourceOnServer,
  registerResourceTemplateOnServer,
  registerToolOnServer,
} from '../register-handlers';
import type { SdkHandle } from '../register-handlers';

interface HttpRequest {
  headers?: Record<string, string | string[] | undefined>;
  headersSent?: boolean;
  /** Verified bearer identity; the SDK transport reads this and surfaces it as `authInfo`. */
  auth?: McpAuthInfo;
  /**
   * Body parsed by an upstream middleware (global `express.json()`, Fastify's
   * built-in parser, …). When set, the raw stream is already consumed, so it
   * must be handed to the SDK as `parsedBody` — reading the stream again would
   * hang the request.
   */
  body?: unknown;
}

interface HttpResponse {
  headersSent?: boolean;
  status?: (code: number) => { json?: (body: unknown) => void; end?: () => void };
  code?: (code: number) => { send?: (body?: unknown) => void };
  on?: (event: string, cb: () => void) => void;
  /** Express / Node `ServerResponse` header setter. */
  setHeader?: (name: string, value: string) => unknown;
  /** Fastify reply header setter. */
  header?: (name: string, value: string) => unknown;
}

@Injectable()
export class StreamableHttpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamableHttpService.name);
  private readonly transports = new Map<string, StreamableHTTPServerTransport>();
  private readonly servers = new Map<string, McpServer>();
  private readonly contexts = new Map<string, McpExecutionContext>();
  /** SDK handles per session, keyed by item name/uri for removal. */
  private readonly sdkHandles = new Map<string, Map<string, SdkHandle>>();
  /** Principal each stateful session was initialized by (oauth session binding). */
  private readonly sessionAuth = new Map<string, { sub?: string; clientId: string }>();
  /** Lazily resolved bearer-token verifier (cached on first successful resolution). */
  private bearerVerifier?: BearerTokenVerifier;

  private readonly registryListeners: Array<{
    event: string;
    listener: (...args: unknown[]) => void;
  }> = [];

  constructor(
    @Inject(MCP_OPTIONS) private readonly options: McpModuleOptions,
    private readonly registry: McpRegistryService,
    private readonly executor: McpExecutorService,
    private readonly pipeline: ExecutionPipelineService,
    private readonly contextFactory: McpContextFactory,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly subscriptionManager?: ResourceSubscriptionManager,
    @Optional() private readonly taskManager?: TaskManager,
  ) {
    this.subscribeToRegistryEvents();
  }

  onModuleInit(): void {
    if (this.oauthOptions?.enabled && !this.resolveBearerVerifier()) {
      this.logger.warn(
        'streamableHttp.oauth.enabled is set but no MCP_BEARER_TOKEN_VERIFIER provider could be resolved. ' +
          'Import McpAuthModule.forRoot({ resource, authorizationServers, jwks | introspection | verifier }) — ' +
          'requests will fail until then.',
      );
    }
  }

  get isStateless(): boolean {
    return this.options.transportOptions?.streamableHttp?.stateless ?? false;
  }

  private get oauthOptions() {
    return this.options.transportOptions?.streamableHttp?.oauth;
  }

  private resolveBearerVerifier(): BearerTokenVerifier | undefined {
    if (this.bearerVerifier) return this.bearerVerifier;
    try {
      this.bearerVerifier = this.moduleRef.get<BearerTokenVerifier>(MCP_BEARER_TOKEN_VERIFIER, {
        strict: false,
      });
    } catch {
      // Not registered — handled by the caller.
    }
    return this.bearerVerifier;
  }

  async handlePostRequest(req: unknown, res: unknown): Promise<void> {
    try {
      if (this.isStateless) {
        await this.handleStatelessPost(req, res);
      } else {
        await this.handleStatefulPost(req, res);
      }
    } catch (error) {
      this.logger.error('Error handling POST request', error);
      const resObj = res as HttpResponse;
      if (!resObj.headersSent) {
        resObj.status?.(500).json?.({ error: 'Internal server error' }) ??
          resObj.code?.(500).send?.({ error: 'Internal server error' });
      }
    }
  }

  async handleGetRequest(req: unknown, res: unknown): Promise<void> {
    const resObj = res as HttpResponse;
    if (this.isStateless) {
      resObj.status?.(405).json?.({ error: 'SSE not supported in stateless mode' }) ??
        resObj.code?.(405).send?.({ error: 'SSE not supported in stateless mode' });
      return;
    }

    const reqObj = req as HttpRequest;
    const sessionId = reqObj.headers?.['mcp-session-id'] as string | undefined;
    if (!sessionId || !this.transports.has(sessionId)) {
      resObj.status?.(404).json?.({ error: 'Session not found' }) ??
        resObj.code?.(404).send?.({ error: 'Session not found' });
      return;
    }

    if (!this.enforceSessionBinding(sessionId, req, res)) return;

    const transport = this.transports.get(sessionId);
    if (transport) {
      await transport.handleRequest(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse,
      );
    }
  }

  async handleDeleteRequest(req: unknown, res: unknown): Promise<void> {
    const reqObj = req as HttpRequest;
    const resObj = res as HttpResponse;
    const sessionId = reqObj.headers?.['mcp-session-id'] as string | undefined;
    if (sessionId && this.transports.has(sessionId)) {
      if (!this.enforceSessionBinding(sessionId, req, res)) return;
      await this.cleanupSession(sessionId);
      resObj.status?.(204).end?.() ?? resObj.code?.(204).send?.();
    } else {
      resObj.status?.(404).json?.({ error: 'Session not found' }) ??
        resObj.code?.(404).send?.({ error: 'Session not found' });
    }
  }

  private buildTransportOptions(stateless: boolean): StreamableHTTPServerTransportOptions {
    const opts = this.options.transportOptions?.streamableHttp;
    return {
      sessionIdGenerator: stateless
        ? undefined
        : (opts?.sessionIdGenerator ?? (() => randomUUID())),
      enableJsonResponse: opts?.enableJsonResponse,
      eventStore: opts?.eventStore,
      onsessioninitialized: opts?.onsessioninitialized,
      onsessionclosed: opts?.onsessionclosed,
      retryInterval: opts?.retryInterval,
      allowedHosts: opts?.allowedHosts,
      allowedOrigins: opts?.allowedOrigins,
      enableDnsRebindingProtection: opts?.enableDnsRebindingProtection,
    };
  }

  /**
   * Verifies the current request's principal matches the one the session was
   * initialized by. Responds 403 and returns false on mismatch. No-op unless
   * oauth is enabled, binding is on, and a binding was recorded.
   */
  private enforceSessionBinding(sessionId: string, req: unknown, res: unknown): boolean {
    const oauth = this.oauthOptions;
    if (!oauth?.enabled || oauth.bindSessionToUser === false) return true;

    const bound = this.sessionAuth.get(sessionId);
    if (!bound) return true;

    const auth = (req as HttpRequest).auth;
    const sub = auth?.extra?.sub as string | undefined;
    if (auth && auth.clientId === bound.clientId && sub === bound.sub) return true;

    const resObj = res as HttpResponse;
    if (!resObj.headersSent) {
      const body = { error: 'Session does not belong to this principal' };
      resObj.status?.(403).json?.(body) ?? resObj.code?.(403).send?.(body);
    }
    return false;
  }

  private async handleStatelessPost(req: unknown, res: unknown): Promise<void> {
    const transport = new StreamableHTTPServerTransport(this.buildTransportOptions(true));

    const server = this.createAndConnectServer(
      transport,
      `stateless-${randomUUID().slice(0, 8)}`,
      req,
    );

    const resObj = res as HttpResponse;
    resObj.on?.('close', () => {
      transport.close();
      server.close();
    });

    await transport.handleRequest(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      (req as HttpRequest).body,
    );
  }

  private async handleStatefulPost(req: unknown, res: unknown): Promise<void> {
    const reqObj = req as HttpRequest;
    const existingSessionId = reqObj.headers?.['mcp-session-id'] as string | undefined;

    if (existingSessionId && this.transports.has(existingSessionId)) {
      if (!this.enforceSessionBinding(existingSessionId, req, res)) return;
      const transport = this.transports.get(existingSessionId);
      if (transport) {
        await transport.handleRequest(
          req as unknown as IncomingMessage,
          res as unknown as ServerResponse,
          reqObj.body,
        );
      }
      return;
    }

    // New session
    const transport = new StreamableHTTPServerTransport(this.buildTransportOptions(false));

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) this.cleanupSession(sid);
    };

    const server = this.createAndConnectServer(transport, 'pending', req);

    await transport.handleRequest(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      reqObj.body,
    );

    const sessionId = transport.sessionId;
    if (sessionId) {
      this.transports.set(sessionId, transport);
      this.servers.set(sessionId, server);

      const oauth = this.oauthOptions;
      const auth = reqObj.auth;
      if (oauth?.enabled && oauth.bindSessionToUser !== false && auth) {
        this.sessionAuth.set(sessionId, {
          sub: auth.extra?.sub as string | undefined,
          clientId: auth.clientId,
        });
      }

      this.logger.log(`New session: ${sessionId}`);
    }
  }

  private createAndConnectServer(
    transport: StreamableHTTPServerTransport,
    label: string,
    req?: unknown,
  ): McpServer {
    const server = createMcpServer(this.registry, this.options, this.taskManager);
    const subMgr = this.subscriptionManager;
    const ctx = this.contextFactory.createContext({
      sessionId: label,
      transport: McpTransportType.STREAMABLE_HTTP,
      request: req,
      mcpServer: server,
      notifyResourceUpdated: subMgr ? (uri) => subMgr.notifyResourceUpdated(uri) : undefined,
    });

    registerHandlers(
      server,
      this.registry,
      this.pipeline,
      ctx,
      this.options,
      this.subscriptionManager,
    );

    // Only store context/handles for stateful sessions (label !== stateless-*)
    if (!label.startsWith('stateless-')) {
      this.contexts.set(label, ctx);
      this.sdkHandles.set(label, new Map());
    }

    server.connect(transport);
    return server;
  }

  private subscribeToRegistryEvents(): void {
    const onToolRegistered = (tool: RegisteredTool) => {
      for (const [sessionId, server] of this.servers) {
        const ctx = this.contexts.get(sessionId);
        if (!ctx) continue;
        const handle = registerToolOnServer(server, tool, this.pipeline, ctx);
        this.sdkHandles.get(sessionId)?.set(`tool:${tool.name}`, handle);
      }
    };

    const onToolUnregistered = (name: string) => {
      for (const [sessionId] of this.servers) {
        const handle = this.sdkHandles.get(sessionId)?.get(`tool:${name}`);
        if (handle) {
          handle.remove();
          this.sdkHandles.get(sessionId)?.delete(`tool:${name}`);
        }
      }
    };

    const onResourceRegistered = (resource: RegisteredResource) => {
      for (const [sessionId, server] of this.servers) {
        const ctx = this.contexts.get(sessionId);
        if (!ctx) continue;
        const handle = registerResourceOnServer(server, resource, this.pipeline, ctx);
        this.sdkHandles.get(sessionId)?.set(`resource:${resource.uri}`, handle);
      }
    };

    const onResourceUnregistered = (uri: string) => {
      for (const [sessionId] of this.servers) {
        const handle = this.sdkHandles.get(sessionId)?.get(`resource:${uri}`);
        if (handle) {
          handle.remove();
          this.sdkHandles.get(sessionId)?.delete(`resource:${uri}`);
        }
      }
    };

    const onPromptRegistered = (prompt: RegisteredPrompt) => {
      for (const [sessionId, server] of this.servers) {
        const ctx = this.contexts.get(sessionId);
        if (!ctx) continue;
        const handle = registerPromptOnServer(server, prompt, this.pipeline, ctx);
        this.sdkHandles.get(sessionId)?.set(`prompt:${prompt.name}`, handle);
      }
    };

    const onPromptUnregistered = (name: string) => {
      for (const [sessionId] of this.servers) {
        const handle = this.sdkHandles.get(sessionId)?.get(`prompt:${name}`);
        if (handle) {
          handle.remove();
          this.sdkHandles.get(sessionId)?.delete(`prompt:${name}`);
        }
      }
    };

    const onResourceTemplateRegistered = (template: RegisteredResourceTemplate) => {
      for (const [sessionId, server] of this.servers) {
        const ctx = this.contexts.get(sessionId);
        if (!ctx) continue;
        const handle = registerResourceTemplateOnServer(server, template, this.pipeline, ctx);
        this.sdkHandles.get(sessionId)?.set(`resourceTemplate:${template.uriTemplate}`, handle);
      }
    };

    const onResourceTemplateUnregistered = (uriTemplate: string) => {
      for (const [sessionId] of this.servers) {
        const handle = this.sdkHandles.get(sessionId)?.get(`resourceTemplate:${uriTemplate}`);
        if (handle) {
          handle.remove();
          this.sdkHandles.get(sessionId)?.delete(`resourceTemplate:${uriTemplate}`);
        }
      }
    };

    const onOutboundNotification = ({
      method,
      params,
    }: { method: string; params: Record<string, unknown> }) => {
      for (const server of this.servers.values()) {
        (server.server as unknown as { notification: (n: unknown) => Promise<void> })
          .notification({ method, params })
          .catch((err: unknown) =>
            this.logger.warn(`Failed to forward notification to session: ${err}`),
          );
      }
    };

    this.registry.events.on('tool.registered', onToolRegistered);
    this.registry.events.on('tool.unregistered', onToolUnregistered);
    this.registry.events.on('resource.registered', onResourceRegistered);
    this.registry.events.on('resource.unregistered', onResourceUnregistered);
    this.registry.events.on('prompt.registered', onPromptRegistered);
    this.registry.events.on('prompt.unregistered', onPromptUnregistered);
    this.registry.events.on('resourceTemplate.registered', onResourceTemplateRegistered);
    this.registry.events.on('resourceTemplate.unregistered', onResourceTemplateUnregistered);
    this.registry.events.on('notification.outbound', onOutboundNotification);

    this.registryListeners.push(
      { event: 'tool.registered', listener: onToolRegistered as (...args: unknown[]) => void },
      { event: 'tool.unregistered', listener: onToolUnregistered as (...args: unknown[]) => void },
      {
        event: 'resource.registered',
        listener: onResourceRegistered as (...args: unknown[]) => void,
      },
      {
        event: 'resource.unregistered',
        listener: onResourceUnregistered as (...args: unknown[]) => void,
      },
      { event: 'prompt.registered', listener: onPromptRegistered as (...args: unknown[]) => void },
      {
        event: 'prompt.unregistered',
        listener: onPromptUnregistered as (...args: unknown[]) => void,
      },
      {
        event: 'resourceTemplate.registered',
        listener: onResourceTemplateRegistered as (...args: unknown[]) => void,
      },
      {
        event: 'resourceTemplate.unregistered',
        listener: onResourceTemplateUnregistered as (...args: unknown[]) => void,
      },
      {
        event: 'notification.outbound',
        listener: onOutboundNotification as (...args: unknown[]) => void,
      },
    );
  }

  private async cleanupSession(sessionId: string): Promise<void> {
    // Guard: remove from maps first to prevent re-entrant cleanup when
    // transport.close() fires onclose, which would call cleanupSession again.
    if (!this.transports.has(sessionId) && !this.servers.has(sessionId)) {
      return;
    }

    this.subscriptionManager?.removeSession(sessionId);
    this.taskManager?.removeSession(sessionId);

    const transport = this.transports.get(sessionId);
    const server = this.servers.get(sessionId);

    this.transports.delete(sessionId);
    this.servers.delete(sessionId);
    this.contexts.delete(sessionId);
    this.sdkHandles.delete(sessionId);
    this.sessionAuth.delete(sessionId);

    if (transport) {
      await transport.close();
    }
    if (server) {
      await server.close();
    }

    this.logger.log(`Session cleaned up: ${sessionId}`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const { event, listener } of this.registryListeners) {
      this.registry.events.removeListener(event, listener);
    }
    this.registryListeners.length = 0;

    for (const sessionId of this.transports.keys()) {
      await this.cleanupSession(sessionId);
    }
  }
}
