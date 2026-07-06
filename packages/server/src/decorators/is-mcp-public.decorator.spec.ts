import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { IsMcpPublic, MCP_HTTP_PUBLIC_METADATA, isMcpPublic } from './is-mcp-public.decorator';

function contextFor(cls: object | null, handler: object | null): ExecutionContext {
  return {
    getClass: () => cls,
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

describe('IsMcpPublic', () => {
  it('stamps MCP_HTTP_PUBLIC_METADATA on a class', () => {
    @IsMcpPublic()
    class PublicController {}

    expect(Reflect.getMetadata(MCP_HTTP_PUBLIC_METADATA, PublicController)).toBe(true);
  });

  it('stamps MCP_HTTP_PUBLIC_METADATA on a handler', () => {
    class MixedController {
      @IsMcpPublic()
      open() {}
    }

    expect(Reflect.getMetadata(MCP_HTTP_PUBLIC_METADATA, MixedController.prototype.open)).toBe(
      true,
    );
  });
});

describe('isMcpPublic', () => {
  it('is true for a class-level marker', () => {
    @IsMcpPublic()
    class PublicController {
      handle() {}
    }

    expect(isMcpPublic(contextFor(PublicController, PublicController.prototype.handle))).toBe(true);
  });

  it('is true for a handler-level marker', () => {
    class MixedController {
      @IsMcpPublic()
      open() {}
    }

    expect(isMcpPublic(contextFor(MixedController, MixedController.prototype.open))).toBe(true);
  });

  it('is false without the marker', () => {
    class PrivateController {
      handle() {}
    }

    expect(isMcpPublic(contextFor(PrivateController, PrivateController.prototype.handle))).toBe(
      false,
    );
  });

  it('tolerates contexts without class/handler getters', () => {
    expect(isMcpPublic(contextFor(null, null))).toBe(false);
    expect(isMcpPublic({} as ExecutionContext)).toBe(false);
  });
});
