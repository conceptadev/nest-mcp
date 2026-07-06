# nest-mcp

[![CI](https://github.com/btwld/nest-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/btwld/nest-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@nest-mcp/server.svg?label=npm)](https://www.npmjs.com/package/@nest-mcp/server)
[![npm downloads](https://img.shields.io/npm/dm/@nest-mcp/server.svg)](https://www.npmjs.com/package/@nest-mcp/server)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue)](https://github.com/btwld/nest-mcp/blob/main/LICENSE)
[![DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/btwld/nest-mcp)

Build [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers, clients, and gateways using the NestJS ecosystem you already know: decorators, dependency injection, modules, and guards, without learning a new framework.

## Packages

| Package | Description |
|---------|-------------|
| [`@nest-mcp/server`](./packages/server) | Build MCP servers with decorators, auth, resilience, and multi-transport support |
| [`@nest-mcp/client`](./packages/client) | Connect to and consume MCP servers with typed injection and health checks |
| [`@nest-mcp/gateway`](./packages/gateway) | Aggregate multiple upstream servers behind one unified MCP endpoint |
| [`@nest-mcp/common`](./packages/common) | Shared types and utilities (peer dependency) |

## Architecture

```
┌─────────────────────────────────────────────┐
│             AI Client (LLM host)            │
└──────────────────────┬──────────────────────┘
                       │ MCP (Streamable HTTP / SSE / STDIO)
          ┌────────────▼────────────┐
          │   @nest-mcp/gateway     │  ← optional aggregation layer
          │  (NestJS application)   │
          └──┬──────────────┬───────┘
             │              │ upstream MCP connections (@nest-mcp/client)
  ┌──────────▼──┐    ┌──────▼──────┐
  │  @nest-mcp/ │    │  @nest-mcp/ │  ← MCP servers built with @nest-mcp/server,
  │   server A  │    │   server B  │     or any other MCP-compatible server
  └─────────────┘    └─────────────┘
```

### @nest-mcp/server — internal architecture

```
  HTTP / SSE / STDIO
         │
         ▼
  ┌─────────────────────────────────────────────────────────┐
  │                    Transport Layer                      │
  │        (StreamableHttpService / SseService /            │
  │                 StdioService)                           │
  └──────────────────────┬──────────────────────────────────┘
                         │ MCP request (tool/resource/prompt)
                         ▼
  ┌─────────────────────────────────────────────────────────┐
  │                  Execution Pipeline                     │
  │                                                         │
  │  ContextFactory → McpExecutionContext                   │
  │         │                                               │
  │         ▼                                               │
  │  Auth Guards (@Public / @Scopes / @Roles / @Guards)     │
  │         │                                               │
  │         ▼                                               │
  │  Middleware (@UseMiddleware → McpMiddleware chain)      │
  │         │                                               │
  │         ▼                                               │
  │  Resilience (@RateLimit → @CircuitBreaker → @Retry      │
  │              → @Timeout)                                │
  │         │                                               │
  │         ▼                                               │
  │  ExecutorService → @Tool / @Resource / @Prompt /        │
  │                    @ResourceTemplate / @Completion      │
  └─────────────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
  ┌─────────────┐         ┌────────────────────┐
  │  Session /  │         │  Dynamic Builders  │
  │ Subscription│         │  McpToolBuilder /  │
  │   / Task    │         │ McpResourceBuilder │
  │  Managers   │         │  McpPromptBuilder  │
  └─────────────┘         └────────────────────┘
```

### @nest-mcp/client — internal architecture

```
  McpClientModule.forRoot({ connections: [...] })
         │
         ▼
  ┌─────────────────────────────────────────────────────────┐
  │                  McpClientsService                      │
  │         (registry of named McpClient instances)         │
  └──────┬─────────────────────┬────────────────────────────┘
         │                     │
         ▼                     ▼
  ┌─────────────┐      ┌───────────────┐
  │  McpClient  │      │   McpClient   │   (one per connection)
  │  "server-a" │      │  "server-b"   │
  │             │      │               │
  │  Transport  │      │   Transport   │
  │  (SSE /     │      │   (Streamable │
  │  Streamable │      │    HTTP /     │
  │  HTTP /     │      │    STDIO)     │
  │  STDIO)     │      │               │
  │  + auth     │      │   + reconnect │
  │  headers    │      │   backoff     │
  └──────┬──────┘      └───────────────┘
         │
         ├── @InjectMcpClient('server-a') → injected into any service
         │
         ├── @OnMcpNotification(method) → notification handler registry
         │
         └── McpClientHealthIndicator → health check (ping-based)
```

### @nest-mcp/gateway — internal architecture

```
  AI Client
     │ MCP request
     ▼
  ┌──────────────────────────────────────────────────────────┐
  │                   McpGatewayModule                       │
  │                                                          │
  │  RouterService (aggregated tool/resource/prompt list)    │
  │    ├── ToolAggregatorService      prefix: weather_*      │
  │    ├── ResourceAggregatorService  prefix: weather://...  │
  │    ├── PromptAggregatorService    prefix: weather_*      │
  │    └── ResourceTemplateAggregator                        │
  │                                                          │
  │  On tool call:                                           │
  │    PolicyEngineService (allow / deny / require_approval) │
  │         │                                                │
  │    RequestTransformService (custom hooks)                │
  │         │                                                │
  │    ResponseCacheService (TTL cache check)                │
  │         │  cache miss                                    │
  │         ▼                                                │
  │    UpstreamManagerService ──────────────────────────┐    │
  │    (resolves prefix → upstream connection)          │    │
  │         │                                           │    │
  │    ResponseTransformService (custom hooks)          │    │
  │         │                                           │    │
  │    ResponseCacheService (store result)              │    │
  └─────────────────────────────────────────────────────┼────┘
                                                        │
         ┌──────────────────────┬─────────────────────┐ │
         ▼                      ▼                     ▼ │
  ┌─────────────┐      ┌──────────────┐      ┌──────────────┐
  │  Upstream A │      │  Upstream B  │      │  Upstream C  │
  │  (weather)  │      │  (search)    │      │   (...)      │
  │  McpClient  │      │  McpClient   │      │  McpClient   │
  └─────────────┘      └──────────────┘      └──────────────┘
         ↕ health ping          ↕ health ping
  HealthCheckerService (periodic ping per upstream)
  TaskAggregatorService (tasks proxied with upstream prefix)
```

## Installation

```bash
# Server — expose tools/resources to AI clients
npm install @nest-mcp/server @modelcontextprotocol/sdk zod@^4

# Client — call tools on a remote MCP server
npm install @nest-mcp/client @modelcontextprotocol/sdk zod@^4

# Gateway — aggregate multiple servers into one
npm install @nest-mcp/gateway @modelcontextprotocol/sdk zod@^4
```

NestJS peer dependencies (if not already installed):

```bash
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
```

## Quick start

### Server

Define tools with decorators and register the module:

```typescript
// tools.service.ts
import { Injectable } from '@nestjs/common';
import { Tool } from '@nest-mcp/server';
import { z } from 'zod';

@Injectable()
export class ToolsService {
  @Tool({
    name: 'greet',
    description: 'Greet a user by name',
    schema: z.object({ name: z.string() }),
  })
  async greet({ name }: { name: string }) {
    return `Hello, ${name}!`;
  }
}
```

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { McpModule, McpTransportType } from '@nest-mcp/server';
import { ToolsService } from './tools.service';

@Module({
  imports: [
    McpModule.forRoot({
      name: 'my-server',
      version: '1.0.0',
      transport: McpTransportType.STREAMABLE_HTTP,
    }),
  ],
  providers: [ToolsService],
})
export class AppModule {}
```

### Client

Connect to a server and inject the client:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { McpClientModule, McpTransportType } from '@nest-mcp/client';

@Module({
  imports: [
    McpClientModule.forRoot({
      connections: [
        {
          name: 'my-server',
          transport: {
            type: McpTransportType.STREAMABLE_HTTP,
            url: 'http://localhost:3000/mcp',
          },
        },
      ],
    }),
  ],
})
export class AppModule {}
```

```typescript
// my.service.ts
import { Injectable } from '@nestjs/common';
import { InjectMcpClient, McpClient } from '@nest-mcp/client';

@Injectable()
export class MyService {
  constructor(@InjectMcpClient('my-server') private client: McpClient) {}

  async greet(name: string) {
    return this.client.callTool({ name: 'greet', arguments: { name } });
  }
}
```

### Gateway

Aggregate two upstream servers behind one endpoint:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { McpGatewayModule, McpTransportType } from '@nest-mcp/gateway';

@Module({
  imports: [
    McpGatewayModule.forRoot({
      name: 'my-gateway',
      version: '1.0.0',
      upstreams: [
        {
          name: 'weather',
          transport: { type: McpTransportType.STREAMABLE_HTTP, url: 'http://weather-service/mcp' },
        },
        {
          name: 'search',
          transport: { type: McpTransportType.STREAMABLE_HTTP, url: 'http://search-service/mcp' },
        },
      ],
    }),
  ],
})
export class AppModule {}
```

Tools from upstream servers are exposed with a prefix (`weather_forecast`, `search_query`). Downstream clients see one unified server.

## Documentation

Full documentation lives in the [`docs/`](./docs/index.md) folder.

| Section | Description |
|---------|-------------|
| [Server docs](./docs/server/README.md) | Decorators, auth, resilience, transports, sessions, testing |
| [Client docs](./docs/client/README.md) | Connections, injection, notifications, health, OAuth |
| [Gateway docs](./docs/gateway/README.md) | Upstreams, routing, policies, caching, transforms, tasks |

## Examples

Working examples live in the [`apps/`](./apps/) directory:

| App | Description |
|-----|-------------|
| `example-sse-server` | MCP server using SSE transport |
| `example-client` | NestJS client consuming a remote MCP server |
| `example-gateway` | Gateway aggregating multiple upstream servers |
| `example-stdio` | MCP server using STDIO transport |
| `example-browser-mcp` | Browser-based MCP integration |
| `example-postgres-mcp` | MCP server exposing PostgreSQL tools |

## Development

This is a pnpm monorepo managed with Turborepo.

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck
```

**Requirements:** Node.js >= 20, pnpm >= 9.

## Contributing

1. Fork the repository and create a branch from `main`
2. Make your changes with tests
3. Run `pnpm test` and `pnpm lint` to verify
4. Open a pull request

Changes to published packages require a [changeset](https://github.com/changesets/changesets):

```bash
pnpm changeset
```

## License

BSD-3-Clause
