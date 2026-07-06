import {
  type CanActivate,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
  type Type,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { IsPublic } from '../../decorators/is-public.decorator';
import { applyClassDecorators } from '../../utils/apply-class-decorators.util';
import { StreamableHttpService } from './streamable.service';

export interface StreamableHttpControllerOptions {
  /**
   * NestJS guards applied to the generated controller via `@UseGuards`.
   * Accepts guard classes or instances, like `UseGuards` itself.
   */
  guards?: unknown[];
  /** Class decorators applied to the generated controller (e.g. `@ApiTags`). */
  decorators?: ClassDecorator[];
}

/**
 * Builds the controller serving the streamable HTTP endpoint.
 *
 * The controller class (path, guards, decorators) is created when the module
 * is defined, so this configuration must be static — even with
 * `McpModule.forRootAsync`, where only the runtime options resolved by the
 * factory flow through `MCP_OPTIONS`.
 */
export function createStreamableHttpController(
  endpoint: string,
  opts?: StreamableHttpControllerOptions,
): Type<unknown> {
  // The MCP endpoint authenticates per the MCP authorization spec (McpBearerGuard when
  // oauth is enabled), never via an app session — app-wide guards must not block it.
  @IsPublic()
  @Controller({ path: endpoint, version: VERSION_NEUTRAL })
  class StreamableHttpController {
    constructor(private readonly streamableService: StreamableHttpService) {}

    @Post()
    async handlePost(@Req() req: unknown, @Res() res: unknown): Promise<void> {
      await this.streamableService.handlePostRequest(req, res);
    }

    @Get()
    async handleGet(@Req() req: unknown, @Res() res: unknown): Promise<void> {
      await this.streamableService.handleGetRequest(req, res);
    }

    @Delete()
    async handleDelete(@Req() req: unknown, @Res() res: unknown): Promise<void> {
      await this.streamableService.handleDeleteRequest(req, res);
    }
  }

  if (opts?.guards?.length) {
    UseGuards(...(opts.guards as (CanActivate | (new (...args: never[]) => CanActivate))[]))(
      StreamableHttpController,
    );
  }

  return applyClassDecorators(StreamableHttpController, opts?.decorators);
}
