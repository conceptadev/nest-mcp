# @nest-mcp/client

## 0.3.1

### Patch Changes

- Updated dependencies [41c7474]
  - @nest-mcp/common@0.6.0

## 0.3.0

### Minor Changes

- 1275606: Add runtime connection registry to `McpClientsService`: `addConnection(connection)`,
  `getOrCreate(connection)`, `removeConnection(name)`, and `has(name)`. This lets apps register and
  tear down MCP client connections at runtime — for multi-tenant gateways where upstreams are
  discovered after module init — instead of fixing all connections at `forRoot`/`forRootAsync` time.

  `addConnection`/`getOrCreate` are idempotent (a connected client with the same name is reused, a
  stale one is replaced, and concurrent first-connects dedupe to a single client); a client whose
  `connect()` rejects is not registered. Runtime clients join the same collection as the static ones,
  so they are returned by `getClient`/`getClients` and disconnected on application shutdown. Purely
  additive — existing `getClient`/`getClients` behavior is unchanged.

## 0.2.11

### Patch Changes

- Updated dependencies [975f4d8]
  - @nest-mcp/common@0.5.1

## 0.2.10

### Patch Changes

- f836e53: chore: require `@modelcontextprotocol/sdk` peer `^1.26.0`, aligning with `@nest-mcp/server` (which needs the per-request `authInfo`/`requestInfo` surface introduced there).
- Updated dependencies [f836e53]
  - @nest-mcp/common@0.5.0

## 0.2.9

### Patch Changes

- Updated dependencies [2fde58b]
- Updated dependencies [2fde58b]
- Updated dependencies [2fde58b]
  - @nest-mcp/common@0.4.0

## 0.2.8

### Patch Changes

- 7012df3: Avoid invoking provider prototype accessors while wiring `@OnMcpNotification` handlers. The bootstrap scanner now inspects property descriptors and only reads method values, preventing Nest provider getters from throwing during app startup.

## 0.2.7

### Patch Changes

- Updated dependencies [632d8f0]
  - @nest-mcp/common@0.3.0

## 0.2.6

### Patch Changes

- e4e8017: Fix `McpClientBootstrap.wireNotificationHandlers` crashing with `TypeError` when a sibling provider's prototype exposes non-function own properties (e.g. `useValue: {}` providers, whose prototype `Object.prototype.__proto__` resolves to `null`). The notification scan now skips prototype entries whose value is not a function before calling `Reflect.getMetadata`. Fixes #18.

## 0.2.5

### Patch Changes

- Updated dependencies [5a6ef8e]
  - @nest-mcp/common@0.2.0

## 0.2.4

### Patch Changes

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
