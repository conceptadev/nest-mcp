# McpAuthModule — OAuth resource server

`@nest-mcp/server` implements the **resource-server role** of the
[MCP authorization spec (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization):

- verifies externally issued bearer tokens (JWKS, RFC 7662 introspection, or a
  custom verifier) with **audience validation on by default**,
- serves RFC 9728 protected-resource metadata at
  `/.well-known/oauth-protected-resource` (root and path-insertion variants),
- challenges unauthenticated requests with an SDK-compatible
  `WWW-Authenticate` header, and
- binds stateful sessions to the principal that initialized them.

Token **issuance** is the authorization server's job, not the MCP server's.
Bring an external IdP (Auth0, Keycloak, WorkOS, Azure AD, …) or run your own
AS — see the recipes below.

## Setup

```typescript
import { Module } from '@nestjs/common';
import { McpAuthModule, McpModule, McpTransportType } from '@nest-mcp/server';

@Module({
  imports: [
    McpModule.forRoot({
      name: 'my-server',
      version: '1.0.0',
      transport: McpTransportType.STREAMABLE_HTTP,
      transportOptions: {
        streamableHttp: {
          endpoint: '/mcp',
          oauth: { enabled: true }, // apply McpBearerGuard to the endpoint
        },
      },
    }),
    McpAuthModule.forRoot({
      resource: 'https://mcp.example.com/mcp',
      authorizationServers: ['https://tenant.auth0.com'],
      jwks: {
        uri: 'https://tenant.auth0.com/.well-known/jwks.json',
        issuer: 'https://tenant.auth0.com/',
        audience: 'https://mcp.example.com/mcp',
      },
      scopesSupported: ['tools:read', 'tools:write'],
    }),
  ],
})
export class AppModule {}
```

That is the whole authorization surface. Clients discover the authorization
server through the protected-resource metadata, obtain a token from it, and
present it as `Authorization: Bearer <token>`.

## Options (`McpResourceServerOptions`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `resource` | `string` | — | Canonical URL of this MCP server (the RFC 8707 resource identifier). Set explicitly; never derived from request headers. Canonicalized at bootstrap. |
| `authorizationServers` | `string[]` | — | Issuer URLs advertised in the protected-resource metadata. |
| `jwks` | `object` | — | Built-in JWT verifier: `{ uri, issuer, audience?, algorithms? }`. Requires the optional `jose` peer dependency. |
| `introspection` | `object` | — | Built-in RFC 7662 verifier: `{ endpoint, clientId, clientSecret, cacheTtlMs?, cacheMaxEntries? }`. |
| `verifier` | class \| instance | — | Custom `BearerTokenVerifier`. Exactly one of `verifier`/`jwks`/`introspection` must be set. |
| `required` | `boolean` | `true` | When `false`, requests without an `Authorization` header pass anonymously; a present-but-invalid token is still rejected. |
| `requiredScopes` | `string[]` | `[]` | Scopes every request must carry; missing scopes yield `403 insufficient_scope`. |
| `validateAudience` | `boolean` | `true` | Audience binding in the built-in verifiers. Disabling logs a warning — the MCP spec requires servers to only accept tokens issued for them. |
| `scopesSupported` | `string[]` | — | Advertised in the metadata. |
| `resourceName` | `string` | — | Advertised as `resource_name`. |
| `legacyOAuthMetadata` | `object` | — | Optional RFC 8414 document mirrored at `/.well-known/oauth-authorization-server` for pre-2025-06-18 clients. |
| `controllerDecorators` | `ClassDecorator[]` | `[]` | Extra class decorators applied to the generated `.well-known` controller (e.g. `@ApiExcludeController()`). Applied with standard semantics (`Reflect.decorate`). |

`forRootAsync({ imports, useFactory, inject, controllerDecorators })` is
available when options come from DI (e.g. `ConfigService`). The controller
class is created when the module is defined — before the factory runs — so
`controllerDecorators` sits on the async options object; setting it in the
factory result has no effect.

## App-wide auth guards (`@IsMcpPublic` / `isMcpPublic`)

Every controller nest-mcp generates — the transport endpoint and the
`.well-known` discovery controllers — is stamped with `@IsMcpPublic()`
(`MCP_HTTP_PUBLIC_METADATA`): RFC 9728/8414 discovery documents are public by
spec, and the MCP endpoint authenticates via the MCP authorization spec
(`McpBearerGuard`), never via an app session.

If your application registers a global auth guard (session cookies, API keys,
…), exempt these routes by honoring the marker with `isMcpPublic`:

```typescript
import { isMcpPublic } from '@nest-mcp/server';

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(private readonly inner: SessionAuthGuard) {}

  canActivate(context: ExecutionContext) {
    if (isMcpPublic(context)) return true; // MCP routes handle their own auth
    return this.inner.canActivate(context);
  }
}
```

Not to be confused with the per-tool `@Public()` decorator, which bypasses
nest-mcp's own guard pipeline for a single tool/resource/prompt.

### Transport gate

`transportOptions.streamableHttp.oauth = { enabled, bindSessionToUser? }` and
`transportOptions.sse.oauth = { enabled }` apply `McpBearerGuard` to the
generated controllers. With `bindSessionToUser` (default on), each stateful
streamable session is bound to the `sub`/`client_id` that initialized it and
other principals get `403` — sessions never substitute for authentication.

### Wire behavior

The guard's observable behavior matches the official SDK's `requireBearerAuth`
middleware byte-for-byte, so every SDK-based client (Claude, MCP Inspector, …)
parses it natively:

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token", error_description="Missing Authorization header", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"
Content-Type: application/json

{"error":"invalid_token","error_description":"Missing Authorization header"}
```

`403 insufficient_scope` is returned when `requiredScopes` are missing;
verifier failures map to RFC 6749 error bodies.

## Recipe A — external IdP via JWKS (Auth0, Keycloak, …)

Install the optional verifier dependency once: `pnpm add jose`.

```typescript
// Auth0
McpAuthModule.forRoot({
  resource: 'https://mcp.example.com/mcp',
  authorizationServers: ['https://tenant.auth0.com'],
  jwks: {
    uri: 'https://tenant.auth0.com/.well-known/jwks.json',
    issuer: 'https://tenant.auth0.com/',
    audience: 'https://mcp.example.com/mcp', // the API identifier you created in Auth0
  },
});

// Keycloak (realm "mcp")
McpAuthModule.forRoot({
  resource: 'https://mcp.example.com/mcp',
  authorizationServers: ['https://keycloak.example.com/realms/mcp'],
  jwks: {
    uri: 'https://keycloak.example.com/realms/mcp/protocol/openid-connect/certs',
    issuer: 'https://keycloak.example.com/realms/mcp',
  },
});
```

When `audience` is omitted, the token's `aud` claim must identify the
configured `resource` exactly (case/trailing-slash differences are
tolerated via canonicalization). A broader audience — e.g. the bare origin
for a pathful resource — is rejected: the MCP spec requires servers to only
accept tokens issued specifically for them. If your authorization server
uses a different audience convention, set `audience` explicitly. Symmetric
algorithms (`HS*`) are never accepted by the JWKS verifier — that is what
custom verifiers are for. JWKS/introspection *infrastructure* failures
(network errors, AS outages) surface as `500 server_error` rather than
`401`, so clients retry instead of discarding their tokens.

For opaque tokens, use introspection instead of `jwks`:

```typescript
McpAuthModule.forRoot({
  resource: 'https://mcp.example.com/mcp',
  authorizationServers: ['https://as.example.com'],
  introspection: {
    endpoint: 'https://as.example.com/oauth/introspect',
    clientId: 'mcp-resource-server',
    clientSecret: process.env.INTROSPECTION_SECRET!,
  },
});
```

## Recipe B — custom verifier

Anything implementing `BearerTokenVerifier` can be plugged in — as an instance
or a DI-instantiated class. Return `null` for invalid tokens, or throw an
`OAuthError` subclass from `@modelcontextprotocol/sdk/server/auth/errors.js`
to control the exact error response.

```typescript
import type { BearerTokenVerifier, McpAuthInfo } from '@nest-mcp/server';
import { jwtVerify } from 'jose';

/** Example: HS256 shared-secret JWTs issued by an in-house service. */
class SharedSecretVerifier implements BearerTokenVerifier {
  private readonly key = new TextEncoder().encode(process.env.TOKEN_SECRET!);

  async verify(token: string): Promise<McpAuthInfo | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: 'https://auth.internal.example.com',
        audience: 'https://mcp.example.com/mcp',
        algorithms: ['HS256'],
      });
      return {
        token,
        clientId: (payload.azp as string) ?? '',
        scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
        expiresAt: payload.exp,
        extra: { ...payload },
      };
    } catch {
      return null;
    }
  }
}

