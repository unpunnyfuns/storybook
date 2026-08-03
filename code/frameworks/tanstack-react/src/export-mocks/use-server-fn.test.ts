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
import { useServerFn } from './start.ts';

const STORY_NAVIGATION_SYMBOL = Symbol.for('storybook.tanstack-react.story-navigation');

/**
 * Opts the wrapped call into real navigation, the way a story setting
 * `parameters.tanstack.router.navigate` does, and clears the flag afterwards so
 * it cannot leak into the next test.
 */
async function withStoryNavigation<T>(run: () => Promise<T>) {
  const globals = globalThis as Record<symbol, unknown>;
  globals[STORY_NAVIGATION_SYMBOL] = true;

  try {
    return await run();
  } finally {
    delete globals[STORY_NAVIGATION_SYMBOL];
  }
}

/**
 * These live apart from `start.test.ts` because they need a DOM and that file
 * must not have one. `@vitest-environment` is per file, and happy-dom
 * implements the fetch spec's forbidden header list, so a `Request` built with
 * a `cookie` header silently loses it. The cookie scope tests in `start.test.ts`
 * seed a request cookie exactly that way and would fail for a reason that has
 * nothing to do with the code under test.
 */
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
