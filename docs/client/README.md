# @nest-mcp/client

NestJS module for connecting to and consuming [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers. Declare connections in your module configuration, inject typed clients into your services, and call tools, read resources, list prompts, and more -- all with full NestJS lifecycle integration.

## Features

- **Multiple transports** -- Streamable HTTP, SSE, and STDIO connections
- **Declarative module registration** -- `forRoot` and `forRootAsync` with NestJS DI
- **Named client injection** -- `@InjectMcpClient('name')` decorator
- **Notification handling** -- `@OnMcpNotification` decorator for server-sent notifications
- **Auto-reconnect** -- configurable exponential backoff on connection loss
- **Health checks** -- `McpClientHealthIndicator` for readiness probes
- **OAuth support** -- re-exported OAuth utilities from the MCP SDK
- **Testing utilities** -- `MockMcpClient` for unit tests

## Installation

```bash
npm install @nest-mcp/client @modelcontextprotocol/sdk
```

or with pnpm:

```bash
pnpm add @nest-mcp/client @modelcontextprotocol/sdk
```

### Peer dependencies

The following packages must be installed in your project:

| Package | Version |
|---------|---------|
| `@modelcontextprotocol/sdk` | `^1.10.0` |
| `@nestjs/common` | `^10.0.0 \|\| ^11.0.0 \|\| 12.0.0-alpha.5` |
| `@nestjs/core` | `^10.0.0 \|\| ^11.0.0 \|\| 12.0.0-alpha.5` |
| `reflect-metadata` | `>=0.1.13` |
| `rxjs` | `^7.0.0` |

## Quick start

```typescript
import { Module } from '@nestjs/common';
import { McpClientModule } from '@nest-mcp/client';

@Module({
  imports: [
    McpClientModule.forRoot({
      connections: [
        {
          name: 'my-server',
          transport: 'streamable-http',
          url: 'http://localhost:3001/mcp',
        },
      ],
    }),
  ],
})
export class AppModule {}
```

Then inject and use the client:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectMcpClient, McpClient } from '@nest-mcp/client';

@Injectable()
export class MyService {
  constructor(@InjectMcpClient('my-server') private readonly mcp: McpClient) {}

  async run() {
    const tools = await this.mcp.listAllTools();
    const result = await this.mcp.callTool({ name: 'greet', arguments: { who: 'World' } });
    return result;
  }
}
```

## Documentation

| Page | Description |
|------|-------------|
| [Getting Started](./getting-started.md) | Minimal working example |
| [Module Configuration](./module.md) | `forRoot` / `forRootAsync` options |
| [Connections](./connections.md) | Transport types, auth, and connection options |
| [Injection](./injection.md) | `@InjectMcpClient`, `McpClientsService`, `getMcpClientToken` |
| [Client API](./client-api.md) | Full `McpClient` method reference |
| [Notifications](./notifications.md) | `@OnMcpNotification` decorator |
| [Reconnection](./reconnection.md) | Auto-reconnect and backoff behavior |
| [OAuth](./oauth.md) | OAuth utilities re-exported from the SDK |
| [Health Checks](./health.md) | `McpClientHealthIndicator` |
| [Testing](./testing.md) | `MockMcpClient` for unit tests |

## License

MIT
