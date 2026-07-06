import {
  type CanActivate,
  Controller,
  Get,
  Post,
  Req,
  Res,
  type Type,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { IsPublic } from '../../decorators/is-public.decorator';
import { SseService } from './sse.service';

export interface SseControllerOptions {
  /**
   * NestJS guards applied to both generated controllers via `@UseGuards`.
   * Accepts guard classes or instances, like `UseGuards` itself.
   */
  guards?: unknown[];
}

export function createSseController(
  sseEndpoint: string,
  messagesEndpoint: string,
  opts?: SseControllerOptions,
): Type<unknown>[] {
  // MCP transports authenticate per the MCP authorization spec, never via an app
  // session — app-wide guards must not block them (see IsPublic docs).
  @IsPublic()
  @Controller({ path: sseEndpoint, version: VERSION_NEUTRAL })
  class SseController {
    constructor(private readonly sseService: SseService) {}

    @Get()
    async handleSse(@Req() req: unknown, @Res() res: unknown): Promise<void> {
      await this.sseService.createConnection(req, res);
    }
  }

  @IsPublic()
  @Controller({ path: messagesEndpoint, version: VERSION_NEUTRAL })
  class SseMessagesController {
    constructor(private readonly sseService: SseService) {}

    @Post()
    async handleMessage(@Req() req: unknown, @Res() res: unknown): Promise<void> {
      await this.sseService.handleMessage(req, res);
    }
  }

  if (opts?.guards?.length) {
    const guards = opts.guards as (CanActivate | (new (...args: never[]) => CanActivate))[];
    UseGuards(...guards)(SseController);
    UseGuards(...guards)(SseMessagesController);
  }

  return [SseController, SseMessagesController];
}
