import { Controller, Get, Header, Inject, NotFoundException, Req, type Type } from '@nestjs/common';
import { IsPublic } from '../decorators/is-public.decorator';
import { applyClassDecorators } from '../utils/apply-class-decorators.util';
import { MCP_RESOURCE_SERVER_OPTIONS } from './auth.constants';
import type { McpResourceServerOptions } from './interfaces/resource-server-options.interface';

/**
 * Returns the Nest major version so route syntax can adapt: Nest 11
 * (path-to-regexp v8) requires named wildcards (`*rest`) while Nest 10
 * (legacy path-to-regexp) uses a bare `*`.
 */
function nestMajorVersion(): number {
  try {
    // The package builds to CommonJS, so `require` is available at runtime
    // (the typeof check covers ESM-transformed test environments). Neither
    // @nestjs/common@10 nor @11 restricts `./package.json` via exports.
    if (typeof require !== 'function') return 11;
    const { version } = require('@nestjs/common/package.json') as { version: string };
    return Number.parseInt(version.split('.')[0] ?? '', 10) || 11;
  } catch {
    return 11;
  }
}

/**
 * Builds the RFC 9728 path-insertion wildcard route for a well-known base
 * path, using the wildcard syntax of the given Nest major version.
 *
 * Exported for tests only.
 */
export function buildWellKnownWildcardRoute(base: string, nestMajor: number): string {
  return nestMajor >= 11 ? `${base}/*rest` : `${base}/*`;
}

/**
 * Extracts the path-insertion suffix from a well-known request URL, e.g.
 * `/.well-known/oauth-protected-resource/mcp` → `mcp`. Version-agnostic
 * (reads the URL instead of route params, whose shape differs between
 * Express 4 and Express 5).
 *
 * Exported for tests only.
 */
export function extractWellKnownRest(url: string | undefined, base: string): string {
  if (!url) return '';
  const marker = `/.well-known/${base}/`;
  const index = url.indexOf(marker);
  if (index === -1) return '';
  const rest = url.slice(index + marker.length);
  const queryIndex = rest.indexOf('?');
  const path = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

interface WellKnownRequest {
  url?: string;
  originalUrl?: string;
}

/**
 * Builds the `.well-known` controller serving RFC 9728 protected-resource
 * metadata for the configured resource — at the root path and the
 * path-insertion variant (`/.well-known/oauth-protected-resource/<path>`),
 * matching the discovery order of official SDK clients. Optionally mirrors a
 * user-supplied RFC 8414 authorization-server metadata document for clients
 * that predate the 2025-06-18 discovery flow.
 *
 * Options are constructor-injected via `MCP_RESOURCE_SERVER_OPTIONS` so the
 * controller also works with `McpAuthModule.forRootAsync`. Decorators are the
 * exception: the class is created at module-definition time, so they are
 * passed to this factory directly (static even under `forRootAsync`).
 */
export function createWellKnownController(decorators?: ClassDecorator[]): Type<unknown> {
  const nestMajor = nestMajorVersion();

  // RFC 9728 §3: protected-resource metadata is fetched by clients that do not yet
  // have credentials — app-wide auth guards must let these routes through.
  @IsPublic()
  @Controller('.well-known')
  class WellKnownController {
    constructor(
      @Inject(MCP_RESOURCE_SERVER_OPTIONS)
      private readonly options: McpResourceServerOptions,
    ) {}

    private buildProtectedResourceMetadata() {
      return {
        resource: this.options.resource,
        authorization_servers: this.options.authorizationServers,
        scopes_supported: this.options.scopesSupported,
        bearer_methods_supported: ['header'],
        resource_name: this.options.resourceName,
      };
    }

    @Get('oauth-protected-resource')
    @Header('Cache-Control', 'public, max-age=3600')
    @Header('Access-Control-Allow-Origin', '*')
    getProtectedResourceMetadata() {
      return this.buildProtectedResourceMetadata();
    }

    /**
     * RFC 9728 path-insertion variant. Served only for the configured
     * resource's path (trailing slashes tolerated) — RFC 9728 §3.3 clients
     * verify the document's `resource` matches the identifier they queried,
     * so claiming the single configured resource for arbitrary inserted
     * paths would hand strict clients a mismatching document.
     */
    @Get(buildWellKnownWildcardRoute('oauth-protected-resource', nestMajor))
    @Header('Cache-Control', 'public, max-age=3600')
    @Header('Access-Control-Allow-Origin', '*')
    getProtectedResourceMetadataForPath(@Req() req: WellKnownRequest) {
      const rest = extractWellKnownRest(
        req.originalUrl ?? req.url,
        'oauth-protected-resource',
      ).replace(/\/+$/, '');
      const resourcePath = new URL(this.options.resource).pathname.replace(/^\//, '');
      if (rest !== resourcePath) {
        throw new NotFoundException();
      }
      return this.buildProtectedResourceMetadata();
    }

    @Get('oauth-authorization-server')
    @Header('Cache-Control', 'public, max-age=3600')
    @Header('Access-Control-Allow-Origin', '*')
    getAuthorizationServerMetadata() {
      if (!this.options.legacyOAuthMetadata) {
        throw new NotFoundException();
      }
      return this.options.legacyOAuthMetadata;
    }

    /** RFC 8414 path-insertion variant — same mirrored document for any issuer path. */
    @Get(buildWellKnownWildcardRoute('oauth-authorization-server', nestMajor))
    @Header('Cache-Control', 'public, max-age=3600')
    @Header('Access-Control-Allow-Origin', '*')
    getAuthorizationServerMetadataForPath() {
      return this.getAuthorizationServerMetadata();
    }
  }

  return applyClassDecorators(WellKnownController, decorators);
}
