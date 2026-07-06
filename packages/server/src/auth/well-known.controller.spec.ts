import 'reflect-metadata';
import { OAuthProtectedResourceMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { Header, NotFoundException, RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { McpResourceServerOptions } from './interfaces/resource-server-options.interface';
import {
  buildWellKnownWildcardRoute,
  createWellKnownController,
  extractWellKnownRest,
} from './well-known.controller';

/** Metadata key under which Nest's @Header stores response headers (HEADERS_METADATA). */
const HEADERS_METADATA = '__headers__';

const baseOptions: McpResourceServerOptions = {
  resource: 'https://mcp.example.com/mcp',
  authorizationServers: ['https://as.example.com'],
  scopesSupported: ['mcp:read', 'mcp:write'],
  resourceName: 'Example MCP Server',
};

type WellKnownInstance = {
  getProtectedResourceMetadata(): Record<string, unknown>;
  getProtectedResourceMetadataForPath(req: {
    url?: string;
    originalUrl?: string;
  }): Record<string, unknown>;
  getAuthorizationServerMetadata(): Record<string, unknown>;
  getAuthorizationServerMetadataForPath(): Record<string, unknown>;
};

function makeInstance(options: McpResourceServerOptions): WellKnownInstance {
  const Ctrl = createWellKnownController();
  return new (Ctrl as new (options: McpResourceServerOptions) => WellKnownInstance)(options);
}

describe('buildWellKnownWildcardRoute', () => {
  it('uses a named wildcard on Nest >= 11', () => {
    expect(buildWellKnownWildcardRoute('oauth-protected-resource', 11)).toBe(
      'oauth-protected-resource/*rest',
    );
  });

  it('uses a bare wildcard on Nest 10', () => {
    expect(buildWellKnownWildcardRoute('oauth-protected-resource', 10)).toBe(
      'oauth-protected-resource/*',
    );
  });
});

describe('extractWellKnownRest', () => {
  const base = 'oauth-protected-resource';

  it('extracts the inserted path after the well-known base', () => {
    expect(extractWellKnownRest('/.well-known/oauth-protected-resource/mcp', base)).toBe('mcp');
  });

  it('preserves nested inserted paths', () => {
    expect(extractWellKnownRest('/.well-known/oauth-protected-resource/mcp/sub', base)).toBe(
      'mcp/sub',
    );
  });

  it('strips the query string', () => {
    expect(extractWellKnownRest('/.well-known/oauth-protected-resource/mcp?x=1&y=2', base)).toBe(
      'mcp',
    );
  });

  it('percent-decodes the inserted path', () => {
    expect(extractWellKnownRest('/.well-known/oauth-protected-resource/a%20b', base)).toBe('a b');
  });

  it('returns the raw path when percent-decoding fails', () => {
    expect(extractWellKnownRest('/.well-known/oauth-protected-resource/%zz', base)).toBe('%zz');
  });

  it('returns an empty string for an undefined URL', () => {
    expect(extractWellKnownRest(undefined, base)).toBe('');
  });

  it('returns an empty string when the marker is absent', () => {
    expect(extractWellKnownRest('/.well-known/oauth-authorization-server/mcp', base)).toBe('');
    expect(extractWellKnownRest('/.well-known/oauth-protected-resource', base)).toBe('');
  });
});

describe('createWellKnownController', () => {
  it('returns a class (function)', () => {
    expect(typeof createWellKnownController()).toBe('function');
  });

  it('applies @Controller(".well-known") to the returned class', () => {
    expect(Reflect.getMetadata('path', createWellKnownController())).toBe('.well-known');
  });

  it('registers GET routes at the RFC 9728 / RFC 8414 paths', () => {
    const proto = createWellKnownController().prototype as Record<string, object>;
    // Nest 11 is installed in this workspace → named-wildcard syntax.
    const expected: Record<string, string> = {
      getProtectedResourceMetadata: 'oauth-protected-resource',
      getProtectedResourceMetadataForPath: 'oauth-protected-resource/*rest',
      getAuthorizationServerMetadata: 'oauth-authorization-server',
      getAuthorizationServerMetadataForPath: 'oauth-authorization-server/*rest',
    };
    for (const [method, path] of Object.entries(expected)) {
      expect(Reflect.getMetadata('path', proto[method])).toBe(path);
      expect(Reflect.getMetadata('method', proto[method])).toBe(RequestMethod.GET);
    }
  });

  describe('getProtectedResourceMetadata()', () => {
    it('serves the configured RFC 9728 document', () => {
      const meta = makeInstance(baseOptions).getProtectedResourceMetadata();
      expect(meta).toEqual({
        resource: 'https://mcp.example.com/mcp',
        authorization_servers: ['https://as.example.com'],
        scopes_supported: ['mcp:read', 'mcp:write'],
        bearer_methods_supported: ['header'],
        resource_name: 'Example MCP Server',
      });
    });

    it('path-insertion variant serves the identical document for the configured path', () => {
      const instance = makeInstance(baseOptions);
      expect(
        instance.getProtectedResourceMetadataForPath({
          originalUrl: '/.well-known/oauth-protected-resource/mcp',
        }),
      ).toEqual(instance.getProtectedResourceMetadata());
    });

    it('path-insertion variant tolerates trailing slashes on the inserted path', () => {
      const instance = makeInstance(baseOptions);
      expect(
        instance.getProtectedResourceMetadataForPath({
          originalUrl: '/.well-known/oauth-protected-resource/mcp/',
        }),
      ).toEqual(instance.getProtectedResourceMetadata());
    });

    it('path-insertion variant falls back to req.url when originalUrl is absent', () => {
      const instance = makeInstance(baseOptions);
      expect(
        instance.getProtectedResourceMetadataForPath({
          url: '/.well-known/oauth-protected-resource/mcp',
        }),
      ).toEqual(instance.getProtectedResourceMetadata());
    });

    it('path-insertion variant throws NotFoundException for a non-matching path', () => {
      const instance = makeInstance(baseOptions);
      expect(() =>
        instance.getProtectedResourceMetadataForPath({
          originalUrl: '/.well-known/oauth-protected-resource/other',
        }),
      ).toThrow(NotFoundException);
    });

    it('path-insertion variant 404s any inserted path when the resource has no path', () => {
      const instance = makeInstance({ ...baseOptions, resource: 'https://mcp.example.com' });
      expect(() =>
        instance.getProtectedResourceMetadataForPath({
          originalUrl: '/.well-known/oauth-protected-resource/mcp',
        }),
      ).toThrow(NotFoundException);
    });

    it('parses under the SDK OAuthProtectedResourceMetadataSchema', () => {
      const meta = makeInstance(baseOptions).getProtectedResourceMetadata();
      const parsed = OAuthProtectedResourceMetadataSchema.safeParse(meta);
      expect(parsed.success).toBe(true);
    });

    it('omits scopes_supported and resource_name when not configured (JSON-drop)', () => {
      const meta = makeInstance({
        resource: 'https://mcp.example.com/mcp',
        authorizationServers: ['https://as.example.com'],
      }).getProtectedResourceMetadata();

      expect(meta.scopes_supported).toBeUndefined();
      expect(meta.resource_name).toBeUndefined();
      // JSON round-trip drops the undefined keys entirely.
      expect(JSON.parse(JSON.stringify(meta))).toEqual({
        resource: 'https://mcp.example.com/mcp',
        authorization_servers: ['https://as.example.com'],
        bearer_methods_supported: ['header'],
      });
      expect(OAuthProtectedResourceMetadataSchema.safeParse(meta).success).toBe(true);
    });

    it('constructor-injects options (same class serves whichever options DI provides)', () => {
      const other = makeInstance({
        ...baseOptions,
        resource: 'https://other.example.com/mcp',
      });
      expect(makeInstance(baseOptions).getProtectedResourceMetadata().resource).toBe(
        'https://mcp.example.com/mcp',
      );
      expect(other.getProtectedResourceMetadata().resource).toBe('https://other.example.com/mcp');
    });
  });

  describe('legacy authorization-server mirror', () => {
    it('throws NotFoundException when legacyOAuthMetadata is not configured', () => {
      const instance = makeInstance(baseOptions);
      expect(() => instance.getAuthorizationServerMetadata()).toThrow(NotFoundException);
    });

    it('path-insertion variant also throws NotFoundException when not configured', () => {
      const instance = makeInstance(baseOptions);
      expect(() => instance.getAuthorizationServerMetadataForPath()).toThrow(NotFoundException);
    });

    it('returns the configured document verbatim', () => {
      const legacyOAuthMetadata = {
        issuer: 'https://as.example.com',
        authorization_endpoint: 'https://as.example.com/authorize',
        token_endpoint: 'https://as.example.com/token',
      };
      const instance = makeInstance({ ...baseOptions, legacyOAuthMetadata });
      expect(instance.getAuthorizationServerMetadata()).toBe(legacyOAuthMetadata);
      expect(instance.getAuthorizationServerMetadataForPath()).toBe(legacyOAuthMetadata);
    });
  });

  describe('@Header response metadata', () => {
    it('@nestjs/common Header stores entries under the __headers__ metadata key', () => {
      // Runtime probe — keeps the assertions below honest if Nest renames the key.
      class Probe {
        m() {}
      }
      Header('X-Probe', 'probe')(
        Probe.prototype,
        'm',
        Object.getOwnPropertyDescriptor(Probe.prototype, 'm') as PropertyDescriptor,
      );
      expect(Reflect.getMetadata(HEADERS_METADATA, Probe.prototype.m)).toContainEqual({
        name: 'X-Probe',
        value: 'probe',
      });
    });

    it.each([
      'getProtectedResourceMetadata',
      'getProtectedResourceMetadataForPath',
      'getAuthorizationServerMetadata',
      'getAuthorizationServerMetadataForPath',
    ])('%s carries Cache-Control and CORS headers', (method) => {
      const proto = createWellKnownController().prototype as Record<string, object>;
      const headers = Reflect.getMetadata(HEADERS_METADATA, proto[method]);
      expect(headers).toContainEqual({ name: 'Cache-Control', value: 'public, max-age=3600' });
      expect(headers).toContainEqual({ name: 'Access-Control-Allow-Origin', value: '*' });
    });
  });
});

describe('createWellKnownController decorators', () => {
  it('applies class decorators to the generated controller', () => {
    const seen: unknown[] = [];
    const marker: ClassDecorator = (target) => {
      seen.push(target);
      Reflect.defineMetadata('test:allow-anonymous', true, target);
    };

    const Ctrl = createWellKnownController([marker]);

    expect(seen).toEqual([Ctrl]);
    expect(Reflect.getMetadata('test:allow-anonymous', Ctrl)).toBe(true);
  });

  it('honors a decorator that replaces the class', () => {
    class Replacement {}
    const replacing: ClassDecorator = () => Replacement as never;

    expect(createWellKnownController([replacing])).toBe(Replacement);
  });

  it('generates an undecorated controller when no decorators are given', () => {
    const Ctrl = createWellKnownController();
    expect(Reflect.getMetadata('test:allow-anonymous', Ctrl)).toBeUndefined();
  });

  it('is always marked @IsMcpPublic — RFC 9728 discovery documents are public by spec', () => {
    const Ctrl = createWellKnownController();
    expect(Reflect.getMetadata('nest-mcp:http-public', Ctrl)).toBe(true);
  });
});
