import { defineConfig, mergeConfig } from 'vitest/config';

import { vitestCommonConfig } from '../../vitest.shared.ts';

export default mergeConfig(
  vitestCommonConfig,
  defineConfig({
    test: {
      server: {
        deps: {
          /**
           * This package imports `@tanstack/start-storage-context` internally,
           * and that import is the one the real `createServerFn` uses to find a
           * start context. A Storybook build redirects it to our mock, but only
           * because `plugins/module-interception.ts` also keeps this package
           * out of `optimizeDeps`, so esbuild treats the specifier as external
           * and the plugin's `resolveId` hook gets to see it.
           *
           * Vitest does not load that plugin and externalises dependencies by
           * default, so the equivalent has to be arranged here: inlining this
           * package puts it in the module graph, which is what lets a test's
           * `vi.mock('@tanstack/start-storage-context')` reach the internal
           * import instead of node loading the AsyncLocalStorage build.
           */
          inline: ['@tanstack/start-client-core'],
        },
      },
    },
  })
);
