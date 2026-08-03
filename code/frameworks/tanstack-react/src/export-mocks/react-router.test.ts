// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { fireEvent, render, waitFor } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate as realNavigate,
  RouterContextProvider,
} from '@tanstack/react-router';
import type { AnyRootRoute, Router } from '@tanstack/react-router';

import { createFileRoute, Link, Navigate, useNavigate, useRouter } from './react-router.ts';
import { onNavigate } from './spies.ts';
import { setStoryNavigation } from '../story-navigation.ts';

const build = (path: string) => {
  const root = createRootRoute();
  return createFileRoute(path)({
    component: () => null,
    getParentRoute: () => root,
  }) as any;
};

describe('createFileRoute', () => {
  it('keeps the route id while normalizing pathless group segments', () => {
    const Route = build('/(group)/page');

    expect(Route.options.id).toBe('/(group)/page');
    expect(Route.options.path).toBe('/page');
    expect(Route.options.fullPath).toBe('/page');
  });

  it('normalizes nested pathless group segments', () => {
    const Route = build('/(a)/(b)/page');

    expect(Route.options.id).toBe('/(a)/(b)/page');
    expect(Route.options.path).toBe('/page');
    expect(Route.options.fullPath).toBe('/page');
  });

  it('keeps a pathless layout nested under a pathful segment id-only', () => {
    const Route = build('/posts/_layout');

    expect(Route.options.id).toBe('/posts/_layout');
    expect(Route.options.path).toBeUndefined();
    expect(Route.options.fullPath).toBeUndefined();
  });

  it('keeps a group nested under a pathful segment id-only', () => {
    const Route = build('/posts/(admin)');

    expect(Route.options.id).toBe('/posts/(admin)');
    expect(Route.options.path).toBeUndefined();
    expect(Route.options.fullPath).toBeUndefined();
  });

  it('keeps a pure pathless group route id-only (no path)', () => {
    const Route = build('/(group)');

    expect(Route.options.id).toBe('/(group)');
    expect(Route.options.path).toBeUndefined();
    expect(Route.options.fullPath).toBeUndefined();
  });

  it('keeps a pure pathless layout route id-only (no path)', () => {
    const Route = build('/_authed');

    expect(Route.options.id).toBe('/_authed');
    expect(Route.options.path).toBeUndefined();
    expect(Route.options.fullPath).toBeUndefined();
  });

  it('keeps the root index route path', () => {
    const Route = build('/');

    expect(Route.options.id).toBe('/');
    expect(Route.options.path).toBe('/');
    expect(Route.options.fullPath).toBe('/');
  });

  it('trims trailing-underscore (un-nesting) segments', () => {
    const Route = build('/posts_/$postId');

    expect(Route.options.id).toBe('/posts_/$postId');
    expect(Route.options.path).toBe('/posts/$postId');
    expect(Route.options.fullPath).toBe('/posts/$postId');
  });

  it('normalizes pathless `_layout` segments the same way the generator does', () => {
    const Route = build('/_layout/page');

    expect(Route.options.id).toBe('/_layout/page');
    expect(Route.options.path).toBe('/page');
    expect(Route.options.fullPath).toBe('/page');
  });

  it('normalizes a mix of `_layout` and `(group)` segments', () => {
    const Route = build('/_layout/(group)/page');

    expect(Route.options.id).toBe('/_layout/(group)/page');
    expect(Route.options.path).toBe('/page');
    expect(Route.options.fullPath).toBe('/page');
  });

  it('lets an explicit options.path win over a pathless id', () => {
    const root = createRootRoute();
    const Route = createFileRoute('/_authed')({
      component: () => null,
      getParentRoute: () => root,
      path: '/authed',
    }) as any;

    expect(Route.options.id).toBe('/_authed');
    expect(Route.options.path).toBe('/authed');
  });

  it('treats an empty id as the root index path', () => {
    const Route = build('');

    expect(Route.options.path).toBe('/');
    expect(Route.options.fullPath).toBe('/');
  });
});

describe('Navigate', () => {
  beforeEach(() => {
    onNavigate.mockClear();
    setStoryNavigation(undefined);
  });

  it('renders outside a storybook hooks context without throwing', () => {
    expect(() => renderToString(React.createElement(Navigate, { to: '/somewhere' }))).not.toThrow();
  });

  it('calls onNavigate once under StrictMode double-invoked effects', () => {
    render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(Navigate, { to: '/somewhere' })
      )
    );

    expect(onNavigate).toHaveBeenCalledOnce();
  });
});

let storyRouter: Router<AnyRootRoute>;

/**
 * Mounts a tree inside a real two route router. The tree is mounted rather
 * than string rendered, because the recorders under test include an effect,
 * and effects only run on a mount.
 */
