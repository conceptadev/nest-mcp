import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpModuleOptions } from '@nest-mcp/common';
import { buildServerCapabilities } from '@nest-mcp/common';
import { Logger } from '@nestjs/common';
import type { McpRegistryService } from '../discovery/registry.service';
import type { TaskManager } from '../task/task.manager';

export function createMcpServer(
  registry: McpRegistryService,
  options: McpModuleOptions,
  taskManager?: TaskManager,
): McpServer {
  const logger = new Logger('McpServerFactory');

  const capabilities = buildServerCapabilities(options, {
    hasTools: registry.hasTools,
    hasResources: registry.hasResources,
    hasResourceTemplates: registry.hasResourceTemplates,
    hasPrompts: registry.hasPrompts,
  });

  logger.debug(`Building MCP server '${options.name}' v${options.version}`);

  const mcpServer = new McpServer(
    {
      name: options.name,
      version: options.version,
      ...(options.title ? { title: options.title } : {}),
      ...(options.description ? { description: options.description } : {}),
      ...(options.websiteUrl ? { websiteUrl: options.websiteUrl } : {}),
      ...(options.icons ? { icons: options.icons } : {}),
    },
    {
      capabilities: capabilities as ServerOptions['capabilities'],
      // Dedicated LLM usage guidance; `description` kept as fallback for back-compat.
      ...(options.instructions || options.description
        ? { instructions: options.instructions ?? options.description }
        : {}),
      ...(taskManager
        ? {
            taskStore: taskManager.store,
            taskMessageQueue: taskManager.queue,
          }
        : {}),
    } as ServerOptions,
  );

  return options.serverMutator ? (options.serverMutator(mcpServer) as McpServer) : mcpServer;
}
