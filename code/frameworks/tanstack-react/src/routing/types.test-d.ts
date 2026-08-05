import type { RouteTreeOverrides } from './types.ts';

/**
 * Covers projects with no generated tree: code-based routing, virtual routes,
 * `generatedRouteTree: false`. This package ships no `declare module` route
 * augmentation, so `keyof FileRoutesByPath` is already `never` here.
 *
 * The `Record<string, RouteOverrideOptions>` branch of `RouteTreeOverrides` is
 * what keeps arbitrary keys accepted in that case. Intersecting `__root__` in
 * unconditionally instead re-enables excess-property checking and rejects
 * every other key with TS2353.
 */
const overrides: RouteTreeOverrides = {
  '/users/$id': { loader: () => 1 },
  __root__: { beforeLoad: () => {} },
};
void overrides;
