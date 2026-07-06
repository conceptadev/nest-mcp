# @nest-mcp/server

Build [Model Context Protocol](https://modelcontextprotocol.io) servers with NestJS. Expose tools, resources, prompts, and completions to AI clients through decorators, with built-in auth, resilience, middleware, and multiple transport options.

## Installation

```bash
npm install @nest-mcp/server @nest-mcp/common
# peer dependencies
npm install @modelcontextprotocol/sdk @nestjs/common @nestjs/core reflect-metadata rxjs zod
```

Or with pnpm:

```bash
pnpm add @nest-mcp/server @nest-mcp/common
pnpm add @modelcontextprotocol/sdk @nestjs/common @nestjs/core reflect-metadata rxjs zod
```

## Quick Start

```typescript
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { McpModule } from '@nest-mcp/server';
import { McpTransportType } from '@nest-mcp/common';
import { ToolsService } from './tools.service';

@Module({
  imports: [
    McpModule.forRoot({
      name: 'my-mcp-server',
      version: '1.0.0',
      transport: McpTransportType.STREAMABLE_HTTP,
    }),
  ],
  providers: [ToolsService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

```typescript
// tools.service.ts
import { Injectable } from '@nestjs/common';
import { Tool } from '@nest-mcp/server';
import { z } from 'zod';

@Injectable()
export class ToolsService {
  @Tool({
    name: 'greet',
    description: 'Say hello',
    parameters: z.object({ name: z.string() }),
  })
  async greet(args: { name: string }) {
    return `Hello, ${args.name}!`;
  }
}
```

## Features

- **Decorator-driven** -- `@Tool`, `@Resource`, `@ResourceTemplate`, `@Prompt`, `@Completion`
- **Multiple transports** -- Streamable HTTP, SSE, and STDIO
- **OAuth 2.1 auth** -- Built-in JWT, PKCE, dynamic client registration
- **Resilience** -- Rate limiting, circuit breaker, retry, timeout
- **Middleware** -- Global and per-tool request pipeline
- **Dynamic registration** -- Add/remove tools, resources, prompts at runtime
- **Session management** -- Per-session state, resource subscriptions, task tracking
- **Testing utilities** -- `createMcpTestApp` and `mockMcpContext`

## Documentation

| Topic | Description |
|-------|-------------|
| [Getting Started](./getting-started.md) | Minimal working example |
| [Module](./module.md) | `McpModule.forRoot` / `forRootAsync` / `forFeature` |
| [Decorators](./decorators.md) | `@Tool`, `@Resource`, `@ResourceTemplate`, `@Prompt`, `@Completion` |
| [Auth Decorators](./auth-decorators.md) | `@Public`, `@Scopes`, `@Roles`, `@Guards` |
| [Resilience Decorators](./resilience-decorators.md) | `@RateLimit`, `@Retry`, `@CircuitBreaker`, `@Timeout` |
| [Transports](./transports.md) | SSE, Streamable HTTP, STDIO |
| [Auth](./auth.md) | `McpAuthModule`, OAuth resource server, verifiers, guards |
| [Recipe: better-auth](./auth-better-auth.md) | better-auth `mcp` plugin as the authorization server |
| [Resilience](./resilience.md) | Rate limiter, circuit breaker, retry services |
| [Middleware](./middleware.md) | `@UseMiddleware`, `MiddlewareService` |
| [Dynamic Builders](./dynamic-builders.md) | `McpToolBuilder`, `McpResourceBuilder`, `McpPromptBuilder` |
| [Execution Pipeline](./execution-pipeline.md) | Request lifecycle |
| [Sessions](./sessions.md) | `SessionManager`, `ResourceSubscriptionManager`, `TaskManager` |
| [Testing](./testing.md) | `createMcpTestApp`, `mockMcpContext` |

## See Also

- [`@nest-mcp/common`](../common/README.md) -- Shared interfaces and utilities
- [`@nest-mcp/client`](../client/README.md) -- MCP client for NestJS
- [`@nest-mcp/gateway`](../gateway/README.md) -- MCP gateway/aggregator
