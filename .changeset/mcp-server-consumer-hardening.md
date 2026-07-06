---
"@nest-mcp/server": minor
---

Harden HTTP transports and auth discovery for apps with global middleware:

- **Parsed-body passthrough**: the streamable HTTP and SSE transports now hand
  an upstream-parsed `req.body` (e.g. from a global `express.json()` or
  Fastify's built-in parser) to the SDK as `parsedBody`. Previously the SDK
  tried to re-read the already-consumed stream and the request hung. Raw-stream
  handling is unchanged when no parser ran.
- **`controllerDecorators` on `McpAuthModule`**: class decorators can now be
  applied to the generated `.well-known` discovery controller (both `forRoot`
  and `forRootAsync`), e.g. an `@AllowAnonymous()`-style marker so an app-wide
  auth guard lets anonymous RFC 9728/8414 discovery requests through. Like the
  transport controller's options, they are static — under `forRootAsync` set
  them on the async options object, not in the factory result.
- README quick-start fixed to use the real `transport` option (was showing a
  nonexistent `transports: [{ type }]` shape).
