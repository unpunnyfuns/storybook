import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMiddleware, createServerFn as createServerFnMock, createStart } from './start.ts';
import { getStartContext } from './start-storage-context.ts';

/**
 * `plugins/module-interception.ts` redirects this specifier to our own mock in
 * a Storybook build, which is what lets the real `__executeServer` find a start
 * context in a browser. Vitest applies no such redirect, so the real
 * AsyncLocalStorage module would load and throw instead. Mirror the redirect
 * here so these tests exercise the wiring stories actually get.
 */
vi.mock('@tanstack/start-storage-context', () => import('./start-storage-context.ts'));

/**
 * The mock's surface is wider than the real builder's declared type in two
 * places, so the tests view the builder through this type rather than through
 * `typeof createServerFn`: `validator` is a Storybook-only alias the mock has
 * always exposed for `inputValidator`, and `.handler()` returns a spy so a
 * story can override what a server function resolves to.
 */
type MockServerFnBuilder = {
  middleware: (middleware: Array<unknown>) => MockServerFnBuilder;
  validator: (validator: unknown) => MockServerFnBuilder;
  handler: (handler: (opts?: any) => unknown) => Mock<(opts?: any) => Promise<any>>;
};

const createServerFn = createServerFnMock as unknown as (options?: {
  method?: 'GET' | 'POST';
}) => MockServerFnBuilder;

describe('createServerFn', () => {
  beforeEach(() => {
    createStart(() => ({}));
  });

  afterEach(() => {
    delete (globalThis as any).__TSS_START_OPTIONS__;
  });

  it('supports TanStack Start validator chain syntax', async () => {
    const serverFn = createServerFn()
      .validator((input: unknown) => input)
      .handler(async () => 'ok');

    await expect(serverFn()).resolves.toBe('ok');
  });
});

describe('createServerFn delegation', () => {
  beforeEach(() => {
    createStart(() => ({}));
  });

  afterEach(() => {
    delete (globalThis as any).__TSS_START_OPTIONS__;
  });

  it('runs the client middleware phase', async () => {
    const seen: Array<string> = [];
    const mw = createMiddleware({ type: 'function' }).client(({ next }) => {
      seen.push('client');
      return next();
    });
    const call = createServerFn({ method: 'GET' })
      .middleware([mw])
      .handler(() => 'ok');
    await expect(call()).resolves.toBe('ok');
    expect(seen).toEqual(['client']);
  });

  it('runs the server middleware phase and passes its context to the handler', async () => {
    const mw = createMiddleware({ type: 'function' }).server(({ next }) =>
      next({ context: { user: 'ada' } })
    );
    const call = createServerFn({ method: 'GET' })
      .middleware([mw])
      .handler(({ context }: any) => context.user);
    await expect(call()).resolves.toBe('ada');
  });

  it('applies the validator before the handler', async () => {
    const call = createServerFn({ method: 'POST' })
      .validator(Number)
      .handler(({ data }: any) => data + 1);
    await expect(call({ data: '1' })).resolves.toBe(2);
  });

  it('is still a spy that a story can override', async () => {
    const call = createServerFn({ method: 'GET' }).handler(() => 'real');
    call.mockResolvedValue('mocked');
    await expect(call()).resolves.toBe('mocked');
    expect(call).toHaveBeenCalled();
  });

  it('runs the real chain again after a mock reset', async () => {
    const call = createServerFn({ method: 'GET' }).handler(() => 'real');
    call.mockResolvedValue('mocked');
    call.mockReset();
    await expect(call()).resolves.toBe('real');
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
