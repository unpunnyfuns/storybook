import { beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router';
import type { AnyRootRoute, Router } from '@tanstack/react-router';

import { createFileRoute, useNavigate, useRouter } from './react-router.ts';
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

let storyRouter: Router<AnyRootRoute>;

/**
 * Renders a probe inside a real two route router and returns whatever the
 * probe's hook returned. A string render is enough here: the navigation hooks
 * only need the router in context, and the assertions read the router's own
 * state rather than the DOM.
 */
function renderHookInRouter<T>(useHook: () => T): T {
  let captured: T | undefined;

  const Probe = () => {
    captured = useHook();
    return null;
  };

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

  renderToString(
    React.createElement(
      RouterContextProvider,
      { router: storyRouter } as never,
      React.createElement(Probe)
    )
  );

  return captured as T;
}

function currentPath() {
  return storyRouter.state.location.pathname;
}

describe('navigation contract', () => {
  beforeEach(() => {
    onNavigate.mockClear();
    setStoryNavigation(undefined);
  });

  it('records a useNavigate call without navigating by default', async () => {
    const navigate = renderHookInRouter(() => useNavigate());
    await navigate({ to: '/nav-target' });

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target' });
    expect(currentPath()).toBe('/');
  });

  it('navigates and records when the story enables navigation', async () => {
    setStoryNavigation(true);
    const navigate = renderHookInRouter(() => useNavigate());
    await navigate({ to: '/nav-target' });

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target' });
    expect(currentPath()).toBe('/nav-target');
  });

  it('records a router.navigate call without navigating by default', async () => {
    const router = renderHookInRouter(() => useRouter());
    await router.navigate({ to: '/nav-target' });

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target' });
    expect(currentPath()).toBe('/');
  });

  it('leaves the rest of the router untouched', () => {
    const router = renderHookInRouter(() => useRouter());
    expect(typeof router.buildLocation).toBe('function');
    expect(router.state).toBeDefined();
  });

  it('keeps the passed through router members callable through the proxy', () => {
    const router = renderHookInRouter(() => useRouter());

    expect(router.buildLocation({ to: '/nav-target' }).pathname).toBe('/nav-target');
    expect(router.state.location.pathname).toBe('/');
    expect(router.matchRoutes(router.state.location).length).toBeGreaterThan(0);
  });
});
