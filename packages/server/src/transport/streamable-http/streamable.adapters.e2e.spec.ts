import 'reflect-metadata';
import { McpTransportType } from '@nest-mcp/common';
import { Injectable, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import * as z from 'zod';
import { Tool } from '../../decorators';
import { McpModule } from '../../mcp.module';

/**
 * Real-HTTP e2e for the streamable transport on BOTH Nest adapters. This is the
 * test that proves the SDK receives usable raw Node req/res objects — under
 * Fastify the framework hands controllers wrappers, and handing those to the
 * SDK breaks the transport entirely.
 */

@Injectable()
class EchoTools {
  @Tool({
    name: 'echo',
    description: 'Echoes a message back',
    parameters: z.object({ message: z.string() }),
  })
  echo(args: { message: string }) {
    return { content: [{ type: 'text' as const, text: `echo:${args.message}` }] };
  }
}

@Module({
  imports: [
    McpModule.forRoot({
      name: 'e2e-server',
      version: '1.0.0',
      transport: McpTransportType.STREAMABLE_HTTP,
      transportOptions: {
        // Stateless + JSON responses keep the assertions simple; the SDK still
        // writes status/headers/body directly on the raw ServerResponse.
        streamableHttp: { stateless: true, enableJsonResponse: true },
      },
    }),
  ],
  providers: [EchoTools],
})
class E2eAppModule {}

async function bootExpress(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [E2eAppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  return app;
}

async function bootFastify(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [E2eAppModule] }).compile();
  const app = moduleRef.createNestApplication(new FastifyAdapter());
  await app.listen(0);
  return app;
}

async function rpc(baseUrl: string, payload: object): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : undefined };
}

describe.each([
  ['express', bootExpress],
  ['fastify', bootFastify],
] as const)('streamable transport over real HTTP (%s)', (_adapter, boot) => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('serves initialize, tools/list, and tools/call end-to-end', async () => {
    app = await boot();
    const baseUrl = await app.getUrl();

    const init = await rpc(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '0.0.0' },
      },
    });
    expect(init.status).toBe(200);
    expect(init.json).toMatchObject({
      result: { serverInfo: { name: 'e2e-server' } },
    });

    const list = await rpc(baseUrl, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.status).toBe(200);
    expect(list.json).toMatchObject({
      result: { tools: [{ name: 'echo' }] },
    });

    const call = await rpc(baseUrl, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'echo', arguments: { message: 'ping' } },
    });
    expect(call.status).toBe(200);
    expect(call.json).toMatchObject({
      result: { content: [{ type: 'text', text: 'echo:ping' }] },
    });
  });
});