McpAuthModule.forRoot({
  resource: 'https://mcp.example.com/mcp',
  authorizationServers: ['https://auth.internal.example.com'],
  verifier: new SharedSecretVerifier(), // or the class itself for DI construction
});
```


## Recipe C — your own authorization server (user-land)

The MCP server stays a pure resource server even when *you* operate the AS.
Run the AS as its own controllers in the same Nest app (or a separate
service), point the metadata at it, and verify your own tokens:

```typescript
McpAuthModule.forRoot({
  resource: 'https://mcp.example.com/mcp',
  // your AS — its RFC 8414 metadata lives at
  // https://mcp.example.com/.well-known/oauth-authorization-server
  authorizationServers: ['https://mcp.example.com'],
  jwks: {
    uri: 'https://mcp.example.com/oauth/jwks.json',
    issuer: 'https://mcp.example.com',
  },
  // serve the AS metadata mirror for pre-2025-06-18 clients
  legacyOAuthMetadata: {
    issuer: 'https://mcp.example.com',
    authorization_endpoint: 'https://mcp.example.com/oauth/authorize',
    token_endpoint: 'https://mcp.example.com/oauth/token',
    registration_endpoint: 'https://mcp.example.com/oauth/register',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  },
});
```

For the AS implementation itself the official SDK ships RFC-correct building
blocks — `mcpAuthRouter` (Express), the `OAuthServerProvider` contract, and
`ProxyOAuthServerProvider` for fronting an upstream IdP (see
`@modelcontextprotocol/sdk/server/auth/router.js`). Mount it under your Nest
app's Express adapter, or implement the endpoints as regular Nest controllers.
Checklist for MCP clients to work: S256-only PKCE, RFC 7591 dynamic client
registration, RFC 6749 error bodies, and `aud` set to the MCP `resource`.

## Recipe D — optional auth + per-tool authorization

With `required: false`, anonymous requests reach the MCP layer without
`authInfo`. Combine with the per-item authorization layer to keep specific
capabilities members-only — enforcement happens at call time, and with
`filterListsByScopes: true` (default `false`) list responses only show items
the caller's scopes allow:

```typescript
import { McpAuthenticatedGuard, Public, Scopes, Tool } from '@nest-mcp/server';

