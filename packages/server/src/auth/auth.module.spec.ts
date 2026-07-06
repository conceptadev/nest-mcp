// Decorators on the module class and guard execute at import time.
import 'reflect-metadata';
import { McpError } from '@nest-mcp/common';
import type { DynamicModule, FactoryProvider, ValueProvider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCP_BEARER_TOKEN_VERIFIER, MCP_RESOURCE_SERVER_OPTIONS } from './auth.constants';
import { McpAuthModule } from './auth.module';
import { McpBearerGuard } from './guards/mcp-bearer.guard';
import type { McpResourceServerOptions } from './interfaces/resource-server-options.interface';
import type { BearerTokenVerifier } from './verifiers/bearer-verifier.interface';
import { IntrospectionVerifier } from './verifiers/introspection.verifier';
import { JwksVerifier } from './verifiers/jwks.verifier';

const jwks = {
  uri: 'https://as.example.com/.well-known/jwks.json',
  issuer: 'https://as.example.com',
};

const introspection = {
  endpoint: 'https://as.example.com/introspect',
  clientId: 'client-id',
  clientSecret: 'client-secret',
};

function makeOptions(overrides: Partial<McpResourceServerOptions> = {}): McpResourceServerOptions {
  return {
    resource: 'https://mcp.example.com/mcp',
    authorizationServers: ['https://as.example.com'],
    jwks,
    ...overrides,
  };
}

function findProvider(module: DynamicModule, token: unknown) {
  return (module.providers ?? []).find((provider) =>
    typeof provider === 'object' && provider !== null && 'provide' in provider
      ? provider.provide === token
      : false,
  );
}

type VerifierFactory = (
  options: McpResourceServerOptions,
  moduleRef: ModuleRef,
) => Promise<BearerTokenVerifier>;

function getVerifierFactory(module: DynamicModule): {
  factory: VerifierFactory;
  inject: unknown[];
} {
  const provider = findProvider(module, MCP_BEARER_TOKEN_VERIFIER) as FactoryProvider;
  return { factory: provider.useFactory as VerifierFactory, inject: provider.inject ?? [] };
}

