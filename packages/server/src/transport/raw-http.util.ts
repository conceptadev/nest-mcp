import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Unwraps a framework request to the raw Node `IncomingMessage` the MCP SDK expects.
 * Express hands controllers the Node object itself (no `raw`); Fastify wraps it as
 * `request.raw`. The SDK reads the verified bearer identity from `req.auth` — which
 * `McpBearerGuard` sets on the FRAMEWORK request — so it is mirrored onto the raw
 * object when the two differ.
 */
export function rawRequestOf(req: unknown): IncomingMessage {
  const framework = req as { raw?: IncomingMessage; auth?: unknown };
  const raw = framework?.raw ?? (req as IncomingMessage);
  if (framework?.auth !== undefined && raw !== req) {
    (raw as IncomingMessage & { auth?: unknown }).auth = framework.auth;
  }
  return raw;
}

/**
 * Unwraps a framework response to the raw Node `ServerResponse` (Fastify's
 * `reply.raw`; Express responses are already the Node object).
 */
export function rawResponseOf(res: unknown): ServerResponse {
  return ((res as { raw?: ServerResponse })?.raw ?? res) as ServerResponse;
}
