// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  RouterProvider,
} from '@tanstack/react-router';

import { onNavigate } from './spies.ts';
import { createServerFn, useServerFn } from './start.ts';

const STORY_NAVIGATION_SYMBOL = Symbol.for('storybook.tanstack-react.story-navigation');

async function withStoryNavigation<T>(run: () => Promise<T>) {
  const globals = globalThis as Record<symbol, unknown>;
  globals[STORY_NAVIGATION_SYMBOL] = true;

  try {
    return await run();
  } finally {
    delete globals[STORY_NAVIGATION_SYMBOL];
  }
}

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

describe('useServerFn', () => {
  function renderProbe(serverFn: () => Promise<unknown>) {
    let call: (() => Promise<unknown>) | undefined;

    function Probe() {
      call = useServerFn(serverFn);
      return null;
    }

    render(React.createElement(Probe));
    return () => call!();
  }

  async function renderProbeInRouter(serverFn: () => Promise<unknown>) {
    let call: (() => Promise<unknown>) | undefined;

    function Probe() {
      call = useServerFn(serverFn);
      return null;
    }

    const root = createRootRoute();
    const index = createRoute({ path: '/', getParentRoute: () => root, component: Probe });
    const after = createRoute({
      path: '/after',
      getParentRoute: () => root,
      component: () => null,
    });
    root.addChildren([index, after]);

    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });

    await act(async () => {
      render(React.createElement(RouterProvider, { router } as any));
    });
    await waitFor(() => expect(call).toBeDefined());

    return { router, call: () => act(async () => call!()) };
  }

  it('navigates instead of rejecting when a server function throws a redirect', async () => {
    const call = renderProbe(async () => {
      throw redirect({ to: '/after' });
    });

    await expect(call()).resolves.toBeUndefined();
    expect(onNavigate).toHaveBeenCalledWith({ to: '/after' });
  });

  it('navigates instead of returning when a server function returns a redirect', async () => {
    const call = renderProbe(async () => redirect({ to: '/returned' }));

    await expect(call()).resolves.toBeUndefined();
    expect(onNavigate).toHaveBeenCalledWith({ to: '/returned' });
  });

  it('falls back to href when a redirect has no to', async () => {
    const call = renderProbe(async () => {
      throw redirect({ href: 'https://example.com/x' });
    });

    await expect(call()).resolves.toBeUndefined();
    expect(onNavigate).toHaveBeenCalledWith({ to: 'https://example.com/x' });
  });

  it('rethrows a non-redirect error unchanged', async () => {
    onNavigate.mockClear();
    const call = renderProbe(async () => {
      throw new Error('boom');
    });

    await expect(call()).rejects.toThrow('boom');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('returns the resolved value unchanged for a non-redirect result', async () => {
    const call = renderProbe(async () => 'ok');

    await expect(call()).resolves.toBe('ok');
  });

  it('records a redirect without navigating when the story has not opted in', async () => {
    onNavigate.mockClear();
    const { router, call } = await renderProbeInRouter(async () => {
      throw redirect({ to: '/after' });
    });

    await call();

    expect(onNavigate).toHaveBeenCalledWith({ to: '/after' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('records a redirect and navigates when the story opts in', async () => {
    onNavigate.mockClear();
    const { router, call } = await renderProbeInRouter(async () => {
      throw redirect({ to: '/after' });
    });

    await withStoryNavigation(() => call());

    expect(onNavigate).toHaveBeenCalledWith({ to: '/after' });
    expect(router.state.location.pathname).toBe('/after');
  });
});
