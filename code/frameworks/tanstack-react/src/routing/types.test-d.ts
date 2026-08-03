import type { RouteTreeOverrides } from './types.ts';

/**
 * Regression test for tree-less projects (code-based routing, virtual routes,
 * `generatedRouteTree: false`, or a route tree outside the tsconfig program).
 *
 * In that setup `keyof FileRoutesByPath` is `never`, so the intersection
 * branch would collapse to `Partial<{}> & { __root__?: RouteOverrideOptions
 * }`. Intersecting with a type that has a known member turns excess-property
 * checking back on and rejects every key except `__root__` with TS2353. That
 * would be a regression introduced by this file's own `__root__` addition,
 * not a pre-existing bug: the prior type was plain `Partial<{...}>`, which
 * collapses to `{}` when `never`, and TS skips excess-property checking
 * against `{}`, so any key was accepted. The conditional's `Record<string,
 * RouteOverrideOptions>` branch keeps that tree-less behavior intact instead
 * of regressing it.
 *
 * This package ships with no `declare module '@tanstack/react-router'`
 * augmentation, so `keyof FileRoutesByPath` is already `never` here: this is
 * not a simulation, it is the exact tree-less shape reproducing directly.
 */
const overrides: RouteTreeOverrides = {
  '/users/$id': { loader: () => 1 },
  __root__: { beforeLoad: () => {} },
};
void overrides;
