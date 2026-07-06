# Recipe: better-auth as your authorization server

`McpAuthModule` is an OAuth **resource server** — it validates bearer tokens but
never issues them. If your NestJS app already authenticates users with
[better-auth](https://better-auth.com), its `mcp` plugin can play the
**authorization server** role: dynamic client registration, the authorization-code
flow reusing your existing login page, and opaque token issuance. Together they
give MCP clients (Claude Desktop custom connectors, MCP Inspector, …) a complete
spec-compliant OAuth flow with roughly one page of glue.

```
 MCP client                your NestJS app
 ────┬─────      ┌──────────────────────────────────────────┐
     │           │  better-auth `mcp` plugin                │
     │  OAuth    │  AUTHORIZATION SERVER                    │
     │◀─────────▶│  /api/auth/mcp/{register,authorize,token}│
     │           │        ▲ getMcpSession(token)            │
     │  Bearer   │        │                                 │
     │◀─────────▶│  @nest-mcp/server                        │
     │  JSON-RPC │  RESOURCE SERVER + transport             │
     │           │  /mcp + /.well-known/*                   │
     └           └──────────────────────────────────────────┘
```

Requires `@nest-mcp/server@^0.8.0` and `better-auth@^1.6`.

## 1. Register the `mcp` plugin (authorization server)

```typescript
// auth.ts
import { betterAuth } from 'better-auth';
import { mcp } from 'better-auth/plugins';

export const auth = betterAuth({
  baseURL: env.API_URL,
  // …your existing config…
  plugins: [
    mcp({
      loginPage: `${env.WEB_URL}/login`,   // your existing login UI
      resource: `${env.API_URL}/mcp`,      // RFC 8707 audience for issued tokens
    }),
  ],
});
```

This serves `POST /api/auth/mcp/register` (RFC 7591 dynamic client registration),
`GET /api/auth/mcp/authorize`, and `POST /api/auth/mcp/token`, backed by three new
tables (`oauthApplication`, `oauthAccessToken`, `oauthConsent`) — regenerate your
schema with the better-auth CLI and migrate.

Two behaviors worth knowing:

- **Login bounce.** An unauthenticated authorize request redirects to `loginPage`
  *with the original OAuth query appended*. After sign-in, your login page must
  redirect back to `${API_URL}/api/auth/mcp/authorize?<same query>` (detect the
  bounce by the `client_id` search param). The target is your own fixed origin and
  path, so this is not an open redirect.
- **No consent screen needed.** better-auth only prompts for consent when a client
  sends `prompt=consent`; MCP clients don't.

## 2. Bridge tokens with a custom verifier (resource server)

better-auth issues **opaque** tokens, so the built-in `jwks`/`introspection`
verifiers don't apply — a custom `BearerTokenVerifier` resolves them with one call:

```typescript
// better-auth-token.verifier.ts
import { Injectable } from '@nestjs/common';
import type { BearerTokenVerifier, McpAuthInfo } from '@nest-mcp/server';
import { auth } from './auth';

@Injectable()
export class BetterAuthTokenVerifier implements BearerTokenVerifier {
  async verify(token: string): Promise<McpAuthInfo | null> {
    const session = await auth.api.getMcpSession({
      headers: new Headers({ authorization: `Bearer ${token}` }),
    });
    // One lookup covers unknown, revoked, and malformed tokens. McpBearerGuard
    // requires a numeric expiresAt and enforces expiry itself, so a row without
    // one is invalid rather than immortal.
    if (!session?.userId || !session.clientId || !session.accessTokenExpiresAt) return null;

    return {
      token,
      clientId: session.clientId,
      scopes: session.scopes?.split(' ').filter(Boolean) ?? [],
      expiresAt: Math.floor(new Date(session.accessTokenExpiresAt).getTime() / 1000),
      extra: { sub: session.userId },   // → ctx.user.id in tool handlers
    };
  }
}
```

## 3. Wire the modules

```typescript
// mcp-server.module.ts
@Module({
  imports: [
    McpModule.forRoot({
      name: 'my-server',
      version: '1.0.0',
      transport: McpTransportType.STREAMABLE_HTTP,
      transportOptions: {
        streamableHttp: { endpoint: '/mcp', stateless: true, oauth: { enabled: true } },
      },
    }),
    McpAuthModule.forRootAsync({
      useFactory: async () => {
        // Mirror better-auth's own RFC 8414 document at the origin root instead of
        // hand-writing endpoint URLs: MCP clients resolve the AS from the origin,
        // while better-auth serves its metadata under /api/auth/*. Fetching it
        // in-process at bootstrap means the advertised URLs can never drift.
        const response = await auth.handler(
          new Request(`${env.API_URL}/api/auth/.well-known/oauth-authorization-server`),
        );
        if (!response.ok) throw new Error('better-auth mcp plugin not registered?');
        return {
          resource: `${env.API_URL}/mcp`,
          authorizationServers: [env.API_URL],
          verifier: BetterAuthTokenVerifier,
          required: true,
          legacyOAuthMetadata: (await response.json()) as Record<string, unknown>,
        };
      },
    }),
  ],
  providers: [BetterAuthTokenVerifier, MyTools],
})
export class McpServerModule {}
```

## 4. If your app has a global auth guard

better-auth apps typically guard every route with a session guard. nest-mcp's
generated controllers are stamped [`@IsMcpPublic()`](./auth.md#app-wide-auth-guards-ismcppublic--ismcppublic)
— honor it and delegate the rest:

```typescript
@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(private readonly session: YourSessionGuard) {}
  canActivate(context: ExecutionContext) {
    if (isMcpPublic(context)) return true;  // /mcp is bearer-guarded; /.well-known is public by spec
    return this.session.canActivate(context);
  }
}
```

Also note: nest-mcp threads your app's globally parsed JSON body to the MCP SDK
automatically (≥ 0.8.0), so a global `express.json()` needs no special handling,
and browser-based MCP clients need non-credentialed CORS on `/mcp` +
`/.well-known` (allow `authorization`, `mcp-session-id`, `mcp-protocol-version`
headers).

## 5. Verify

```bash
# 401 challenge pointing at the discovery document
curl -si -X POST $API_URL/mcp -H 'content-type: application/json' -d '{}' | grep -i www-auth

# both discovery documents anonymous
curl -s $API_URL/.well-known/oauth-protected-resource/mcp | jq .authorization_servers
curl -s $API_URL/.well-known/oauth-authorization-server | jq .registration_endpoint
```

Then run `npx @modelcontextprotocol/inspector` against `$API_URL/mcp` and complete
the browser flow — registration, login, token, and `tools/list` should succeed
without any pre-provisioned client.
