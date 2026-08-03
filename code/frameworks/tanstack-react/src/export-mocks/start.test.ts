import { describe, expect, it } from 'vitest';

import { createServerFn, createStart } from './start.ts';

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

describe('createStart', () => {
  it('createStart returns a start instance', async () => {
    const start = createStart(() => ({ requestMiddleware: [] }));
    expect(typeof start.createMiddleware).toBe('function');
    const middleware = start.createMiddleware({ type: 'function' });
    expect(typeof middleware.server).toBe('function');
    await expect(start.getOptions()).resolves.toEqual({ requestMiddleware: [] });
  });
});
