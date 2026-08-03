import { defineConfig, mergeConfig } from 'vitest/config';

import { vitestCommonConfig } from '../../vitest.shared.ts';

export default mergeConfig(
  vitestCommonConfig,
  defineConfig({
    test: {
      server: {
        deps: {
          /**
           * `@tanstack/start-client-core` imports `@tanstack/start-storage-context`
           * internally, and that import is the one the real `createServerFn`
           * uses to find a start context. A Storybook build redirects it to our
           * mock, but only because `plugins/module-interception.ts` keeps that
           * specifier out of `optimizeDeps`: esbuild then treats it as external
           * inside this package's pre-bundle, leaving the import in place for
           * the plugin's `resolveId` hook to see. The excluded specifier is the
           * storage context, not the package inlined below.
           *
           * Vitest does not load that plugin and externalises dependencies by
           * default, so the equivalent has to be arranged here: inlining
           * `@tanstack/start-client-core` puts it in the module graph, which is
           * what lets a test's `vi.mock('@tanstack/start-storage-context')`
           * reach the internal import instead of node loading the
           * AsyncLocalStorage build.
           */
          inline: ['@tanstack/start-client-core'],
        },
      },
    },
  })
);
