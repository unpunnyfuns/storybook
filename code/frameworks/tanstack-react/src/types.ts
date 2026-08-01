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
   * Path to the app's generated route tree, relative to the Storybook config
   * directory's parent, or absolute.
   *
   * Storybook loads this so file routes reach stories carrying the id, path and
   * parent the generated tree assigns them; apps get that from their entry
   * module, which Storybook never loads. Defaults to looking for
   * `src/routeTree.gen.ts`. Set to `false` to load nothing, which is what
   * code-based and virtual routing want.
   */
  generatedRouteTree?: string | false;
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
