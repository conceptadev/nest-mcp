---
"@nest-mcp/server": minor
"@nest-mcp/common": minor
---

Harden HTTP transports and auth discovery for apps with global middleware:

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