McpModule.forRoot({
  // ...
  guards: [McpAuthenticatedGuard], // a false return denies every non-@Public item
  filterListsByScopes: true,       // hide items the caller's scopes don't cover
});

@Tool({ name: 'status' })
@Public() // anonymous OK — global guards run but cannot deny @Public items
getStatus() { /* ... */ }

@Tool({ name: 'reports' })
@Scopes(['reports:read']) // needs a token with this scope
getReports() { /* ... */ }
```

The verified identity is available to handlers and guards as
`ctx.authInfo` (raw `McpAuthInfo`) and `ctx.user` (mapped principal). See
[auth decorators](./auth-decorators.md) for `@Public`, `@Scopes`, `@Roles`,
and custom `@Guards`.

> The raw bearer token is exposed on `ctx.authInfo.token` for parity with the
> SDK's `AuthInfo`. Never forward it to upstream services — the MCP spec
> forbids token passthrough; obtain downstream credentials with a separate
> grant instead.

## Discovery endpoints

| Endpoint | Contents |
| --- | --- |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 metadata for the configured `resource` |
| `GET /.well-known/oauth-protected-resource/<resource-path>` | Path-insertion variant — served only for the configured resource's path (404 otherwise) |
| `GET /.well-known/oauth-authorization-server` | The `legacyOAuthMetadata` mirror, when configured (else 404) |

Responses are cacheable (`Cache-Control: public, max-age=3600`) and
CORS-readable (`Access-Control-Allow-Origin: *`), and the protected-resource
document is validated against the SDK's RFC 9728 schema at bootstrap.
Configure clients with the canonical resource URL (no trailing slash) —
strict RFC 9728 clients verify the document's `resource` is identical to the
identifier they queried.

## Verifying a setup

```bash
# 1. Metadata is served and points at your AS
curl -s http://localhost:3000/.well-known/oauth-protected-resource/mcp | jq

# 2. Unauthenticated requests get a parseable challenge
curl -si -X POST http://localhost:3000/mcp | grep -i www-authenticate

# 3. A token from your AS is accepted
curl -s -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) runs
the full discovery + OAuth flow against the server and is the quickest
end-to-end check.

## Migrating from the embedded authorization server (≤0.7.x)

Versions up to 0.7.x shipped a built-in OAuth authorization server
(`/authorize`, `/token`, `/register`, `/revoke`, `/introspect`, JWT issuance,
GitHub/Azure provider adapters). It was removed in favor of the
resource-server model above; see the 0.8.0 changeset for the full
removed-export → replacement table.
