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
   * server function the way TanStack does also requires the `createServerFn`
   * mock that delegates to the real builder, which ships in the same release as
   * this option but is a separate change. In a build that has this option
   * without that mock, a handler body executes with no middleware context and
   * no input validation: `opts.context` is `undefined` and unvalidated input
   * reaches the handler, which is a quieter failure than the no-op spy the
   * handler is replaced with while this is off.
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
   * factories, and `*.server.ts` modules. A server function's own
   * `.validator()` is also still stripped, so it does not run in either mode,
   * unlike a `createMiddleware()` chain's `inputValidator`, which this option
   * does restore.
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

export interface StartParameters {
  /**
   * Context a story supplies in place of global function middleware, which
   * cannot run in a Storybook build. Merged as the base context for server
   * function handlers, exactly where `contextAfterGlobalMiddlewares` lands.
   */
  context?: Record<string, unknown>;
}

export interface TanStackPreviewOptions<
  TRoute = undefined,
  Path extends DefaultStoryPath<TRoute> = DefaultStoryPath<TRoute>,
> {
  /** Router configuration for stories */
  router?: RouterParameters<TRoute, Path>;
  /** TanStack Start configuration for stories. */
  start?: StartParameters;
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
