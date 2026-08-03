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
   * Keep the `handler` of `createServerFn()` chains, and the `server` and
   * `inputValidator` phases of `createMiddleware()` chains, in the Storybook
   * build instead of stripping them, so a story can run that chain in the
   * browser.
   *
   * Off by default. Enabling it only suspends those strips; it does not make
   * the kept code browser-safe. Everything a handler or a middleware reaches
   * has to run in a browser, either on its own, through the TanStack packages
   * the preset redirects to its mocks, or through a `__mocks__` file. Code that
   * imports `node:fs` or a database client still breaks, at build time or on
   * the first call.
   *
   * Unaffected, and still stripped: `createServerOnlyFn`, the server half of
   * `createIsomorphicFn`, the `server` option of route factories, and
   * `*.server.ts` modules.
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