function renderInRouter(children: React.ReactNode) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    path: '/',
    getParentRoute: () => rootRoute,
  });
  const targetRoute = createRoute({
    path: '/nav-target',
    getParentRoute: () => rootRoute,
  });
  rootRoute.addChildren([indexRoute, targetRoute]);

  storyRouter = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  }) as unknown as Router<AnyRootRoute>;

  return render(
    React.createElement(RouterContextProvider, { router: storyRouter } as never, children)
  );
}

/**
 * Mounts a probe inside the router and returns whatever the probe called, so a
 * hook or a mock component can be exercised on its own.
 */
function probeInRouter<T>(useProbe: () => T): T {
  let captured: T | undefined;

  const Probe = () => {
    captured = useProbe();
    return null;
  };

  renderInRouter(React.createElement(Probe));

  return captured as T;
}

function currentPath() {
  return storyRouter.state.location.pathname;
}

/**
 * Mounts a `Link` and clicks it. A real anchor in a real DOM, because the
 * click handler delegates to the router's own handler once the story enables
 * navigation, and that handler reads the clicked element and flushes state.
 */
function clickLink(props: Record<string, unknown> = {}) {
  const { container } = renderInRouter(
    React.createElement(Link, { to: '/nav-target', ...props }, 'nav target')
  );
  const anchor = container.querySelector('a') as HTMLAnchorElement;
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });

  fireEvent(anchor, click);

  return { anchor, click };
}

describe('navigation contract', () => {
  beforeEach(() => {
    onNavigate.mockClear();
    setStoryNavigation(undefined);
  });

  it('records a useNavigate call without navigating by default', async () => {
    const navigate = probeInRouter(() => useNavigate());
    await navigate({ to: '/nav-target' });

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target' });
    expect(currentPath()).toBe('/');
  });

  it('navigates and records when the story enables navigation', async () => {
    setStoryNavigation(true);
    const navigate = probeInRouter(() => useNavigate());
    await navigate({ to: '/nav-target' });

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target' });
    expect(currentPath()).toBe('/nav-target');
  });

  it('records a router.navigate call without navigating by default', async () => {
    const router = probeInRouter(() => useRouter());
    await router.navigate({ to: '/nav-target' });

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target' });
    expect(currentPath()).toBe('/');
  });

  it('leaves the rest of the router untouched', () => {
    const router = probeInRouter(() => useRouter());
    expect(typeof router.buildLocation).toBe('function');
    expect(router.state).toBeDefined();
  });

  it('records a Link click and stays put by default', () => {
    const { click } = clickLink();

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target', from: '/' });
    expect(click.defaultPrevented).toBe(true);
    expect(currentPath()).toBe('/');
  });

  it('navigates on a Link click when the story enables navigation', async () => {
    setStoryNavigation(true);
    const { click } = clickLink();

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target', from: '/' });
    // Still prevented: the anchor's own default action would take the whole
    // preview frame out of the story, so the router does the navigating.
    expect(click.defaultPrevented).toBe(true);
    await waitFor(() => expect(currentPath()).toBe('/nav-target'));
  });

  it('records a Navigate render and renders nothing by default', () => {
    const rendered = probeInRouter(() => Navigate({ to: '/nav-target' } as never));

    expect(rendered).toBeNull();
    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target' });
    expect(currentPath()).toBe('/');
  });

  it('renders the real Navigate when the story enables navigation', () => {
    setStoryNavigation(true);
    const rendered = probeInRouter(() => Navigate({ to: '/nav-target' } as never));

    expect((rendered as unknown as React.ReactElement).type).toBe(realNavigate);
    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target' });
  });

  it('keeps the passed through router members callable through the proxy', () => {
    const router = probeInRouter(() => useRouter());

    expect(router.buildLocation({ to: '/nav-target' }).pathname).toBe('/nav-target');
    expect(router.state.location.pathname).toBe('/');
    expect(router.matchRoutes(router.state.location).length).toBeGreaterThan(0);
  });

  it('hands out the same navigate function on every access, as the real router does', () => {
    const router = probeInRouter(() => useRouter());

    expect(router.navigate).toBe(router.navigate);
  });

  it('passes the missing router through outside a provider, quietly when asked', () => {
    let captured: unknown = 'nothing captured';
    const Probe = () => {
      captured = useRouter({ warn: false });
      return null;
    };

    renderToString(React.createElement(Probe));

    // A proxy needs an object, so the mock has to hand the nothing back
    // untouched, and it has to forward `warn: false` or the real hook
    // complains on the console, which this suite treats as a failure.
    expect(captured).toBeNull();
  });
});
