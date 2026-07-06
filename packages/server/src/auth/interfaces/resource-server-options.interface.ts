import type { Type } from '@nestjs/common';
import type { BearerTokenVerifier } from '../verifiers/bearer-verifier.interface';

/** JWKS-based verification of asymmetrically signed JWT access tokens. */
export interface JwksVerifierOptions {
  /** Remote JWKS endpoint, e.g. `https://tenant.auth0.com/.well-known/jwks.json`. */
  uri: string;
  /** Required `iss` claim — the authorization server's issuer identifier. */
  issuer: string;
  /**
   * Expected `aud` claim. When omitted, the `aud` claim is matched against
   * the configured `resource` URL instead (RFC 8707 semantics).
   */
  audience?: string;
  /**
   * Allowed signature algorithms. Defaults to the common asymmetric set;
   * symmetric (`HS*`) and `none` are never accepted — shared-secret setups
   * belong in a custom `verifier`.
   */
  algorithms?: string[];
}

/** RFC 7662 token-introspection verification of opaque access tokens. */
export interface IntrospectionVerifierOptions {
  /** The authorization server's introspection endpoint. */
  endpoint: string;
  /** Client credentials this resource server authenticates with (HTTP Basic). */
  clientId: string;
  clientSecret: string;
  /** How long introspection results are cached. Default 60_000 ms. */
  cacheTtlMs?: number;
  /** Maximum cached results (oldest evicted first). Default 1000. */
  cacheMaxEntries?: number;
}

/**
 * Configuration for the MCP resource-server role (MCP authorization spec
 * 2025-06-18): verify externally issued bearer tokens, serve RFC 9728
 * protected-resource metadata, and challenge unauthenticated requests.
 *
 * Exactly one of `verifier`, `jwks`, or `introspection` must be provided.
 */
export interface McpResourceServerOptions {
  /**
   * Canonical URL of this MCP server (the RFC 8707 resource identifier),
   * e.g. `https://mcp.example.com/mcp`. Set explicitly — it is never derived
   * from request headers. Canonicalized at bootstrap (lowercased scheme/host,
   * no fragment, no trailing slash).
   */
  resource: string;
  /** Issuer URLs of the authorization servers that protect this resource. */
  authorizationServers: string[];
  /** Scopes advertised in the protected-resource metadata. */
  scopesSupported?: string[];
  /** Scopes every request must carry; missing scopes yield 403 `insufficient_scope`. */
  requiredScopes?: string[];
  /** Custom token verifier (class or instance). */
  verifier?: Type<BearerTokenVerifier> | BearerTokenVerifier;
  /** Built-in JWKS verifier for JWT access tokens. */
  jwks?: JwksVerifierOptions;
  /** Built-in RFC 7662 introspection verifier for opaque access tokens. */
  introspection?: IntrospectionVerifierOptions;
  /**
   * When false, requests without an Authorization header pass through
   * anonymously (a present-but-invalid token is still rejected). Default true.
   */
  required?: boolean;
  /**
   * Enforce that tokens are bound to this resource (`aud` validation) in the
   * built-in verifiers. Default true; disabling logs a loud warning — the MCP
   * spec requires servers to only accept tokens issued for them.
   */
  validateAudience?: boolean;
  /** Human-readable name advertised as PRM `resource_name`. */
  resourceName?: string;
  /**
   * Optional RFC 8414 authorization-server metadata document mirrored at
   * `/.well-known/oauth-authorization-server` for clients that predate the
   * 2025-06-18 discovery flow. Served verbatim; omitted → 404.
   */
  legacyOAuthMetadata?: Record<string, unknown>;
  /**
   * Class decorators applied to the generated `.well-known` controller —
   * e.g. an `@AllowAnonymous()`-style marker so an app-wide auth guard lets
   * anonymous discovery requests through (RFC 9728 metadata must be publicly
   * readable). Applied when the module is defined, so with
   * `McpAuthModule.forRootAsync` set them on the async options object, not in
   * the factory result (where they are ignored).
   */
  controllerDecorators?: ClassDecorator[];
}

export interface McpResourceServerAsyncOptions {
  /** Modules whose exported providers the factory may inject. */
  // biome-ignore lint/suspicious/noExplicitAny: NestJS DynamicModule requires broad module types
  imports?: any[];
  // biome-ignore lint/suspicious/noExplicitAny: NestJS factory pattern requires broad parameter types
  useFactory: (...args: any[]) => McpResourceServerOptions | Promise<McpResourceServerOptions>;
  // biome-ignore lint/suspicious/noExplicitAny: NestJS injection tokens have broad types
  inject?: any[];
  /**
   * Class decorators applied to the generated `.well-known` controller. The
   * controller class is created when the module is defined — before the
   * factory runs — so these must be static; `controllerDecorators` in the
   * factory result is ignored.
   */
  controllerDecorators?: ClassDecorator[];
}
