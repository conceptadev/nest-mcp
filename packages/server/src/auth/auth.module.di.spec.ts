// Decorators on the module class and guard execute at import time.
import 'reflect-metadata';
import type { McpAuthInfo } from '@nest-mcp/common';
import {
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Logger,
  Module,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCP_BEARER_TOKEN_VERIFIER, MCP_RESOURCE_SERVER_OPTIONS } from './auth.constants';
import { McpAuthModule } from './auth.module';
import { McpBearerGuard } from './guards/mcp-bearer.guard';
import type { McpResourceServerOptions } from './interfaces/resource-server-options.interface';
import type { BearerTokenVerifier } from './verifiers/bearer-verifier.interface';
import { JwksVerifier } from './verifiers/jwks.verifier';

// Vitest transforms TypeScript with esbuild, which never emits
// `design:paramtypes` (`emitDecoratorMetadata`). McpBearerGuard injects
// ModuleRef positionally (no explicit @Inject), so restore the constructor
// metadata tsc emits in the real build.
Reflect.defineMetadata('design:paramtypes', [ModuleRef], McpBearerGuard);

const jwks = {
  uri: 'https://as.example.com/.well-known/jwks.json',
  issuer: 'https://as.example.com',
};

function makeJwksOptions(
  overrides: Partial<McpResourceServerOptions> = {},
): McpResourceServerOptions {
  return {
    resource: 'https://mcp.example.com/mcp',
    authorizationServers: ['https://as.example.com'],
    jwks,
    ...overrides,
  };
}

const compile = async (mod: ReturnType<typeof McpAuthModule.forRoot>) => {
  const ref = await Test.createTestingModule({ imports: [mod] }).compile();
  await ref.init();
  return ref;
};

interface FakeHttpRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: McpAuthInfo;
}

function makeExecutionContext(req: FakeHttpRequest) {
  const res = { setHeader: vi.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { context, res };
}

// jwks-based cases must never call verify() — JwksVerifier loads jose lazily,
// so only provider resolution is exercised here.
describe('McpAuthModule (runtime DI)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('forRoot()', () => {
    it('compiles with jwks config, resolving a JwksVerifier and canonicalized options', async () => {
      const ref = await compile(
        McpAuthModule.forRoot(makeJwksOptions({ resource: 'https://API.Example.com/mcp/' })),
      );

      expect(ref.get<BearerTokenVerifier>(MCP_BEARER_TOKEN_VERIFIER)).toBeInstanceOf(JwksVerifier);
      const options = ref.get<McpResourceServerOptions>(MCP_RESOURCE_SERVER_OPTIONS);
      expect(options.resource).toBe('https://api.example.com/mcp');

      await ref.close();
    });

    it('instantiates a zero-dependency verifier class through moduleRef.create', async () => {
      class StubVerifier implements BearerTokenVerifier {
        async verify(): Promise<McpAuthInfo | null> {
          return null;
        }
      }

      const ref = await compile(
        McpAuthModule.forRoot(makeJwksOptions({ jwks: undefined, verifier: StubVerifier })),
      );

      expect(ref.get<BearerTokenVerifier>(MCP_BEARER_TOKEN_VERIFIER)).toBeInstanceOf(StubVerifier);

      await ref.close();
    });

    it('uses a verifier instance by reference', async () => {
      const instance: BearerTokenVerifier = { verify: async () => null };

      const ref = await compile(
        McpAuthModule.forRoot(makeJwksOptions({ jwks: undefined, verifier: instance })),
      );

      expect(ref.get<BearerTokenVerifier>(MCP_BEARER_TOKEN_VERIFIER)).toBe(instance);

      await ref.close();
    });
  });

  describe('forRootAsync()', () => {
    it('compiles with an async useFactory, resolving canonicalized options and a JwksVerifier', async () => {
      const ref = await compile(
        McpAuthModule.forRootAsync({
          useFactory: async () => makeJwksOptions({ resource: 'https://API.Example.com/mcp/' }),
        }),
      );

      const options = ref.get<McpResourceServerOptions>(MCP_RESOURCE_SERVER_OPTIONS);
      expect(options.resource).toBe('https://api.example.com/mcp');
      expect(ref.get<BearerTokenVerifier>(MCP_BEARER_TOKEN_VERIFIER)).toBeInstanceOf(JwksVerifier);

      await ref.close();
    });

    it('injects a verifier instance exported by an imported module', async () => {
      @Injectable()
      class VerifierDependency {
        readonly marker = 'imported';
      }

      @Injectable()
      class ImportedVerifier implements BearerTokenVerifier {
        constructor(@Inject(VerifierDependency) readonly dependency: VerifierDependency) {}

        async verify(): Promise<McpAuthInfo | null> {
          return null;
        }
      }

      @Module({
        providers: [VerifierDependency, ImportedVerifier],
        exports: [ImportedVerifier],
      })
      class VerifierModule {}

      const ref = await compile(
        McpAuthModule.forRootAsync({
          imports: [VerifierModule],
          inject: [ImportedVerifier],
          useFactory: (verifier: ImportedVerifier) =>
            makeJwksOptions({ jwks: undefined, verifier }),
        }),
      );

      try {
        const verifier = ref.get<BearerTokenVerifier>(MCP_BEARER_TOKEN_VERIFIER);
        expect(verifier).toBeInstanceOf(ImportedVerifier);
        expect((verifier as ImportedVerifier).dependency.marker).toBe('imported');
      } finally {
        await ref.close();
      }
    });
  });

  describe('cross-module guard resolution', () => {
    it('resolves the options and verifier across modules when the root module provides McpBearerGuard', async () => {
      const authInfo: McpAuthInfo = {
        token: 't',
        clientId: 'c',
        scopes: [],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: {},
      };
      const stubVerifier: BearerTokenVerifier = { verify: vi.fn().mockResolvedValue(authInfo) };

      // Mirrors McpModule: the guard is provided by the HOST module while the
      // options/verifier live inside the imported McpAuthModule — resolution
      // must succeed via moduleRef.get(..., { strict: false }).
      @Module({
        imports: [
          McpAuthModule.forRoot({
            verifier: stubVerifier,
            resource: 'https://api.example.com/mcp',
            authorizationServers: ['https://as.example.com'],
          }),
        ],
        providers: [McpBearerGuard],
      })
      class HostModule {}

      const ref = await Test.createTestingModule({ imports: [HostModule] }).compile();
      await ref.init();

      // select() pins the lookup to the host module's guard instance (whose
      // ModuleRef does not see the auth providers as local).
      const guard = ref.select(HostModule).get(McpBearerGuard, { strict: true });
      const req: FakeHttpRequest = { headers: { authorization: 'Bearer t' } };
      const { context } = makeExecutionContext(req);

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(stubVerifier.verify).toHaveBeenCalledWith('t');
      expect(req.auth).toBe(authInfo);

      await ref.close();
    });

    it('rejects with 500 when no McpAuthModule is imported', async () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      const ref = await Test.createTestingModule({
        providers: [McpBearerGuard],
      }).compile();
      await ref.init();

      const guard = ref.get(McpBearerGuard);
      const req: FakeHttpRequest = { headers: { authorization: 'Bearer t' } };
      const { context } = makeExecutionContext(req);

      await expect(guard.canActivate(context)).rejects.toSatisfy(
        (error: unknown) => error instanceof HttpException && error.getStatus() === 500,
      );

      await ref.close();
    });
  });
});
