import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate as realNavigate,
  RouterContextProvider,
} from '@tanstack/react-router';
import type { AnyRootRoute, Router } from '@tanstack/react-router';
import { HooksContext } from 'storybook/internal/preview-api';

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

type ClickHandler = (event: React.MouseEvent) => void;

/**
 * Renders a `Link` through the probe and fires its click handler. The anchor
 * is never committed to a DOM, so the handler is taken off the element the
 * component returned.
 */
function clickLink(props: Record<string, unknown> = {}) {
  const anchor = renderHookInRouter(() =>
    Link({ to: '/nav-target', ...props })
  ) as React.ReactElement<{ onClick: ClickHandler }>;
  const preventDefault = vi.fn();

  anchor.props.onClick({ preventDefault } as unknown as React.MouseEvent);

  return { anchor, preventDefault };
}

/**
 * Renders a `Navigate` through the probe. Its recorder is `useEffect` from
 * `storybook/internal/preview-api`, which throws unless a story hooks context
 * is present, so one is installed for the render and the queued effects are
 * triggered by hand the way the preview would trigger them.
 */
function renderNavigate(to: string) {
  const hooks = new HooksContext();
  hooks.currentPhase = 'MOUNT';
  const storyGlobals = globalThis as typeof globalThis & { STORYBOOK_HOOKS_CONTEXT?: unknown };
  const previousContext = storyGlobals.STORYBOOK_HOOKS_CONTEXT;
  storyGlobals.STORYBOOK_HOOKS_CONTEXT = hooks;

  try {
    const rendered = renderHookInRouter(() => Navigate({ to } as never));
    return { rendered, triggerEffects: () => hooks.triggerEffects() };
  } finally {
    storyGlobals.STORYBOOK_HOOKS_CONTEXT = previousContext;
  }
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

  it('records a Link click and stays put by default', () => {
    const { preventDefault } = clickLink();

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target', from: '/' });
    expect(preventDefault).toHaveBeenCalled();
    expect(currentPath()).toBe('/');
  });

  it('navigates on a Link click when the story enables navigation', async () => {
    setStoryNavigation(true);
    const { preventDefault } = clickLink();

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target', from: '/' });
    // Still prevented: the anchor's own default action would take the whole
    // preview frame out of the story, so the router does the navigating.
    expect(preventDefault).toHaveBeenCalled();
    await vi.waitFor(() => expect(currentPath()).toBe('/nav-target'));
  });

  it('records a Navigate render and renders nothing by default', () => {
    const { rendered, triggerEffects } = renderNavigate('/nav-target');

    expect(rendered).toBeNull();
    // The recorder is an effect, so it has not run at the point the component
    // returned. Nothing about the contract depends on when it runs, only that
    // it does.
    expect(onNavigate).not.toHaveBeenCalled();

    triggerEffects();

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target' });
    expect(currentPath()).toBe('/');
  });

  it('renders the real Navigate when the story enables navigation', () => {
    setStoryNavigation(true);
    const { rendered, triggerEffects } = renderNavigate('/nav-target');

    expect((rendered as unknown as React.ReactElement).type).toBe(realNavigate);

    triggerEffects();

    expect(onNavigate).toHaveBeenCalledWith({ to: '/nav-target' });
  });

  it('keeps the passed through router members callable through the proxy', () => {
    const router = renderHookInRouter(() => useRouter());

    expect(router.buildLocation({ to: '/nav-target' }).pathname).toBe('/nav-target');
    expect(router.state.location.pathname).toBe('/');
    expect(router.matchRoutes(router.state.location).length).toBeGreaterThan(0);
  });

  it('hands out the same navigate function on every access, as the real router does', () => {
    const router = renderHookInRouter(() => useRouter());

    expect(router.navigate).toBe(router.navigate);
  });
});
