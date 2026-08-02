import { beforeEach, describe, expect, it } from 'vitest';

import {
  createServerFn,
  deleteCookie,
  getCookie,
  getResponseHeaders,
  requestHandler,
  setCookie,
  setResponseHeaders,
} from './start.ts';

const STATE_SYMBOL = Symbol.for('storybook.tanstack-react.start-server.state');

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[STATE_SYMBOL];
});

type MockCreateServerFnBuilder = {
  validator: (validator: (input: unknown) => unknown) => {
    handler: (handlerFn: () => Promise<string>) => () => Promise<string>;
  };
};

describe('createServerFn', () => {
  it('supports TanStack Start validator chain syntax', async () => {
    const serverFn = (createServerFn() as unknown as MockCreateServerFnBuilder)
      .validator((input: unknown) => input)
      .handler(async () => 'ok');

    await expect(serverFn()).resolves.toBe('ok');
  });
});

describe('cookie scope', () => {
  it('does not read back a cookie it only wrote to the response', () => {
    setCookie('probe', 'abc');
    expect(getCookie('probe')).toBeUndefined();
  });

  it('still records the write on the response headers', () => {
    setCookie('probe', 'abc');
    expect(getResponseHeaders().get('set-cookie')).toContain('probe=abc');
  });

  it('does not remove a request cookie when deleted, only expires it on the response', async () => {
    const request = new Request('http://localhost/', { headers: { cookie: 'probe=abc' } });

    await requestHandler(() => {
      deleteCookie('probe');
      expect(getCookie('probe')).toBe('abc');
      expect(getResponseHeaders().get('set-cookie')).toContain('probe=');
      expect(getResponseHeaders().get('set-cookie')).toContain('Max-Age=0');
    })(request);
  });
});

describe('setResponseHeaders', () => {
  it('merges onto existing headers instead of replacing them', () => {
    setCookie('probe', 'abc');
    setResponseHeaders({ 'x-custom': '1' });
    expect(getResponseHeaders().get('set-cookie')).toContain('probe=abc');
    expect(getResponseHeaders().get('x-custom')).toBe('1');
  });
});
