import type { Plugin } from 'vite';

interface RouteTreeInjectionOptions {
  /** Absolute path of the project's `.storybook/preview` file. */
  previewPath: string;
  /**
   * The tree's absolute path, or undefined when the project has none. Called
   * per transform, not read once: see `resolveRouteTreeConnection`.
   */
  resolveRouteTreePath: () => string | undefined;
}

/**
 * Prepends a side-effect import of the app's generated route tree onto the
 * project's preview file, so file routes reach stories carrying the id, path
 * and parent the tree assigns them.
 *
 * The preview file is the injection point because it is the only module
 * reliably in the graph under both story formats. A `previewAnnotations` entry
 * does not work: under CSF factories the Vite builder emits an import for the
 * preview file alone and drops preset-contributed annotations. The framework's
 * own preview module fails the mirror image of that, entering the graph only on
 * the CSF3 path, since CSF factories reach it inside the bundled framework
 * entry where plugin transforms do not run.
 */
export function routeTreeInjectionPlugin({
  previewPath,
  resolveRouteTreePath,
}: RouteTreeInjectionOptions): Plugin {
  const normalize = (id: string) => id.split('?')[0];
  const target = normalize(previewPath);

  return {
    name: 'storybook:tanstack-react:route-tree-injection',
    transform: {
      filter: {
        id: { include: [/preview/] },
      },
      handler(code, id) {
        if (normalize(id) !== target) {
          return null;
        }

        const routeTreePath = resolveRouteTreePath();
        if (!routeTreePath) {
          // Code-based and virtual routing never generate a tree. Importing a
          // file that will never exist would fail the project's build.
          return null;
        }

        // Prepended rather than appended: the tree must have run before
        // anything that reads a route's resolved identity.
        return {
          code: `import ${JSON.stringify(routeTreePath)};\n${code}`,
          map: null,
        };
      },
    },
  };
}
