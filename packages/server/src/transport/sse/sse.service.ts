import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { McpExecutionContext, McpModuleOptions } from '@nest-mcp/common';
import { MCP_OPTIONS, McpTransportType } from '@nest-mcp/common';
import { Inject, Injectable, Logger, type OnModuleDestroy, Optional } from '@nestjs/common';
import {
  DEFAULT_PING_INTERVAL,
  DEFAULT_SSE_MESSAGES_ENDPOINT,
} from '../../constants/module.constants';
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
import type { HttpResponse } from '../http-response.interface';
import { rawRequestOf, rawResponseOf } from '../raw-http.util';
import {
  registerHandlers,
  registerPromptOnServer,
  registerResourceOnServer,
  registerResourceTemplateOnServer,
  registerToolOnServer,
} from '../register-handlers';
import type { SdkHandle } from '../register-handlers';

@Injectable()
export class SseService implements OnModuleDestroy {
  private readonly logger = new Logger(SseService.name);
  private readonly transports = new Map<string, SSEServerTransport>();
  private readonly servers = new Map<string, McpServer>();
  private readonly contexts = new Map<string, McpExecutionContext>();
  private readonly pingIntervals = new Map<string, NodeJS.Timeout>();
  /** SDK handles per session, keyed by item name/uri for removal. */
  private readonly sdkHandles = new Map<string, Map<string, SdkHandle>>();

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
    @Optional() private readonly subscriptionManager?: ResourceSubscriptionManager,
    @Optional() private readonly taskManager?: TaskManager,
  ) {
    this.subscribeToRegistryEvents();
  }

  async createConnection(req: unknown, res: unknown): Promise<void> {
    const messagesEndpoint =
      this.options.transportOptions?.sse?.messagesEndpoint ?? DEFAULT_SSE_MESSAGES_ENDPOINT;

    // The SDK writes the event stream directly — hand it the raw Node response
    // (Fastify's reply wrapper is not a ServerResponse).
    const rawRes = rawResponseOf(res);
    const transport = new SSEServerTransport(messagesEndpoint, rawRes);
    const sessionId = transport.sessionId;

    const server = createMcpServer(this.registry, this.options, this.taskManager);
    const subMgr = this.subscriptionManager;
    const ctx = this.contextFactory.createContext({
      sessionId,
      transport: McpTransportType.SSE,
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

    this.transports.set(sessionId, transport);
    this.servers.set(sessionId, server);
    this.contexts.set(sessionId, ctx);
    this.sdkHandles.set(sessionId, new Map());

    // Setup ping — written to the raw stream, same channel the SDK uses.
    const pingInterval = this.options.transportOptions?.sse?.pingInterval ?? DEFAULT_PING_INTERVAL;
    if (pingInterval > 0) {
      const interval = setInterval(() => {
        try {
          rawRes.write(':ping\n\n');
        } catch {
          clearInterval(interval);
        }
      }, pingInterval);
      this.pingIntervals.set(sessionId, interval);
    }

    // Cleanup on close — the raw response emits 'close' on both frameworks.
    rawRes.on('close', () => this.cleanupSession(sessionId));

    await server.connect(transport);
    this.logger.log(`SSE connection: ${sessionId}`);
  }

  async handleMessage(req: unknown, res: unknown, parsedBody?: unknown): Promise<void> {
    const reqObj = req as { url: string; headers: { host: string } };
    const url = new URL(reqObj.url, `http://${reqObj.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId || !this.transports.has(sessionId)) {
      const resObj = res as HttpResponse;
      resObj.status?.(404)?.json?.({ error: 'Session not found' }) ??
        resObj.code?.(404)?.send?.({ error: 'Session not found' });
      return;
    }

    const transport = this.transports.get(sessionId);
    if (transport) {
      // Body parsed by an upstream middleware (global `express.json()`, Fastify's
      // built-in parser, …) means the raw stream is consumed — hand it to the SDK
      // as `parsedBody` or it hangs trying to re-read the stream.
      await transport.handlePostMessage(
        rawRequestOf(req),
        rawResponseOf(res),
        parsedBody ?? (req as { body?: unknown }).body,
      );
    }
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
    this.subscriptionManager?.removeSession(sessionId);
    this.taskManager?.removeSession(sessionId);

    const pingInterval = this.pingIntervals.get(sessionId);
    if (pingInterval) {
      clearInterval(pingInterval);
      this.pingIntervals.delete(sessionId);
    }

    const transport = this.transports.get(sessionId);
    const server = this.servers.get(sessionId);

    if (transport) {
      await transport.close();
      this.transports.delete(sessionId);
    }
    if (server) {
      await server.close();
      this.servers.delete(sessionId);
    }

    this.contexts.delete(sessionId);
    this.sdkHandles.delete(sessionId);

    this.logger.log(`SSE session cleaned up: ${sessionId}`);
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
