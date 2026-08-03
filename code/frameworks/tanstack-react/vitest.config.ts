import { defineConfig, mergeConfig } from 'vitest/config';

import { vitestCommonConfig } from '../../vitest.shared.ts';

export default mergeConfig(
  vitestCommonConfig,
  defineConfig({
    test: {
      server: {
        deps: {
          /**
           * `plugins/module-interception.ts` redirects
           * `@tanstack/start-storage-context` to our mock in a Storybook build,
           * which is how the real `createServerFn` finds a start context in a
           * browser. Vitest externalises dependencies by default, so this
           * package's own import of that specifier would bypass any redirect a
           * test sets up and load the AsyncLocalStorage build instead.
           * Inlining it lets `vi.mock` reach that import the way the plugin
           * does.
           */
          inline: ['@tanstack/start-client-core'],
        },
      },
    },
  })
);
