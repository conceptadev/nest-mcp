---
"@nest-mcp/common": patch
"@nest-mcp/client": patch
"@nest-mcp/server": patch
"@nest-mcp/gateway": patch
---

Add compatibility with the exact tested NestJS `12.0.0-alpha.5` release while retaining NestJS 10
and 11 support. CI now runs the full workspace against NestJS 12 on Node.js 24 and verifies packed
CommonJS packages from a TypeScript 6 native ESM consumer, including registered client shutdown,
async imported-verifier dependency injection, and gateway initialization.
