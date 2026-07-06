# @nest-mcp/server

## 0.8.0

### Minor Changes

- 41c7474: Harden HTTP transports and auth discovery for apps with global middleware:

  - **Parsed-body passthrough**: the streamable HTTP and SSE transports now hand
    an upstream-parsed `req.body` (e.g. from a global `express.json()` or
    Fastify's built-in parser) to the SDK as `parsedBody`. Previously the SDK
    tried to re-read the already-consumed stream and the request hung. Raw-stream
    handling is unchanged when no parser ran.
  - **`@IsMcpPublic()` marker + `isMcpPublic()` helper**: every generated HTTP
    controller (transport endpoint, `.well-known` discovery) is stamped with
    `MCP_HTTP_PUBLIC_METADATA` — discovery documents are public per RFC 9728, and
    MCP transports authenticate via the MCP authorization spec, never via an app
    session. Apps with a global auth guard exempt these routes with one check:
    `if (isMcpPublic(context)) return true`. Distinct from the per-tool
    `@Public()` pipeline bypass.
  - **`controllerDecorators` on `McpAuthModule`**: extra class decorators for the
    generated `.well-known` controller (both `forRoot` and `forRootAsync`),
    mirroring the transport controller option. Decorator application now uses
    standard `Reflect.decorate` semantics in both factories.
  - **Fastify at the SDK boundary**: the streamable HTTP and SSE transports now
    unwrap `request.raw`/`reply.raw` before handing requests to the MCP SDK (and
    mirror the guard-verified `req.auth` onto the raw request). Previously the
    Fastify wrappers were passed straight through and the transports were broken
    under `@nestjs/platform-fastify` — now covered by a real-HTTP e2e that runs
    the streamable transport on BOTH adapters. Generated controllers also thread
    the framework-parsed `@Body()` to the SDK explicitly.
  - **`instructions` server option**: dedicated LLM usage guidance surfaced in
    the `initialize` result, distinct from `description` (which remains the
    fallback for back-compat).
  - README quick-start fixed to use the real `transport` option (was showing a
    nonexistent `transports: [{ type }]` shape).

### Patch Changes

- Updated dependencies [41c7474]
  - @nest-mcp/common@0.6.0

## 0.7.1

### Patch Changes

- 975f4d8: **BREAKING: auth layer is now resource-server-only (MCP authorization spec 2025-06-18).**

  The embedded OAuth authorization server (`/authorize`, `/token`, `/register`, `/revoke`, `/introspect`, HS256 JWT issuance, GitHub/Azure provider adapters) has been removed. `@nest-mcp/server` now implements exactly the spec-required resource-server role: bearer-token verification with default-on audience validation, RFC 9728 protected-resource metadata, SDK-compatible `WWW-Authenticate` challenges, and session↔principal binding. Token issuance belongs to an external authorization server (Auth0, Keycloak, …) or your own user-land AS — see `docs/server/auth.md` for recipes.

  ### New API

  ```ts
  McpAuthModule.forRoot({
    resource: "https://mcp.example.com/mcp",
    authorizationServers: ["https://tenant.auth0.com"],
    jwks: { uri: "…/.well-known/jwks.json", issuer: "…", audience: "…" }, // or `introspection` or `verifier`
  });
  ```

  New exports: `McpBearerGuard`, `McpAuthenticatedGuard`, `JwksVerifier` (optional `jose` peer dep), `IntrospectionVerifier`, `MCP_RESOURCE_SERVER_OPTIONS`, `canonicalizeResourceUri`, `McpResourceServerOptions`/`McpResourceServerAsyncOptions`, `JwksVerifierOptions`/`IntrospectionVerifierOptions`. The SSE transport can now be gated too (`transportOptions.sse.oauth.enabled`) — previously it accepted unauthenticated traffic even when OAuth was configured.

  ### Removed → replacement

  | Removed                                                                                                                                         | Replacement                                                                                                                                  |
  | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
  | `McpAuthModuleOptions` (`jwtSecret`, `validateUser`, …)                                                                                         | `McpResourceServerOptions` (`resource`, `authorizationServers`, verifier config)                                                             |
  | `McpAuthModule.forProvider`, `GitHubProvider`, `AzureAdProvider`, `OAuthCodeExchangeProvider`                                                   | External IdP via `jwks`/`introspection` (recipe A in docs)                                                                                   |
  | `JwtTokenService`, `MCP_AUTH_OPTIONS`, `TokenPayload`, `TokenResponse`                                                                          | Your AS issues tokens (recipe C)                                                                                                             |
  | `OAuthClientService`, `MCP_OAUTH_STORE`, `IOAuthStore`, `MemoryOAuthStore`, `OAuthClient`, `AuthorizationCode`                                  | Client registration/storage is the AS's concern                                                                                              |
  | `JwtBearerTokenVerifier`                                                                                                                        | `JwksVerifier`, `IntrospectionVerifier`, or a custom `BearerTokenVerifier`                                                                   |
  | `JwtAuthGuard`                                                                                                                                  | `McpAuthenticatedGuard` (requires a verified principal; the old header-parsing fallback skipped token-type/revocation checks and was unsafe) |
  | `AuthRateLimitGuard`                                                                                                                            | `@nestjs/throttler` on your own endpoints                                                                                                    |
  | `AuthAuditService`, `AuditLogEntry`                                                                                                             | Application-level logging/interceptors                                                                                                       |
  | `IssuedTokenRecord`, `McpAuthModuleAsyncOptions`, `TokenIntrospectionResponse`                                                                  | Gone with the AS (see `McpResourceServerAsyncOptions` for the async options shape)                                                           |
  | `OAuthProviderAdapter`, `OAuthProviderUser`, `OAuthTokenResponse`, `GitHubProviderConfig`, `GitHubUser`, `AzureAdProviderConfig`, `AzureAdUser` | Gone with the federation adapters (recipe A)                                                                                                 |
  | `transportOptions.streamableHttp.oauth.resourceMetadataUrl`                                                                                     | Derived from `resource` (path-insertion form, correct scheme)                                                                                |
  | `transportOptions.streamableHttp.oauth.required`                                                                                                | `McpAuthModule.forRoot({ required })`                                                                                                        |

  ### Behavior changes

  - 401/403 responses now carry RFC 6749 bodies (`{"error":"invalid_token", …}`) and the SDK `requireBearerAuth` challenge format `WWW-Authenticate: Bearer error="…", error_description="…"[, scope="…"], resource_metadata="…"` (the old format was `Bearer realm="mcp", resource_metadata="…"` with a JSON-RPC body). Official SDK clients parse the new format natively.
  - With `required: false`, a request with a present-but-invalid token is now rejected with 401 (previously it passed through anonymously). Anonymous requests (no header) still pass.
  - Built-in verifiers enforce token audience against `resource` by default (the spec MUST that was previously skipped); matching is exact after canonicalization — set `jwks.audience` explicitly for other conventions. Tokens without an expiry are rejected, matching the SDK middleware.
  - Verifier _infrastructure_ failures (JWKS fetch errors, introspection outages) now surface as `500 server_error` instead of `401`, so SDK clients retry instead of discarding tokens and re-authorizing.
  - The `resource_metadata` challenge URL uses the configured `resource`'s scheme/host instead of hardcoding `https://` + the `Host` header. The path-insertion metadata route now returns 404 for paths other than the configured resource's path.
  - **Global guards now enforce:** a module-level guard (`McpModuleOptions.guards`) returning `false` denies the call with an `AuthorizationError` (previously the return value was silently ignored). `@Public` items are exempt — guards still run for them but cannot deny.
  - `McpModule.forRootAsync` now fails at bootstrap when `transportOptions.*.oauth.enabled` differs between the static options object and the factory result — previously a factory-only `oauth.enabled: true` was silently ignored, leaving the endpoint unauthenticated.
  - `jsonwebtoken` and `path-to-regexp` dependencies removed; `jose` added as an optional peer dependency (only needed for `JwksVerifier`).

- Updated dependencies [975f4d8]
  - @nest-mcp/common@0.5.1

## 0.7.0

### Minor Changes

- f836e53: feat: OAuth/transport hardening for the streamable HTTP transport and `McpAuthModule`

  **Behavioral callout — per-request auth context.** Handler and guard contexts
  on the streamable HTTP transport are now rebuilt per request from the SDK's
  `RequestHandlerExtra`: `ctx.request` is the per-request `RequestInfo`
  (`{ headers }`) instead of the session's _initialize_ `IncomingMessage`.
  Code reading `ctx.request.url` / `ctx.request.method` must migrate to header
  inspection (or a controller guard); previously those values were stale
  captures from the first request of the session anyway. `ctx.authInfo` and
  `ctx.user` are likewise populated from the verified per-request identity.

  Streamable HTTP transport:

  - `transportOptions.streamableHttp.oauth` — opt-in bearer-token gate
    (`enabled`, `required`, `resourceMetadataUrl`, `bindSessionToUser`).
    Unauthorized requests get HTTP 401 with a `WWW-Authenticate: Bearer ...
resource_metadata="..."` challenge (RFC 9728 discovery flow). Tokens are
    verified via the overridable `MCP_BEARER_TOKEN_VERIFIER` provider
    (`BearerTokenVerifier` interface, default `JwtBearerTokenVerifier`).
  - Session binding: when oauth is enabled, stateful sessions are bound to the
    principal that initialized them; requests from another principal get 403.
    Only active with `oauth.enabled` — existing stateful servers are unaffected.
  - DNS-rebinding options forwarded to the SDK transport: `allowedHosts`,
    `allowedOrigins`, `enableDnsRebindingProtection`.
  - `controllerGuards` / `controllerDecorators` applied to the generated
    controller (static even with `forRootAsync`, like `endpoint`).
  - `filterListsByScopes` McpModule option: `tools/resources/templates/prompts`
    list results hide items whose required scopes the caller's token lacks.

  `McpAuthModule` / OAuth server:

  - `McpAuthModule.forRootAsync({ imports?, serverUrl?, useFactory, inject? })`
    with the same `jwtSecret` validation as `forRoot`; the well-known controller
    now constructor-injects `MCP_AUTH_OPTIONS`. `MCP_OAUTH_STORE` is provided
    via a factory in both variants, so a store supplied through options/DI wins
    over the in-memory default.
  - Well-known compliance: `introspection_endpoint` (+
    `introspection_endpoint_auth_methods_supported`,
    `revocation_endpoint_auth_methods_supported`) in the RFC 8414 document, and
    path-insertion wildcard routes for both
    `/.well-known/oauth-authorization-server/*` and
    `/.well-known/oauth-protected-resource/*` (Nest 10 and 11 wildcard syntax
    both supported).
  - RFC 8707 audience binding: access tokens carry
    `aud = resource ?? audience ?? 'mcp-client'`; `validateToken` still does not
    enforce `aud` (non-breaking). Access tokens now also carry a `jti`, making
    them individually revocable.
  - Optional `IOAuthStore.recordIssuedToken(rec)` hook invoked for both tokens
    on the initial grant and on refresh, enabling issued-token tracking and
    refresh-chain revocation; revoked refresh `jti`s are rejected before reuse.
  - New exports: `resolveGuard`, `McpAuthModuleAsyncOptions`,
    `IssuedTokenRecord` (plus the new transport option types via
    `@nest-mcp/common`).

  Requires `@modelcontextprotocol/sdk` peer `^1.26.0` (per-request `authInfo`
  and `requestInfo` on `RequestHandlerExtra`).

  Fix: refresh tokens now carry the `scope` claim, so access tokens re-minted by
  the `refresh_token` grant preserve the originally granted scopes (previously
  they came back scope-less and failed every scope check).

### Patch Changes

- Updated dependencies [f836e53]
  - @nest-mcp/common@0.5.0

## 0.6.0

### Minor Changes

- 2fde58b: feat(server): add built-in `GitHubProvider` and `AzureAdProvider` for `McpAuthModule`

  Two ready-made `OAuthProviderAdapter` implementations covering the most-asked
  identity providers, plus a shared `OAuthCodeExchangeProvider` base class
  that other Authorization-Code flows can extend. All implementations use
  `globalThis.fetch` (Node 20+) — no Passport peer dependencies.

  Public surface:

  - `GitHubProvider({ clientId, clientSecret, scope?, userAgent? })`
  - `AzureAdProvider({ clientId, clientSecret, tenant?, scope? })` — defaults to
    the multi-tenant `common` tenant; supply a tenant GUID or domain to lock
    the issuer to a single Microsoft Entra tenant.
  - `OAuthCodeExchangeProvider` — abstract base; subclasses declare
    `authorizationUrl`, `tokenUrl`, `userInfoUrl`, `scope`, and a
    `mapProfile()` callback.

  Usage:

  ```ts
  import { McpAuthModule, GitHubProvider } from "@nest-mcp/server";

  const provider = new GitHubProvider({
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  });

  McpAuthModule.forProvider(provider, {
    /* ... */
  });
  ```

- 2fde58b: feat(server): integrate NestJS `@UseFilters()` exception filters into MCP handlers

  Tools, resources, and prompts that throw a non-MCP error now consult any
  `@UseFilters(...)` declared on the handler method or its enclosing class.
  Filter output (string or JSON-serializable value) is rendered as the message
  of an `McpError` and surfaced to the client as a JSON-RPC error. Unhandled
  errors fall through to the previous `ToolExecutionError` path.

- 2fde58b: feat(common,server): expose tool/prompt arguments on `McpGuardContext`

  Custom guards now receive an `arguments` field on the `McpGuardContext`
  populated with the raw arguments the caller passed to `tools/call` or
  `prompts/get`. Values are pre-Zod (validation runs after auth), so guards
  inspecting fields should treat them as `unknown`. Resource guards still
  receive only `resourceUri`.

- 2fde58b: feat(common,server): add `serverMutator`, `title`, `websiteUrl`, and `icons` to `McpModuleOptions`

  - `serverMutator?: (server) => server` lets you reach into the underlying SDK
    `McpServer` after our factory builds it (e.g., to register custom JSON-RPC
    methods that the public API does not expose).
  - `title`, `websiteUrl`, and `icons` are forwarded to the SDK
    `Implementation` block alongside `name`, `version`, and the existing
    `description`, so clients can display richer server metadata in the
    `initialize` response.

- 2fde58b: feat(server): MCP-spec arg validation + `outputSchema`/`structuredContent`

  **Behavior change** — tool input validation no longer throws
  `ValidationError`. Per the MCP specification, invalid `tools/call` arguments
  now resolve to a tool result `{ isError: true, content: [{ type: 'text',
text: 'Invalid parameters: ...' }] }` so the calling model can self-correct.
  Callers that previously caught a JSON-RPC `InvalidParams` from the protocol
  layer for tool calls should switch to inspecting `result.isError` instead.
  Prompt argument validation still throws `ValidationError`.

  When a tool declares an `outputSchema`, its handler return is now validated
  against the schema and the parsed result is attached to the
  `structuredContent` field of the `CallToolResult`. Schema mismatches throw
  `ToolExecutionError` (server-side bug).

- 2fde58b: feat(server): add `McpElicitationModule` for browser-based URL elicitation

  Adds an opt-in module that hosts the HTTP endpoints + HTML forms required to
  implement the MCP `elicit/create` flow in `mode: 'url'`. Server code (e.g.,
  a tool handler) creates an elicitation via `ElicitationService.createElicitation`,
  emits the URL to the client through the standard MCP elicitation request,
  and registers a completion notifier; when the user submits the form on the
  hosted page, the notifier fires and the awaited request resumes.

  Public surface:

  - `McpElicitationModule.forRoot({ serverUrl, ... })`
  - `ElicitationService` — `createElicitation`, `completeElicitation`,
    `buildElicitationUrl`, `registerCompletionNotifier`,
    `findResultByUserAndType`, plus `startUrlElicitation()` (high-level
    helper that returns `{ elicitationId, url, waitForCompletion }`).
  - `ElicitationCancelledError` — thrown by `waitForCompletion` when the
    user submits the cancel action.
  - `IElicitationStore` — pluggable storage backend (default in-memory; supply
    a Redis/DB-backed store via `storeConfiguration: { type: 'custom', store }`)
  - `MemoryElicitationStore` — default
  - HTML templates for API-key form, confirmation form, success/cancel/error
    pages, with `templateOptions` for branding (logo, app name, primary color,
    custom CSS)
  - Configurable endpoint paths and Nest guards on the controller

  Tool-handler integration pattern:

  ```ts
  const { elicitationId, url, waitForCompletion } =
    await elicitation.startUrlElicitation({
      sessionId: ctx.sessionId,
      userId: ctx.user?.id,
      metadata: { type: "api-key", message: "Enter your key" },
    });
  await ctx.elicit({
    mode: "url",
    message: "Open browser",
    url,
    elicitationId,
  });
  const result = await waitForCompletion({
    signal: ctx.signal,
    timeoutMs: 60_000,
  });
  ```

  Pre-existing `ElicitURLRequest` type in `@nest-mcp/common` is unchanged.

### Patch Changes

- Updated dependencies [2fde58b]
- Updated dependencies [2fde58b]
- Updated dependencies [2fde58b]
  - @nest-mcp/common@0.4.0

## 0.5.0

### Minor Changes

- 632d8f0: Add tool exposure / discovery-strategy configuration. Large tool catalogs can now avoid bloating the initial prompt by deferring schemas until they are needed.

  Configure via `McpModuleOptions.exposure` with a static strategy or a per-client resolver:

  - `{ kind: 'eager' }` — current behaviour, full schemas in `tools/list`.
  - `{ kind: 'search', variant: 'bm25' | 'regex', eager?, onAllDeferred? }` — annotates deferred tools with `_meta.defer_loading: true` for Anthropic's Tool Search Tool beta.
  - `{ kind: 'lazy', eager?, indexToolName?, schemaToolName?, maxBatchSize?, requireDiscovery? }` — vendor-neutral: ships `list_available_tools` and `get_tool_schema` meta-tools so clients pull definitions on demand.
  - `{ kind: 'typed-api' }` — reserved for Code Mode; throws at runtime in this release.

  Also ships:

  - `clientSupports.search(ctx)` capability helper (checks the `advanced-tool-use-2025-11-20` beta header — no model regex required in user code).
  - `preferSearchElseLazy({ eager })` preset resolver for the common per-client tiering case.
  - `defineResolver([...kinds], fn)` to declare which strategy kinds a custom resolver can produce. `ExposureService` uses this declaration to skip conservative meta-tool registration when `lazy` is not reachable.
  - `buildClientContext({ transport, request, clientInfo, model })` helper that parses `anthropic-beta` headers into `ClientContext`.
  - `@Tool({ ..., tags, exposure })` decorator fields. `tags` feeds selectors like `eager: { tags: ['core'] }`; `exposure: 'eager' | 'deferred' | 'auto'` overrides module policy per tool.

  All new fields are optional; existing servers continue to behave as before. No protocol extensions — both the `search` annotations and the `lazy` meta-tools work over plain MCP JSON-RPC.

### Patch Changes

- Updated dependencies [632d8f0]
  - @nest-mcp/common@0.3.0

## 0.4.0

### Minor Changes

- 043aa34: Add `imports` option to `McpModule.forFeature()` allowing feature modules to import other modules that export providers needed by the feature's tools.

## 0.3.0

### Minor Changes

- 5a6ef8e: feat: add advanced transport options and fix logging configuration

  **Transport options** — `StreamableHttpTransportOptions` now supports `sessionIdGenerator`, `enableJsonResponse`, `eventStore`, `onsessioninitialized`, `onsessionclosed`, and `retryInterval`, passed through to the MCP SDK's `StreamableHTTPServerTransport`.

  **Logging** — `McpModuleOptions.logging` type changed from `{ level?: string }` to `false | LogLevel[]`. The old type was declared but never consumed. `bootstrapStdioApp()` now reads `logging` from `McpModule.forRoot()` as a fallback when `StdioBootstrapOptions.logLevels` is not explicitly provided.

  **SDK re-exports** — `EventStore`, `StreamId`, and `EventId` types are now re-exported from `@nest-mcp/server`.

  **BREAKING**: `logging` type change is compile-time only (the old field was never consumed at runtime). Migration: `{ level: 'error' }` → `['error']`.

### Patch Changes

- Updated dependencies [5a6ef8e]
  - @nest-mcp/common@0.2.0

## 0.2.4

### Patch Changes

- f943fca: Migrate to Zod v4. Zod v4 is now the required peer dependency.
- Updated dependencies [f943fca]
  - @nest-mcp/common@0.1.8

## 0.2.3

### Patch Changes

- 0e1b932: Add npm keywords to all packages for improved discoverability
- Updated dependencies [0e1b932]
  - @nest-mcp/common@0.1.7

## 0.2.2

### Patch Changes

- 3fd3c19: Exclude .d.ts.map files from published packages — reduces file count by ~50%
- Updated dependencies [3fd3c19]
  - @nest-mcp/common@0.1.6

## 0.2.1

### Patch Changes

- ac72e05: Add homepage links and npm/CI badges to each package README
- Updated dependencies [ac72e05]
  - @nest-mcp/common@0.1.5

## 0.2.0

### Minor Changes

- 95170f0: Re-export all @nest-mcp/common types from each package — users no longer need to install or import from @nest-mcp/common directly

## 0.1.4

### Patch Changes

- aaca8d0: Fix npm provenance via NPM_CONFIG_PROVENANCE environment variable
- Updated dependencies [aaca8d0]
  - @nest-mcp/common@0.1.4

## 0.1.3

### Patch Changes

- 378b3c3: Enable npm provenance on publish
- Updated dependencies [378b3c3]
  - @nest-mcp/common@0.1.3

## 0.1.2

### Patch Changes

- 3dc43bd: Change license from MIT to BSD-3-Clause
- Updated dependencies [3dc43bd]
  - @nest-mcp/common@0.1.2

## 0.1.1

### Patch Changes

- e6dd416: Add README to each package for npm display
- Updated dependencies [e6dd416]
  - @nest-mcp/common@0.1.1
