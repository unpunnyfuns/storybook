import { fileURLToPath } from 'node:url';

import { safeResolveModule } from 'storybook/internal/common';
import type { Options, PresetProperty } from 'storybook/internal/types';
import { dirname } from 'pathe';
import type { StorybookConfigVite } from '@storybook/builder-vite';
import { viteFinal as reactViteFinal } from '@storybook/react-vite/preset';
import { serverCodeEliminationPlugin } from './plugins/server-code-elimination.ts';
import { serverOnlyStubPlugin } from './plugins/server-only-stub.ts';
import { moduleInterceptionPlugin } from './plugins/module-interception.ts';
import { resolveRouteTreeConnection } from './plugins/route-tree-connection.ts';
import { routeTreeInjectionPlugin } from './plugins/route-tree-injection.ts';
import type { FrameworkOptions } from './types.ts';

export const core: PresetProperty<'core'> = async (config, options) => {
  const framework = await options.presets.apply('framework');

  return {
    ...config,
    builder: {
      name: fileURLToPath(import.meta.resolve('@storybook/builder-vite')),
      options: typeof framework === 'string' ? {} : framework.options.builder || {},
    },
    renderer: fileURLToPath(import.meta.resolve('@storybook/react/preset')),
  };
};

export const previewAnnotations: PresetProperty<'previewAnnotations'> = (entry = []) => [
  ...entry,
  fileURLToPath(import.meta.resolve('@storybook/tanstack-react/preview')),
];

// Not dependencies or peers of this framework, so they only belong in
// `optimizeDeps.include` when the user's project has them: an unconditional
// include makes Vite log "Failed to resolve dependency" on every cold start.
const devtoolsPackages = [
  '@tanstack/react-devtools',
  '@tanstack/react-query-devtools',
  '@tanstack/react-router-devtools',
];

export const optimizeViteDeps = (config: string[] = [], options?: Partial<Options>) => [
  ...config,
  '@tanstack/react-store',
  '@tanstack/react-router > @tanstack/react-store',
  'use-sync-external-store/shim/with-selector',
  ...devtoolsPackages.filter((pkg) =>
    safeResolveModule({ specifier: pkg, parent: options?.configDir })
  ),
];

export const viteFinal: StorybookConfigVite['viteFinal'] = async (config, options) => {
  const reactConfig = await reactViteFinal(config, options);

  /**
   * A custom viteFinal implementation that removes any TanStack Start Vite plugins from the user's
   * Vite config, as a workaround for compatibility issues.
   *
   * This follows the pattern discussed at: https://github.com/storybookjs/storybook/issues/33754
   */
  const isTanStackStartPlugin = (p: unknown): boolean => {
    if (Array.isArray(p)) {
      return p.some(isTanStackStartPlugin);
    }
    const pluginRecord = p as Record<string, unknown>;
    return (
      typeof p === 'object' &&
      p !== null &&
      'name' in pluginRecord &&
      typeof pluginRecord.name === 'string' &&
      (pluginRecord.name.startsWith('tanstack-start') || pluginRecord.name.includes('rsc:'))
    );
  };

  const startMockPath = fileURLToPath(import.meta.resolve('./export-mocks/start.js'));
  const startStorageContextMockPath = fileURLToPath(
    import.meta.resolve('./export-mocks/start-storage-context.js')
  );
  const routerMockPath = fileURLToPath(
    import.meta.resolve('@storybook/tanstack-react/react-router')
  );
  const framework = await options.presets.apply('framework');
  const frameworkOptions: FrameworkOptions =
    typeof framework === 'string' ? {} : (framework.options ?? {});

  const basePlugins = reactConfig.plugins ?? [];
  const plugins = [
    ...basePlugins.filter((p) => !isTanStackStartPlugin(p)),
    serverCodeEliminationPlugin({
      excludeFiles: [dirname(startMockPath)],
      executeServerFunctions: frameworkOptions.executeServerFunctions,
    }),
    serverOnlyStubPlugin(),
    moduleInterceptionPlugin({ startMockPath, startStorageContextMockPath, routerMockPath }),
  ];

  // Connect the app's generated route tree so file routes reach the decorator
  // already placed. Installed for any project with a preview file: whether a
  // tree exists is decided later, at transform time.
  const connection = resolveRouteTreeConnection({
    configDir: options.configDir,
    generatedRouteTree: frameworkOptions.generatedRouteTree,
  });
  if (connection) {
    plugins.push(routeTreeInjectionPlugin(connection));
  }

  return {
    ...reactConfig,
    plugins,
  };
};
