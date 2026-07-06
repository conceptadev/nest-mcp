---
"@nest-mcp/server": minor
---

Harden HTTP transports and auth discovery for apps with global middleware:

- **Parsed-body passthrough**: the streamable HTTP and SSE transports now hand
  an upstream-parsed `req.body` (e.g. from a global `express.json()` or
  Fastify's built-in parser) to the SDK as `parsedBody`. Previously the SDK
  tried to re-read the already-consumed stream and the request hung. Raw-stream
  handling is unchanged when no parser ran.
- **`@IsPublic()` marker + `isMcpPublic()` helper**: every generated HTTP
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
- README quick-start fixed to use the real `transport` option (was showing a
  nonexistent `transports: [{ type }]` shape).
