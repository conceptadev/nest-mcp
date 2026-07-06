import { OAuthProtectedResourceMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { McpError } from '@nest-mcp/common';
import { type DynamicModule, Logger, Module, type Provider } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MCP_BEARER_TOKEN_VERIFIER, MCP_RESOURCE_SERVER_OPTIONS } from './auth.constants';
import { McpBearerGuard } from './guards/mcp-bearer.guard';
import type {
  McpResourceServerAsyncOptions,
  McpResourceServerOptions,
} from './interfaces/resource-server-options.interface';
import { canonicalizeResourceUri } from './utils/resource-url.util';
import type { BearerTokenVerifier } from './verifiers/bearer-verifier.interface';
import { IntrospectionVerifier } from './verifiers/introspection.verifier';
import { JwksVerifier } from './verifiers/jwks.verifier';
import { createWellKnownController } from './well-known.controller';

const logger = new Logger('McpAuthModule');

/**
 * Canonicalizes the resource URL, enforces the option invariants, and
 * validates the resulting RFC 9728 document against the SDK schema so
 * misconfiguration fails at bootstrap rather than at client discovery.
 */
function validateAuthOptions(options: McpResourceServerOptions): McpResourceServerOptions {
  const resource = canonicalizeResourceUri(options.resource);

  if (!options.authorizationServers?.length) {
    throw new McpError(
      'McpAuthModule: authorizationServers must list at least one authorization server issuer URL',
    );
  }

  const verifierSources = [options.verifier, options.jwks, options.introspection].filter(
    (source) => source !== undefined,
  );
  if (verifierSources.length !== 1) {
    throw new McpError(
      'McpAuthModule: configure exactly one of "verifier", "jwks", or "introspection"',
    );
  }

  if (options.validateAudience === false) {
    logger.warn(
      'validateAudience is disabled — the MCP spec requires servers to only accept tokens ' +
        'issued specifically for them. Only do this when the verifier enforces audience itself.',
    );
  }

  const parsed = OAuthProtectedResourceMetadataSchema.safeParse({
    resource,
    authorization_servers: options.authorizationServers,
    scopes_supported: options.scopesSupported,
    bearer_methods_supported: ['header'],
    resource_name: options.resourceName,
  });
  if (!parsed.success) {
    throw new McpError(
      `McpAuthModule: invalid protected-resource metadata — ${parsed.error.message}`,
    );
  }

  return { ...options, resource };
}

async function createVerifier(
  options: McpResourceServerOptions,
  moduleRef: ModuleRef,
): Promise<BearerTokenVerifier> {
  if (options.verifier) {
    return typeof options.verifier === 'function'
      ? moduleRef.create(options.verifier)
      : options.verifier;
  }

  const validateAudience = options.validateAudience !== false;
  if (options.jwks) {
    return new JwksVerifier(options.jwks, options.resource, validateAudience);
  }
  if (options.introspection) {
    return new IntrospectionVerifier(options.introspection, options.resource, validateAudience);
  }
  // Unreachable after validateAuthOptions; defensive for direct factory misuse.
  throw new McpError('McpAuthModule: no token verifier configured');
}

const verifierProvider: Provider = {
  provide: MCP_BEARER_TOKEN_VERIFIER,
  useFactory: (options: McpResourceServerOptions, moduleRef: ModuleRef) =>
    createVerifier(options, moduleRef),
  inject: [MCP_RESOURCE_SERVER_OPTIONS, ModuleRef],
};

const moduleExports = [MCP_RESOURCE_SERVER_OPTIONS, MCP_BEARER_TOKEN_VERIFIER, McpBearerGuard];

/**
 * MCP resource-server module (MCP authorization spec 2025-06-18): serves
 * RFC 9728 protected-resource metadata and provides the bearer-token
 * verifier consumed by `McpBearerGuard` on the HTTP transports. Token
 * issuance is the authorization server's job — bring an external IdP
 * (Auth0, Keycloak, …) or your own AS and point `authorizationServers` at it.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS requires module classes
export class McpAuthModule {
  static forRoot(options: McpResourceServerOptions): DynamicModule {
    const normalized = validateAuthOptions(options);

    return {
      module: McpAuthModule,
      providers: [
        { provide: MCP_RESOURCE_SERVER_OPTIONS, useValue: normalized },
        verifierProvider,
        McpBearerGuard,
      ],
      controllers: [createWellKnownController(options.controllerDecorators)],
      exports: moduleExports,
    };
  }

  static forRootAsync(options: McpResourceServerAsyncOptions): DynamicModule {
    return {
      module: McpAuthModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: MCP_RESOURCE_SERVER_OPTIONS,
          useFactory: async (...args: unknown[]) =>
            validateAuthOptions(await options.useFactory(...args)),
          inject: options.inject ?? [],
        },
        verifierProvider,
        McpBearerGuard,
      ],
      // The controller class is created at module-definition time, so the
      // decorators come from the static async options, never the factory result.
      controllers: [createWellKnownController(options.controllerDecorators)],
      exports: moduleExports,
    };
  }
}
