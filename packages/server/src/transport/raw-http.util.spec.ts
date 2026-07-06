import { describe, expect, it } from 'vitest';
import { rawRequestOf, rawResponseOf } from './raw-http.util';

describe('rawRequestOf', () => {
  it('returns the request itself when no wrapper is present (Express)', () => {
    const req = { headers: {} };
    expect(rawRequestOf(req)).toBe(req);
  });

  it('unwraps request.raw when present (Fastify)', () => {
    const raw = { headers: {} };
    const req = { raw, headers: {} };
    expect(rawRequestOf(req)).toBe(raw);
  });

  it('mirrors the guard-verified auth onto the raw request (the SDK reads req.auth)', () => {
    const raw = { headers: {} } as { auth?: unknown };
    const auth = { token: 't', clientId: 'c' };
    const req = { raw, auth };

    expect(rawRequestOf(req)).toBe(raw);
    expect(raw.auth).toBe(auth);
  });

  it('leaves the raw request untouched when no auth was attached', () => {
    const raw = { headers: {} };
    const req = { raw };

    rawRequestOf(req);
    expect('auth' in raw).toBe(false);
  });
});

describe('rawResponseOf', () => {
  it('returns the response itself when no wrapper is present (Express)', () => {
    const res = {};
    expect(rawResponseOf(res)).toBe(res);
  });

  it('unwraps response.raw when present (Fastify)', () => {
    const raw = {};
    const res = { raw };
    expect(rawResponseOf(res)).toBe(raw);
  });
});
