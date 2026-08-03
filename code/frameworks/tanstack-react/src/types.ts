import type { CompatibleString } from 'storybook/internal/types';

import type { AnyRoute } from '@tanstack/react-router';
import type { RoutesByPath } from '@tanstack/router-core';
import type { BuilderOptions } from '@storybook/builder-vite';
import type { StorybookConfig as StorybookConfigReactVite } from '@storybook/react-vite';
import type { RegisteredFullPath, RouterParameters } from './routing/types.ts';

type FrameworkName = CompatibleString<'@storybook/tanstack-react'>;
type BuilderName = CompatibleString<'@storybook/builder-vite'>;

export type FrameworkOptions = {
  /** Builder options passed through to @storybook/builder-vite. */
  builder?: BuilderOptions;

  /**
   * Experimental, and incomplete on its own. Keeps the `handler` argument of
   * `createServerFn()` chains, and the `server` and `inputValidator` phases of
   * `createMiddleware()` chains, in the Storybook build instead of stripping
   * them, so that code survives into the browser bundle.
   *
   * Surviving into the bundle is not the same as the chain running. Executing a
   * server function the way TanStack does, with its middleware chain and its
   * validators, additionally requires the `createServerFn` mock that delegates
   * to the real builder, which is not part of this change. Against the current
   * mock, enabling this means a handler body executes with no middleware
   * context and no input validation: `opts.context` is `undefined`, and
   * unvalidated input reaches the handler. That is a quieter failure than the
   * no-op spy the handler is replaced with while this is off, so leave it off
   * until the delegating mock lands.
   *
   * Off by default. Enabling it only suspends those strips; it does not make
   * the kept code browser-safe. Everything a handler or a middleware reaches
   * has to run in a browser, either on its own, through the TanStack packages
   * the preset redirects to its mocks, or through a `__mocks__` file. Code that
   * imports `node:fs` or a database client still breaks, at build time or on
   * the first call.
   *
   * Unaffected by this option, and still rewritten the way they are today:
   * `createServerOnlyFn`, `createIsomorphicFn`, the `server` option of route
   * factories, and `*.server.ts` modules.
   */
  executeServerFunctions?: boolean;
};

type StorybookConfigFramework = {
  framework:
    | FrameworkName
    | {
        name: FrameworkName;
        options: FrameworkOptions;
      };
  core?: StorybookConfigReactVite['core'] & {
    builder?:
      | BuilderName
      | {
          name: BuilderName;
          options: BuilderOptions;
        };
  };
};

/** The interface for Storybook configuration in `main.ts` files. */
export type StorybookConfig = Omit<StorybookConfigReactVite, keyof StorybookConfigFramework> &
  StorybookConfigFramework;

/** Path constraint mirroring `RouterParameters`'s second generic. */
export type DefaultStoryPath<TRoute> = TRoute extends AnyRoute
  ? keyof RoutesByPath<TRoute>
  : RegisteredFullPath;

export interface TanStackPreviewOptions<
  TRoute = undefined,
  Path extends DefaultStoryPath<TRoute> = DefaultStoryPath<TRoute>,
> {
  /** Router configuration for stories */
  router?: RouterParameters<TRoute, Path>;
}

export interface TanStackParameters<
  TRoute = undefined,
  Path extends DefaultStoryPath<TRoute> = DefaultStoryPath<TRoute>,
> {
  /** TanStack framework configuration (router integration). */
  tanstack?: TanStackPreviewOptions<TRoute, Path>;
}

export interface TanStackTypes<
  TRoute = undefined,
  Path extends DefaultStoryPath<TRoute> = DefaultStoryPath<TRoute>,
> {
  parameters: TanStackParameters<TRoute, Path>;
}