describe('McpAuthModule', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('forRoot() validation', () => {
    it('throws McpError for an invalid resource URL', () => {
      expect(() => McpAuthModule.forRoot(makeOptions({ resource: 'not a url' }))).toThrow(McpError);
      expect(() => McpAuthModule.forRoot(makeOptions({ resource: 'not a url' }))).toThrow(
        'is not a valid resource URL',
      );
    });

    it('throws McpError when authorizationServers is empty', () => {
      expect(() => McpAuthModule.forRoot(makeOptions({ authorizationServers: [] }))).toThrow(
        McpError,
      );
      expect(() => McpAuthModule.forRoot(makeOptions({ authorizationServers: [] }))).toThrow(
        'authorizationServers must list at least one',
      );
    });

    it('throws McpError when authorizationServers is missing', () => {
      const options = makeOptions({
        authorizationServers: undefined as unknown as string[],
      });
      expect(() => McpAuthModule.forRoot(options)).toThrow(McpError);
    });

    it('throws McpError when no verifier source is configured', () => {
      const options = makeOptions();
      options.jwks = undefined;
      expect(() => McpAuthModule.forRoot(options)).toThrow(McpError);
      expect(() => McpAuthModule.forRoot(options)).toThrow(
        'configure exactly one of "verifier", "jwks", or "introspection"',
      );
    });

    it('throws McpError when two verifier sources are configured', () => {
      expect(() => McpAuthModule.forRoot(makeOptions({ introspection }))).toThrow(McpError);
      expect(() => McpAuthModule.forRoot(makeOptions({ introspection }))).toThrow(
        'configure exactly one of',
      );
    });

    it('logs a warning but does not throw when validateAudience is false', () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

      expect(() => McpAuthModule.forRoot(makeOptions({ validateAudience: false }))).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('validateAudience is disabled'));
    });

    it('does not warn when validateAudience is left enabled', () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

      McpAuthModule.forRoot(makeOptions());
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('forRoot() canonicalization', () => {
    it('stores the canonicalized resource in the options provider', () => {
      const module = McpAuthModule.forRoot(
        makeOptions({ resource: 'https://Host.example.com/mcp/' }),
      );
      const provider = findProvider(module, MCP_RESOURCE_SERVER_OPTIONS) as ValueProvider;

      expect(provider).toBeDefined();
      expect('useValue' in provider).toBe(true);
      const value = provider.useValue as McpResourceServerOptions;
      expect(value.resource).toBe('https://host.example.com/mcp');
      // Remaining options pass through untouched.
      expect(value.authorizationServers).toEqual(['https://as.example.com']);
      expect(value.jwks).toEqual(jwks);
    });
  });

  describe('verifier provider factory', () => {
    const fakeModuleRef = { create: vi.fn() } as unknown as ModuleRef;

    it('declares useFactory with the options and ModuleRef injected', () => {
      const { inject } = getVerifierFactory(McpAuthModule.forRoot(makeOptions()));
      expect(inject).toEqual([MCP_RESOURCE_SERVER_OPTIONS, ModuleRef]);
    });

    it('builds a JwksVerifier from jwks config', async () => {
      const { factory } = getVerifierFactory(McpAuthModule.forRoot(makeOptions()));
      await expect(factory(makeOptions(), fakeModuleRef)).resolves.toBeInstanceOf(JwksVerifier);
    });

    it('builds an IntrospectionVerifier from introspection config', async () => {
      const options = makeOptions({ jwks: undefined, introspection });
      const { factory } = getVerifierFactory(McpAuthModule.forRoot(options));
      await expect(factory(options, fakeModuleRef)).resolves.toBeInstanceOf(IntrospectionVerifier);
    });

    it('returns a verifier instance as-is', async () => {
      const instance: BearerTokenVerifier = { verify: vi.fn() };
      const options = makeOptions({ jwks: undefined, verifier: instance });
      const { factory } = getVerifierFactory(McpAuthModule.forRoot(options));
      const moduleRef = { create: vi.fn() };

      await expect(factory(options, moduleRef as unknown as ModuleRef)).resolves.toBe(instance);
      expect(moduleRef.create).not.toHaveBeenCalled();
    });

    it('instantiates a verifier class through moduleRef.create', async () => {
      class CustomVerifier implements BearerTokenVerifier {
        verify = vi.fn();
      }
      const sentinel = new CustomVerifier();
      const moduleRef = { create: vi.fn().mockResolvedValue(sentinel) };
      const options = makeOptions({ jwks: undefined, verifier: CustomVerifier });
      const { factory } = getVerifierFactory(McpAuthModule.forRoot(options));

      await expect(factory(options, moduleRef as unknown as ModuleRef)).resolves.toBe(sentinel);
      expect(moduleRef.create).toHaveBeenCalledWith(CustomVerifier);
    });
  });

  describe('forRoot() module shape', () => {
    it('registers exactly one controller class', () => {
      const module = McpAuthModule.forRoot(makeOptions());
      expect(module.controllers).toHaveLength(1);
      expect(typeof module.controllers?.[0]).toBe('function');
      expect(Reflect.getMetadata('path', module.controllers?.[0] as object)).toBe('.well-known');
    });

    it('exports the options token, verifier token, and McpBearerGuard', () => {
      const module = McpAuthModule.forRoot(makeOptions());
      expect(module.exports).toEqual([
        MCP_RESOURCE_SERVER_OPTIONS,
        MCP_BEARER_TOKEN_VERIFIER,
        McpBearerGuard,
      ]);
    });

    it('provides McpBearerGuard', () => {
      const module = McpAuthModule.forRoot(makeOptions());
      expect(module.providers).toContain(McpBearerGuard);
    });

    it('applies controllerDecorators to the well-known controller', () => {
      const marker: ClassDecorator = (target) => {
        Reflect.defineMetadata('test:marker', true, target);
      };
      const module = McpAuthModule.forRoot(makeOptions({ controllerDecorators: [marker] }));
      expect(Reflect.getMetadata('test:marker', module.controllers?.[0] as object)).toBe(true);
    });
  });

  describe('forRootAsync()', () => {
    it('passes imports and inject through', () => {
      class FakeConfigModule {}
      const imports = [FakeConfigModule];
      const module = McpAuthModule.forRootAsync({
        imports,
        useFactory: () => makeOptions(),
        inject: ['CONFIG'],
      });

      expect(module.imports).toBe(imports);
      const provider = findProvider(module, MCP_RESOURCE_SERVER_OPTIONS) as FactoryProvider;
      expect(provider.inject).toEqual(['CONFIG']);
    });

    it('defaults imports and inject to empty arrays', () => {
      const module = McpAuthModule.forRootAsync({ useFactory: () => makeOptions() });
      expect(module.imports).toEqual([]);
      const provider = findProvider(module, MCP_RESOURCE_SERVER_OPTIONS) as FactoryProvider;
      expect(provider.inject).toEqual([]);
    });

    it('forwards injected args to the user factory', async () => {
      const userFactory = vi.fn().mockResolvedValue(makeOptions());
      const module = McpAuthModule.forRootAsync({ useFactory: userFactory, inject: ['CONFIG'] });
      const provider = findProvider(module, MCP_RESOURCE_SERVER_OPTIONS) as FactoryProvider;

      await provider.useFactory('injected-config');
      expect(userFactory).toHaveBeenCalledWith('injected-config');
    });

    it('rejects with McpError when the factory returns an invalid config', async () => {
      const module = McpAuthModule.forRootAsync({
        useFactory: () => makeOptions({ authorizationServers: [] }),
      });
      const provider = findProvider(module, MCP_RESOURCE_SERVER_OPTIONS) as FactoryProvider;

      await expect(provider.useFactory()).rejects.toThrow(McpError);
      await expect(provider.useFactory()).rejects.toThrow('authorizationServers');
    });

    it('resolves with the canonicalized resource for a valid async config', async () => {
      const module = McpAuthModule.forRootAsync({
        useFactory: async () => makeOptions({ resource: 'https://Host.example.com/mcp/' }),
      });
      const provider = findProvider(module, MCP_RESOURCE_SERVER_OPTIONS) as FactoryProvider;

      const resolved = (await provider.useFactory()) as McpResourceServerOptions;
      expect(resolved.resource).toBe('https://host.example.com/mcp');
      expect(resolved.authorizationServers).toEqual(['https://as.example.com']);
    });

    it('registers the verifier provider, guard, controller, and exports', () => {
      const module = McpAuthModule.forRootAsync({ useFactory: () => makeOptions() });
      expect(findProvider(module, MCP_BEARER_TOKEN_VERIFIER)).toBeDefined();
      expect(module.providers).toContain(McpBearerGuard);
      expect(module.controllers).toHaveLength(1);
      expect(module.exports).toEqual([
        MCP_RESOURCE_SERVER_OPTIONS,
        MCP_BEARER_TOKEN_VERIFIER,
        McpBearerGuard,
      ]);
    });

    it('applies static controllerDecorators to the well-known controller', () => {
      const marker: ClassDecorator = (target) => {
        Reflect.defineMetadata('test:marker', true, target);
      };
      const module = McpAuthModule.forRootAsync({
        useFactory: () => makeOptions(),
        controllerDecorators: [marker],
      });
      expect(Reflect.getMetadata('test:marker', module.controllers?.[0] as object)).toBe(true);
    });
  });
});
