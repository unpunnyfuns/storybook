import type { Plugin } from 'vite';

const INTERCEPTED_PATTERNS = ['virtual:cloudflare', 'server-entry', 'worker-entry'];
export const START_SERVER_MODULES = [
  '@tanstack/react-start',
  '@tanstack/react-start/server',
  '@tanstack/react-start-server',
  '@tanstack/start-server-core',
];

export const STORAGE_CONTEXT_MODULE = '@tanstack/start-storage-context';

export function moduleInterceptionPlugin({
  startMockPath,
  startStorageContextMockPath,
  routerMockPath,
}: {
  startMockPath: string;
  startStorageContextMockPath: string;
  routerMockPath: string;
}): Plugin {
  return {
    name: 'storybook:tanstack-react:module-interception',
    enforce: 'pre',
    resolveId: {
      order: 'pre',
      async handler(id: string, importer: string | undefined) {
        const resolveMock = async (mockPath: string) => {
          const resolved = await this.resolve(mockPath, importer, { skipSelf: true });
          return resolved ?? mockPath;
        };

        // Redirect @tanstack/react-router to our mock, except when
        // the importer IS the mock (to avoid a circular alias).
        if (
          (id === '@tanstack/react-router' || id.startsWith('@tanstack/react-router/')) &&
          importer &&
          !importer.includes('export-mocks')
        ) {
          return resolveMock(routerMockPath);
        }

        if (START_SERVER_MODULES.includes(id) || id === '@tanstack/react-start') {
          return resolveMock(startMockPath);
        }

        if (id === STORAGE_CONTEXT_MODULE) {
          return resolveMock(startStorageContextMockPath);
        }

        // Intercept virtual/server/worker entries
        for (const pattern of INTERCEPTED_PATTERNS) {
          if (id.includes(pattern)) {
            return resolveMock(startMockPath);
          }
        }

        return null;
      },
    },

    /**
     * A redirect above is only half a redirect until the specifier is also kept
     * out of pre-bundling. Vite pre-bundles dependencies with esbuild, which
     * never calls plugin `resolveId` hooks, so an import written *inside* a
     * pre-bundled package is inlined against the real module and this plugin
     * never sees it. Only imports in a user's own source reach the pipeline
     * where the hook runs.
     *
     * `@tanstack/start-client-core` imports `@tanstack/start-storage-context`
     * internally, and that import is the one the real `createServerFn` uses to
     * find a start context. Excluding the specifier makes esbuild treat it as
     * external, which routes it back through the hook.
     *
     * The list is derived from the redirect constants rather than repeated, so
     * the two cannot drift apart. `@tanstack/react-router` is deliberately not
     * here: its redirect is conditional on the importer, nothing it imports
     * internally is redirected (only `@tanstack/history`,
     * `@tanstack/react-store` and `@tanstack/router-core`), and excluding a
     * package that size costs dev startup for no benefit.
     */
    config() {
      return {
        optimizeDeps: {
          exclude: [
            '@storybook/react',
            '@storybook/react/entry-preview',
            '@storybook/react/entry-preview-argtypes',
            '@storybook/react/entry-preview-docs',
            '@storybook/tanstack-react',
            ...START_SERVER_MODULES,
            STORAGE_CONTEXT_MODULE,
          ],
        },
      };
    },
  };
}
