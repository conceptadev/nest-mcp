import assert from 'node:assert/strict';
import 'reflect-metadata';
import { McpClient, McpClientModule, McpClientsService } from '@nest-mcp/client';
import { GatewayService, McpGatewayModule } from '@nest-mcp/gateway';
import {
  type BearerTokenVerifier,
  MCP_BEARER_TOKEN_VERIFIER,
  type McpAuthInfo,
  McpAuthModule,
  McpModule,
  McpRegistryService,
  McpTransportType,
  RateLimit,
  Tool,
} from '@nest-mcp/server';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { z } from 'zod';

@Injectable()
class VerifierDependency {
  readonly clientId = 'injected-client';
}

@Injectable()
class ImportedVerifier implements BearerTokenVerifier {
  constructor(@Inject(VerifierDependency) readonly dependency: VerifierDependency) {}

  async verify(token: string): Promise<McpAuthInfo | null> {
    if (token !== 'valid-token') return null;
    return {
      token,
      clientId: this.dependency.clientId,
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      extra: { sub: 'packed-consumer' },
    };
  }
}

@Module({
  providers: [VerifierDependency, ImportedVerifier],
  exports: [ImportedVerifier],
})
class VerifierModule {}

@Injectable()
class PackedTool {
  @Tool({
    name: 'packed_echo',
    description: 'Confirm packed ESM consumer discovery.',
    parameters: z.object({ value: z.string() }),
  })
  @RateLimit({ max: 1, window: '1m' })
  echo({ value }: { value: string }) {
    return { content: [{ type: 'text' as const, text: value }] };
  }
}

async function verifyClientModuleAndShutdown() {
  const moduleRef = await Test.createTestingModule({
    imports: [McpClientModule.forRoot({ connections: [] })],
  }).compile();
  let disconnectCalls = 0;

  try {
    await moduleRef.init();
    const clientsService = moduleRef.get(McpClientsService);
    const runtimeClient = {
      disconnect: async () => {
        disconnectCalls += 1;
      },
    } as unknown as McpClient;

    clientsService.getClients().push(runtimeClient);
    assert.equal(clientsService.getClients().includes(runtimeClient), true);
  } finally {
    await moduleRef.close();
  }

  assert.equal(disconnectCalls, 1, 'application shutdown must disconnect runtime clients');
}

async function verifyServerAndAuthModules() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      McpModule.forRoot({
        name: 'packed-nest12-consumer',
        version: '1.0.0',
        transport: McpTransportType.STREAMABLE_HTTP,
        transportOptions: {
          streamableHttp: {
            endpoint: '/mcp',
            stateless: true,
            oauth: { enabled: true },
          },
        },
      }),
      McpAuthModule.forRootAsync({
        imports: [VerifierModule],
        inject: [ImportedVerifier],
        useFactory: (verifier: ImportedVerifier) => ({
          resource: 'https://example.test/mcp',
          authorizationServers: ['https://auth.example.test'],
          verifier,
          required: true,
        }),
      }),
    ],
    providers: [PackedTool],
  }).compile();
  const app = moduleRef.createNestApplication();

  try {
    await app.init();

    const verifier = app.get<BearerTokenVerifier>(MCP_BEARER_TOKEN_VERIFIER);
    const authInfo = await verifier.verify('valid-token');
    assert.equal(authInfo?.clientId, 'injected-client');

    const tool = app.get(McpRegistryService).getTool('packed_echo');
    assert.equal(tool?.rateLimit?.max, 1);
  } finally {
    await app.close();
  }
}

async function verifyGatewayModule() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      McpGatewayModule.forRoot({
        server: {
          name: 'packed-nest12-gateway',
          version: '1.0.0',
          transport: McpTransportType.STREAMABLE_HTTP,
          transportOptions: {
            streamableHttp: {
              endpoint: '/gateway',
              stateless: true,
            },
          },
        },
        upstreams: [],
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication();

  try {
    await app.init();
    assert.ok(app.get(GatewayService));
  } finally {
    await app.close();
  }
}

await verifyClientModuleAndShutdown();
await verifyServerAndAuthModules();
await verifyGatewayModule();

console.log('Nest 12 alpha packed TypeScript 6 ESM consumer passed');
