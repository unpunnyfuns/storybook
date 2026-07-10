import { describe, expect, it } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import { isSameRouteNavigation } from './navigation-mode.ts';

async function buildRouter(initialPath: string) {
  const root = createRootRoute();
  const home = createRoute({ path: '/', getParentRoute: () => root });
  const posts = createRoute({
    path: '/posts',
    validateSearch: (s: Record<string, unknown>) => ({ highlight: Boolean(s.highlight) }),
    getParentRoute: () => root,
  });
  const post = createRoute({ path: '/posts/$postId', getParentRoute: () => root });
  root.addChildren([home, posts, post]);

  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  await router.load();
  return router;
}

describe('isSameRouteNavigation', () => {
  it('treats a search-only change as same-route', async () => {
    const router = await buildRouter('/posts');

    expect(
      isSameRouteNavigation(router as any, { to: '/posts', search: { highlight: true } })
    ).toBe(true);
  });

  it('treats a param change on the same route as same-route', async () => {
    const router = await buildRouter('/posts/1');

    expect(
      isSameRouteNavigation(router as any, { to: '/posts/$postId', params: { postId: '2' } })
    ).toBe(true);
  });

  it('treats navigation to a different route as cross-route', async () => {
    const router = await buildRouter('/posts');

    expect(isSameRouteNavigation(router as any, { to: '/' })).toBe(false);
  });

  it('treats an unresolvable destination as cross-route (safe default)', async () => {
    const router = await buildRouter('/posts');

    expect(isSameRouteNavigation(router as any, { to: '/nope/$x' })).toBe(false);
  });
});
