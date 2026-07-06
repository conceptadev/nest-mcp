# McpModule

The `McpModule` is the entry point for setting up the MCP server in your NestJS application. It provides three static methods: `forRoot`, `forRootAsync`, and `forFeature`.

## McpModule.forRoot

Synchronous configuration. Use when all options are available at import time.

```typescript
import { Module } from '@nestjs/common';
import { McpModule } from '@nest-mcp/server';
import { McpTransportType } from '@nest-mcp/common';

@Module({
  imports: [
    McpModule.forRoot({
      name: 'my-server',
      version: '1.0.0',
      transport: McpTransportType.STREAMABLE_HTTP,
    }),
  ],
})
export class AppModule {}
```

### McpModuleOptions

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | `string` | Yes | Server name reported to clients |
| `version` | `string` | Yes | Server version |
| `description` | `string` | No | Server description (what the server IS) |
| `instructions` | `string` | No | Usage guidance sent to clients at `initialize` — what the LLM reads to learn HOW to use the server. Falls back to `description` when omitted |
| `transport` | `McpTransportType \| McpTransportType[]` | Yes | One or more transports to enable |
| `transportOptions` | `TransportOptions` | No | Per-transport configuration |
| `guards` | `McpGuardClass[]` | No | Global guards applied to all requests |
| `allowUnauthenticatedAccess` | `boolean` | No | Skip auth for all handlers |
| `resilience` | `object` | No | Global resilience defaults |
| `resilience.timeout` | `number` | No | Global timeout in ms |
| `resilience.rateLimit` | `RateLimitConfig` | No | Global rate limit config |
| `resilience.retry` | `RetryConfig` | No | Global retry config |
| `resilience.circuitBreaker` | `CircuitBreakerConfig` | No | Global circuit breaker config |
| `middleware` | `McpMiddleware[]` | No | Global middleware functions |
| `session` | `object` | No | Session manager settings |
| `session.timeout` | `number` | No | Session timeout in ms (default: 30 min) |
| `session.maxConcurrent` | `number` | No | Max concurrent sessions (default: 1000) |
| `session.cleanupInterval` | `number` | No | Cleanup interval in ms (default: 5 min) |
| `pagination` | `object` | No | Pagination settings |
| `pagination.defaultPageSize` | `number` | No | Default page size for list operations |
| `capabilities` | `object` | No | MCP capability flags |
| `capabilities.tools` | `{ listChanged?: boolean }` | No | Tool capabilities |
| `capabilities.resources` | `{ subscribe?: boolean; listChanged?: boolean }` | No | Resource capabilities |
| `capabilities.prompts` | `{ listChanged?: boolean }` | No | Prompt capabilities |
| `capabilities.tasks` | `{ enabled?: boolean }` | No | Task support |
| `capabilities.experimental` | `Record<string, unknown>` | No | Vendor-specific flags |

### Transport Options

```typescript
McpModule.forRoot({
  name: 'my-server',
  version: '1.0.0',
  transport: [McpTransportType.STREAMABLE_HTTP, McpTransportType.SSE],
  transportOptions: {
    streamableHttp: {
      endpoint: '/mcp',       // default: '/mcp'
      stateless: false,        // default: false
    },
    sse: {
      endpoint: '/sse',            // default: '/sse'
      messagesEndpoint: '/messages', // default: '/messages'
      pingInterval: 30000,          // default: 30000 ms
    },
  },
});
```

### Resilience Defaults

```typescript
McpModule.forRoot({
  name: 'my-server',
  version: '1.0.0',
  transport: McpTransportType.STREAMABLE_HTTP,
  resilience: {
    timeout: 30000,
    rateLimit: { max: 100, window: '1m' },
    retry: { maxAttempts: 3, backoff: 'exponential' },
    circuitBreaker: { errorThreshold: 0.5, minRequests: 5 },
  },
});
```

## McpModule.forRootAsync

Asynchronous configuration. Use when options depend on other providers (e.g., `ConfigService`).

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { McpModule } from '@nest-mcp/server';
import { McpTransportType } from '@nest-mcp/common';

@Module({
  imports: [
    ConfigModule.forRoot(),
    McpModule.forRootAsync({
      imports: [ConfigModule],
      transport: McpTransportType.STREAMABLE_HTTP,
      useFactory: (config: ConfigService) => ({
        name: config.get('MCP_SERVER_NAME', 'my-server'),
        version: config.get('MCP_SERVER_VERSION', '1.0.0'),
        transport: McpTransportType.STREAMABLE_HTTP,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### McpModuleAsyncOptions

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `imports` | `any[]` | No | Modules to import for dependency injection |
| `transport` | `McpTransportType \| McpTransportType[]` | Yes | Transports to enable |
| `transportOptions` | `TransportOptions` | No | Per-transport configuration |
| `useFactory` | `(...args: any[]) => McpModuleOptions \| Promise<McpModuleOptions>` | Yes | Factory function |
| `inject` | `any[]` | No | Injection tokens for the factory |

## McpModule.forFeature

Register additional providers that contain MCP decorators. Use in feature modules.

```typescript
import { Module } from '@nestjs/common';
import { McpModule } from '@nest-mcp/server';
import { WeatherTools } from './weather-tools.service';

@Module({
  imports: [McpModule.forFeature([WeatherTools])],
  providers: [WeatherTools],
})
export class WeatherModule {}
```

With an options object, you can import modules that export providers needed by the feature's tools:

```typescript
import { Module } from '@nestjs/common';
import { McpModule } from '@nest-mcp/server';
import { HttpModule } from '@nestjs/axios';
import { WeatherTools } from './weather-tools.service';

@Module({
  imports: [
    McpModule.forFeature([WeatherTools], {
      imports: [HttpModule],
    }),
  ],
})
export class WeatherModule {}
```

### McpForFeatureOptions

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `imports` | `any[]` | No | Modules that export providers needed by the feature's tools |
| `serverName` | `string` | No | Server name to scope providers to a specific server instance |

With a `serverName` parameter, providers are scoped to a specific server instance:

```typescript
McpModule.forFeature([WeatherTools], 'weather-server');
```

You can also combine both options:

```typescript
McpModule.forFeature([WeatherTools], {
  imports: [HttpModule],
  serverName: 'weather-server',
});
```

## Global Module

Both `forRoot` and `forRootAsync` register the module as global, so you do not need to re-import `McpModule` in every feature module. The following services are exported and available for injection anywhere:

- `McpRegistryService`
- `McpExecutorService`
- `ExecutionPipelineService`
- `McpRequestContextService`
- `McpToolBuilder`, `McpResourceBuilder`, `McpPromptBuilder`
- `MetricsService`
- `SessionManager`
- `ResourceSubscriptionManager`
- `TaskManager`

## See Also

- [Getting Started](./getting-started.md) -- Minimal working example
- [Transports](./transports.md) -- Transport-specific configuration
- [Resilience](./resilience.md) -- Resilience configuration details
