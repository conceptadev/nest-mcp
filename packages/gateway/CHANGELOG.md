# @nest-mcp/gateway

## 0.2.15

### Patch Changes

- f0657f8: Add compatibility with the exact tested NestJS `12.0.0-alpha.5` release while retaining NestJS 10
  and 11 support. CI now runs the full workspace against NestJS 12 on Node.js 24 and verifies packed
  CommonJS packages from a TypeScript 6 native ESM consumer, including registered client shutdown,
  async imported-verifier dependency injection, and gateway initialization.
- Updated dependencies [f0657f8]
  - @nest-mcp/common@0.6.1
  - @nest-mcp/client@0.3.2
  - @nest-mcp/server@0.8.1

## 0.2.14

### Patch Changes

- Updated dependencies [41c7474]
  - @nest-mcp/server@0.8.0
  - @nest-mcp/common@0.6.0
  - @nest-mcp/client@0.3.1

## 0.2.13

### Patch Changes

- Updated dependencies [1275606]
  - @nest-mcp/client@0.3.0

## 0.2.12

### Patch Changes

- Updated dependencies [975f4d8]
  - @nest-mcp/server@0.7.1
  - @nest-mcp/common@0.5.1
  - @nest-mcp/client@0.2.11

## 0.2.11

### Patch Changes

- f836e53: chore: require `@modelcontextprotocol/sdk` peer `^1.26.0`, aligning with `@nest-mcp/server` (which needs the per-request `authInfo`/`requestInfo` surface introduced there).
- Updated dependencies [f836e53]
- Updated dependencies [f836e53]
  - @nest-mcp/server@0.7.0
  - @nest-mcp/common@0.5.0
  - @nest-mcp/client@0.2.10

## 0.2.10

### Patch Changes

- Updated dependencies [2fde58b]
- Updated dependencies [2fde58b]
- Updated dependencies [2fde58b]
- Updated dependencies [2fde58b]
- Updated dependencies [2fde58b]
- Updated dependencies [2fde58b]
- Updated dependencies [2fde58b]
  - @nest-mcp/server@0.6.0
  - @nest-mcp/common@0.4.0
  - @nest-mcp/client@0.2.9

## 0.2.9

### Patch Changes

- Updated dependencies [7012df3]
  - @nest-mcp/client@0.2.8

## 0.2.8

### Patch Changes

- Updated dependencies [632d8f0]
  - @nest-mcp/common@0.3.0
  - @nest-mcp/server@0.5.0
  - @nest-mcp/client@0.2.7

## 0.2.7

### Patch Changes

- Updated dependencies [e4e8017]
  - @nest-mcp/client@0.2.6

## 0.2.6

### Patch Changes

- Updated dependencies [043aa34]
  - @nest-mcp/server@0.4.0

## 0.2.5

### Patch Changes

- Updated dependencies [5a6ef8e]
  - @nest-mcp/common@0.2.0
  - @nest-mcp/server@0.3.0
  - @nest-mcp/client@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [f943fca]
  - @nest-mcp/common@0.1.8
  - @nest-mcp/server@0.2.4
  - @nest-mcp/client@0.2.4

## 0.2.3

### Patch Changes

- 0e1b932: Add npm keywords to all packages for improved discoverability
- Updated dependencies [0e1b932]
  - @nest-mcp/client@0.2.3
  - @nest-mcp/common@0.1.7
  - @nest-mcp/server@0.2.3

## 0.2.2

### Patch Changes

- 3fd3c19: Exclude .d.ts.map files from published packages — reduces file count by ~50%
- Updated dependencies [3fd3c19]
  - @nest-mcp/client@0.2.2
  - @nest-mcp/common@0.1.6
  - @nest-mcp/server@0.2.2

## 0.2.1

### Patch Changes

- ac72e05: Add homepage links and npm/CI badges to each package README
- Updated dependencies [ac72e05]
  - @nest-mcp/client@0.2.1
  - @nest-mcp/common@0.1.5
  - @nest-mcp/server@0.2.1

## 0.2.0

### Minor Changes

- 95170f0: Re-export all @nest-mcp/common types from each package — users no longer need to install or import from @nest-mcp/common directly

### Patch Changes

- Updated dependencies [95170f0]
  - @nest-mcp/client@0.2.0
  - @nest-mcp/server@0.2.0

## 0.1.4

### Patch Changes

- aaca8d0: Fix npm provenance via NPM_CONFIG_PROVENANCE environment variable
- Updated dependencies [aaca8d0]
  - @nest-mcp/client@0.1.4
  - @nest-mcp/common@0.1.4
  - @nest-mcp/server@0.1.4

## 0.1.3

### Patch Changes

- 378b3c3: Enable npm provenance on publish
- Updated dependencies [378b3c3]
  - @nest-mcp/client@0.1.3
  - @nest-mcp/common@0.1.3
  - @nest-mcp/server@0.1.3

## 0.1.2

### Patch Changes

- 3dc43bd: Change license from MIT to BSD-3-Clause
- Updated dependencies [3dc43bd]
  - @nest-mcp/client@0.1.2
  - @nest-mcp/common@0.1.2
  - @nest-mcp/server@0.1.2

## 0.1.1

### Patch Changes

- e6dd416: Add README to each package for npm display
- Updated dependencies [e6dd416]
  - @nest-mcp/client@0.1.1
  - @nest-mcp/common@0.1.1
  - @nest-mcp/server@0.1.1
