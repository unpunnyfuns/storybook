import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { once } from 'storybook/internal/client-logger';

import { isRedirect, redirect } from '@tanstack/router-core';

import { setStoryStartContext } from '../story-start-context.ts';
import { createMiddleware, createServerFn as createServerFnMock, createStart } from './start.ts';
import { getStartContext } from './start-storage-context.ts';

vi.mock('storybook/internal/client-logger');

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
    setStoryStartContext(undefined);
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

  it('hands FormData to the handler as FormData', async () => {
    const data = new FormData();
    data.set('x', 'ada');

    const call = createServerFn({ method: 'POST' }).handler(({ data: received }: any) =>
      received.get('x')
    );

    await expect(call({ data })).resolves.toBe('ada');
  });

  it("copies FormData rather than sharing the story's instance", async () => {
    const data = new FormData();
    data.set('x', 'ada');

    const call = createServerFn({ method: 'POST' }).handler(
      ({ data: received }: any) => received === data
    );

    await expect(call({ data })).resolves.toBe(false);
  });

  it('still serializes context alongside a FormData payload', async () => {
    const mw = createMiddleware({ type: 'function' }).client(({ next }) =>
      next({ sendContext: { user: 'ada' } })
    );

    const data = new FormData();
    data.set('x', '1');

    const call = createServerFn({ method: 'POST' })
      .middleware([mw])
      .handler(({ context, data: received }: any) => `${context.user}:${received.get('x')}`);

    await expect(call({ data })).resolves.toBe('ada:1');
  });

  it("passes the story's start context to the handler", async () => {
    setStoryStartContext({ user: 'ada' });
    const call = createServerFn({ method: 'GET' }).handler(({ context }: any) => context.user);
    await expect(call()).resolves.toBe('ada');
  });

  it('hands a Response back without serializing it', async () => {
    const call = createServerFn({ method: 'GET' }).handler(
      () => new Response('raw body', { status: 200 })
    );
    const result = await call();
    expect(result).toBeInstanceOf(Response);
    await expect(result.text()).resolves.toBe('raw body');
  });

  it('marks a raw Response the way the real server does', async () => {
    const call = createServerFn({ method: 'GET' }).handler(() => new Response('raw body'));
    const result = await call();
    expect(result.headers.get('x-tss-raw')).toBe('true');
  });

  it('hands back a Response the handler threw rather than rejecting', async () => {
    const call = createServerFn({ method: 'GET' }).handler(() => {
      throw new Response('boom', { status: 500 });
    });
    const result = await call();
    expect(result.status).toBe(500);
    await expect(result.text()).resolves.toBe('boom');
  });

  it('throws a redirect rather than handing it back as a Response', async () => {
    const call = createServerFn({ method: 'GET' }).handler(() => redirect({ to: '/after' }));
    const error = await call().catch((thrown: unknown) => thrown);
    expect(isRedirect(error)).toBe(true);
    expect((error as any).options.to).toBe('/after');
  });

  it('still copies a non-Response result rather than sharing the handler reference', async () => {
    const produced = { n: 1 };
    const call = createServerFn({ method: 'GET' }).handler(() => produced);
    const result = await call();
    expect(result).toEqual({ n: 1 });
    expect(result).not.toBe(produced);
  });
});

describe('global function middleware', () => {
  afterEach(() => {
    delete (globalThis as any).__TSS_START_OPTIONS__;
  });

  it('warns that configured global middleware will not run', () => {
    createStart(() => ({
      functionMiddleware: [createMiddleware({ type: 'function' })],
    }));
    expect(once.warn).toHaveBeenCalledWith(expect.stringContaining('functionMiddleware'));
  });

  it('does not warn when no global middleware is configured', () => {
    createStart(() => ({}));
    expect(once.warn).not.toHaveBeenCalled();
  });

  it('warns when the config function is async', async () => {
    createStart(async () => ({
      functionMiddleware: [createMiddleware({ type: 'function' })],
    }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(once.warn).toHaveBeenCalledWith(expect.stringContaining('functionMiddleware'));
  });

  it('warns once per createStart call', () => {
    createStart(() => ({
      functionMiddleware: [createMiddleware({ type: 'function' })],
    }));
    expect(once.warn).toHaveBeenCalledTimes(1);
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
