import { afterEach, describe, expect, it } from 'vitest';

import { createServerFn, createStart } from './start.ts';
import { getStartContext } from './start-storage-context.ts';

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

describe('start context wiring', () => {
  afterEach(() => {
    delete (globalThis as any).__TSS_START_OPTIONS__;
  });

  it('publishes start options so getStartOptions can find them', () => {
    createStart(() => ({ functionMiddleware: [] }));
    expect((globalThis as any).__TSS_START_OPTIONS__).toEqual({ functionMiddleware: [] });
  });

  it('publishes resolved options when getOptions is async, not the raw Promise', async () => {
    createStart(async () => ({ functionMiddleware: [] }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((globalThis as any).__TSS_START_OPTIONS__).toEqual({ functionMiddleware: [] });
  });

  it('provides a start context with a defined post-global-middleware context', () => {
    createStart(() => ({}));
    const context = getStartContext();
    expect(context).toBeDefined();
    expect(context.contextAfterGlobalMiddlewares).toBeDefined();
  });
});
