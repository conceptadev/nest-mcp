// @nest-mcp/server - NestJS MCP Server

// Module
export { McpModule } from './mcp.module';
export type { McpForFeatureOptions } from './mcp.module';

// Decorators
export {
  Tool,
  Resource,
  ResourceTemplate,
  Prompt,
  Completion,
  Public,
  IsMcpPublic,
  isMcpPublic,
  MCP_HTTP_PUBLIC_METADATA,
  Scopes,
  Roles,
  Guards,
  UseMiddleware,
  RateLimit,
  Retry,
  CircuitBreaker,
  Timeout,
} from './decorators';

// Discovery
export { McpFeatureModule } from './discovery/mcp-feature.module';
export type { McpFeatureRegistration } from './discovery/feature-registration.constants';
export { McpRegistryService } from './discovery/registry.service';
export type {
  RegisteredTool,
  RegisteredResource,
  RegisteredResourceTemplate,
  RegisteredPrompt,
  RegisteredCompletion,
  TaskHandlerConfig,
} from './discovery/registry.service';
export type { CompletionOptions, CompletionMetadata } from './decorators/completion.decorator';

// Execution
export { McpExecutorService } from './execution/executor.service';
export { ExecutionPipelineService } from './execution/pipeline.service';
export { McpContextFactory } from './execution/context.factory';
export { McpRequestContextService } from './execution/request-context.service';
export { resolveGuard } from './utils/resolve-guard.util';

// Transport
export { StreamableHttpService } from './transport/streamable-http/streamable.service';
export { SseService } from './transport/sse/sse.service';
export { StdioService } from './transport/stdio/stdio.service';
export { StderrLogger } from './transport/stdio/stderr-logger';
export { bootstrapStdioApp } from './transport/stdio/bootstrap-stdio';
export type { StdioBootstrapOptions } from './transport/stdio/bootstrap-stdio';

// Resilience
export { RateLimiterService } from './resilience/rate-limiter.service';
export { CircuitBreakerService } from './resilience/circuit-breaker.service';
export { RetryService } from './resilience/retry.service';

// Middleware
export { MiddlewareService } from './middleware/middleware.service';

// Auth (resource-server role — MCP authorization spec 2025-06-18)
export { ToolAuthGuardService } from './auth/guards/tool-auth.guard';
export { McpAuthModule } from './auth/auth.module';
export {
  MCP_BEARER_TOKEN_VERIFIER,
  MCP_RESOURCE_SERVER_OPTIONS,
} from './auth/auth.constants';
export { McpBearerGuard } from './auth/guards/mcp-bearer.guard';
export { McpAuthenticatedGuard } from './auth/guards/authenticated.guard';
export { JwksVerifier } from './auth/verifiers/jwks.verifier';
export { IntrospectionVerifier } from './auth/verifiers/introspection.verifier';
export type { BearerTokenVerifier } from './auth/verifiers/bearer-verifier.interface';
export type {
  IntrospectionVerifierOptions,
  JwksVerifierOptions,
  McpResourceServerAsyncOptions,
  McpResourceServerOptions,
} from './auth/interfaces/resource-server-options.interface';
export { canonicalizeResourceUri } from './auth/utils/resource-url.util';

// Session
export { SessionManager } from './session/session.manager';

// Subscription
export { ResourceSubscriptionManager } from './subscription/resource-subscription.manager';
export type { McpSession } from './session/session.manager';

// Tasks
export { TaskManager } from './task/task.manager';

// Dynamic builders
export { McpToolBuilder } from './dynamic/tool-builder.service';
export type { DynamicToolConfig } from './dynamic/tool-builder.service';
export { McpResourceBuilder } from './dynamic/resource-builder.service';
export type { DynamicResourceConfig } from './dynamic/resource-builder.service';
export { McpPromptBuilder } from './dynamic/prompt-builder.service';
export type { DynamicPromptConfig } from './dynamic/prompt-builder.service';

// Observability
export { MetricsService } from './observability/metrics.service';
export type { ToolMetrics } from './observability/metrics.service';

// Server factory
export { createMcpServer } from './server/server.factory';

// URL elicitation (opt-in module)
export {
  COMPLETION_NOTIFIER_REGISTRY,
  DEFAULT_ELICITATION_OPTIONS,
  ELICITATION_MODULE_OPTIONS,
  ELICITATION_STORE_TOKEN,
  ElicitationCancelledError,
  ElicitationController,
  ElicitationGuardComposite,
  ElicitationService,
  type ElicitationWaitOptions,
  McpElicitationModule,
  MemoryElicitationStore,
  type CompleteElicitationParams,
  type CompletionNotifier,
  type CompletionNotifierRegistry,
  type CreateElicitationParams,
  type ElicitationModuleOptions,
  type ElicitationRecord,
  type ElicitationResultRecord,
  type ElicitationStoreConfiguration,
  type ElicitationTemplateOptions,
  type IElicitationStore,
  type McpElicitationModuleAsyncOptions,
  type ResolvedElicitationOptions,
  type StartUrlElicitationParams,
  type UrlElicitationHandle,
  type AsyncResolvedElicitationOptions,
} from './elicitation';

// SDK transport types — re-exported for convenience so users don't need to
// import directly from @modelcontextprotocol/sdk
export type {
  EventStore,
  StreamId,
  EventId,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Re-export everything from @nest-mcp/common for convenience —
// users only need to install @nest-mcp/server
export * from '@nest-mcp/common';
