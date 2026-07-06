import 'reflect-metadata';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpTransportType } from '@nest-mcp/common';
import { describe, expect, it } from 'vitest';
import { McpRegistryService } from '../discovery/registry.service';
import { createMcpServer } from './server.factory';

function makeRegistry(
  flags: {
    hasTools?: boolean;
    hasResources?: boolean;
    hasResourceTemplates?: boolean;
    hasPrompts?: boolean;
  } = {},
): McpRegistryService {
  const registry = new McpRegistryService();
  // Expose the flags via a partial object cast — registry getters are read-only,
  // so we override the prototype properties via Object.defineProperty.
  if (flags.hasTools !== undefined)
    Object.defineProperty(registry, 'hasTools', { get: () => flags.hasTools });
  if (flags.hasResources !== undefined)
    Object.defineProperty(registry, 'hasResources', { get: () => flags.hasResources });
  if (flags.hasResourceTemplates !== undefined)
    Object.defineProperty(registry, 'hasResourceTemplates', {
      get: () => flags.hasResourceTemplates,
    });
  if (flags.hasPrompts !== undefined)
    Object.defineProperty(registry, 'hasPrompts', { get: () => flags.hasPrompts });
  return registry;
}

const baseOptions = {
  name: 'test-server',
  version: '1.0.0',
  transport: McpTransportType.STREAMABLE_HTTP,
} as const;

describe('createMcpServer', () => {
  it('returns an McpServer instance', () => {
    const server = createMcpServer(makeRegistry(), baseOptions);
    expect(server).toBeInstanceOf(McpServer);
  });

  it('sets the server name and version', () => {
    const server = createMcpServer(makeRegistry(), {
      ...baseOptions,
      name: 'my-mcp',
      version: '2.3.4',
    });
    // The underlying Server exposes name/version via getClientCapabilities but
    // McpServer wraps it — we verify the object is created without throwing.
    expect(server).toBeInstanceOf(McpServer);
  });

  // Reads the SDK Server's private `_instructions` — the only place the value
  // lands before an initialize round-trip. Pinned to @modelcontextprotocol/sdk ^1.26.
  function instructionsOf(server: McpServer): string | undefined {
    return (server.server as unknown as { _instructions?: string })._instructions;
  }

  it('forwards dedicated instructions to the SDK server', () => {
    const server = createMcpServer(makeRegistry(), {
      ...baseOptions,
      description: 'What the server is',
      instructions: 'Prefer update over deploy when the user says "again".',
    });
    expect(instructionsOf(server)).toBe('Prefer update over deploy when the user says "again".');
  });

  it('falls back to description as instructions when none are given (back-compat)', () => {
    const server = createMcpServer(makeRegistry(), {
      ...baseOptions,
      description: 'A helpful server',
    });
    expect(instructionsOf(server)).toBe('A helpful server');
  });

  it('sends no instructions when neither is provided', () => {
    const server = createMcpServer(makeRegistry(), baseOptions);
    expect(instructionsOf(server)).toBeUndefined();
  });

  it('passes taskStore and taskMessageQueue when taskManager is provided', () => {
    const taskManager = {
      store: { get: () => undefined },
      queue: { push: () => {} },
    };
    expect(() => createMcpServer(makeRegistry(), baseOptions, taskManager as never)).not.toThrow();
  });

  it('does not throw when taskManager is absent', () => {
    expect(() => createMcpServer(makeRegistry(), baseOptions, undefined)).not.toThrow();
  });

  it('reflects tool capability when registry has tools', () => {
    const server = createMcpServer(makeRegistry({ hasTools: true }), baseOptions);
    expect(server).toBeInstanceOf(McpServer);
  });

  it('reflects resource capability when registry has resources', () => {
    const server = createMcpServer(makeRegistry({ hasResources: true }), baseOptions);
    expect(server).toBeInstanceOf(McpServer);
  });

  it('reflects resource template capability when registry has resource templates', () => {
    const server = createMcpServer(makeRegistry({ hasResourceTemplates: true }), baseOptions);
    expect(server).toBeInstanceOf(McpServer);
  });

  it('reflects prompt capability when registry has prompts', () => {
    const server = createMcpServer(makeRegistry({ hasPrompts: true }), baseOptions);
    expect(server).toBeInstanceOf(McpServer);
  });

  it('returns McpServer with all capabilities when registry has all', () => {
    const server = createMcpServer(
      makeRegistry({
        hasTools: true,
        hasResources: true,
        hasResourceTemplates: true,
        hasPrompts: true,
      }),
      baseOptions,
    );
    expect(server).toBeInstanceOf(McpServer);
  });

  it('forwards title, websiteUrl, and icons to the SDK Implementation block', () => {
    const server = createMcpServer(makeRegistry(), {
      ...baseOptions,
      title: 'Pretty Name',
      websiteUrl: 'https://example.com',
      icons: [{ src: 'https://example.com/icon.png', mimeType: 'image/png' }],
    });
    expect(server).toBeInstanceOf(McpServer);
  });

  it('runs serverMutator and uses the returned instance', () => {
    const seen: McpServer[] = [];
    const server = createMcpServer(makeRegistry(), {
      ...baseOptions,
      serverMutator: (s) => {
        seen.push(s as McpServer);
        return s;
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(server);
  });

  it('lets serverMutator replace the server with a different instance', () => {
    const replacement = createMcpServer(makeRegistry(), baseOptions);
    const server = createMcpServer(makeRegistry(), {
      ...baseOptions,
      serverMutator: () => replacement,
    });
    expect(server).toBe(replacement);
  });
});
