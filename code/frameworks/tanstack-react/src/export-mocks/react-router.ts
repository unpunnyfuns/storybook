import { createRoute } from '@tanstack/react-router';
export * from '@tanstack/react-router';

import { fn } from 'storybook/test';
import React from 'react';
import { useEffect } from 'storybook/internal/preview-api';

import {
  Link as _Link,
  Navigate as _NavigateComponent,
  useNavigate as _useNavigate,
  useRouter as _useRouter,
  useBlocker as _useBlocker,
  useMatch as _useMatch,
  useSearch as _useSearch,
  useParams as _useParams,
  useLocation as _useLocation,
  useRouterState as _useRouterState,
  useMatchRoute as _useMatchRoute,
  useLoaderData as _useLoaderData,
  useLoaderDeps as _useLoaderDeps,
  useRouteContext as _useRouteContext,
  useMatches as _useMatches,
  useParentMatches as _useParentMatches,
  useChildMatches as _useChildMatches,
  useCanGoBack as _useCanGoBack,
  useLinkProps as _useLinkProps,
} from '@tanstack/react-router';
import type { Navigate as _Navigate } from '@tanstack/react-router';
import { onNavigate } from './spies.ts';
import { NavigationModeContext, isSameRouteNavigation } from '../routing/navigation-mode.ts';
import { isPathlessFileRouteId, normalizeFileRoutePath } from '../routing/path-utils.ts';

// Public spy surface: play functions can assert navigation intents via
// `import { onNavigate } from '@storybook/tanstack-react/react-router'`.
export { onNavigate } from './spies.ts';

// Mock navigation hooks — backed by real implementations so they work in stories
export const useNavigate = fn(_useNavigate).mockName('@tanstack/react-router::useNavigate');
export const useRouter = fn(_useRouter).mockName('@tanstack/react-router::useRouter');
export const useBlocker = fn(_useBlocker).mockName('@tanstack/react-router::useBlocker');
export const useSearch = fn(_useSearch).mockName('@tanstack/react-router::useSearch');
export const useParams = fn(_useParams).mockName('@tanstack/react-router::useParams');
export const useLocation = fn(_useLocation).mockName('@tanstack/react-router::useLocation');
export const useRouterState = fn(_useRouterState).mockName(
  '@tanstack/react-router::useRouterState'
);
export const useLoaderData = fn(_useLoaderData).mockName('@tanstack/react-router::useLoaderData');
export const useLoaderDeps = fn(_useLoaderDeps).mockName('@tanstack/react-router::useLoaderDeps');
export const useRouteContext = fn(_useRouteContext).mockName(
  '@tanstack/react-router::useRouteContext'
);
export const useCanGoBack = fn(_useCanGoBack).mockName('@tanstack/react-router::useCanGoBack');
export const useLinkProps = fn(_useLinkProps).mockName('@tanstack/react-router::useLinkProps');

export const Navigate = ((props: any) => {
  const { to, href } = props;
  const mode = React.useContext(NavigationModeContext);
  const router = useRouter();
  const performed =
    mode === 'real' || (mode === 'same-route' && isSameRouteNavigation(router, props));

  useEffect(() => {
    onNavigate({ to: (to as string) || href });
  }, [to, href]);

  if (performed) {
    return React.createElement(_NavigateComponent as any, props);
  }
  return null;
}) as unknown as typeof _Navigate;

export const Link = ((props: any) => {
  const { to, children, ...rest } = props;
  const mode = React.useContext(NavigationModeContext);
  const location = useLocation();
  const router = useRouter();

  if (mode === 'spy') {
    return React.createElement(
      'a',
      {
        href: to,
        ...rest,
        // after the spread: a caller-supplied onClick must not clobber the
        // spy handler, or nothing prevents the anchor default
        onClick: (e: React.MouseEvent) => {
          rest.onClick?.(e);
          e.preventDefault();
          onNavigate({ to, from: location.href });
        },
      },
      children
    );
  }

  // Delegate to the real Link; TanStack skips its navigation handler when the
  // click event is default-prevented, which is how `'same-route'` blocks
  // cross-route destinations while still logging them.
  return React.createElement(_Link as any, {
    ...props,
    onClick: (e: React.MouseEvent) => {
      props.onClick?.(e);
      onNavigate({ to: to as string, from: location.href });
      if (mode === 'same-route' && !isSameRouteNavigation(router, props)) {
        e.preventDefault();
      }
    },
  });
}) as unknown as typeof _Link;

/**
 * Override createFileRoute from tanstack react router
 * because the org `createFileRoute` doesn't set the path in the Route
 */
export function createFileRoute(path: string) {
  return (options: any) => {
    // A pure-pathless id (`/_authed`, `/(group)`) yields an id-only route: a
    // layout with `path: '/'` never matches its children and collides with a
    // sibling index route (see routing/duplicate-tree.test.ts). An explicit
    // `path` in the options keeps the route pathful and wins over the id.
    const pathless = isPathlessFileRouteId(path) && options?.path == null;
    const routePath = options?.path ?? normalizeFileRoutePath(path);
    return createRoute({
      ...(pathless ? { id: path } : { path: routePath }),
      ...options,
      isRoot: false,
    }).update({
      // routeTree.gen re-updates these later; set them here so route files
      // imported without the generated tree still carry their identity
      id: path,
      ...(pathless ? {} : { path: routePath, fullPath: routePath }),
      // any because tanstack router does that
    } as any);
  };
}
