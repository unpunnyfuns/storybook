import type { Plugin } from 'vite';

interface RouteTreeInjectionOptions {
  /** Absolute path of the project's `.storybook/preview` file. */
  previewPath: string;
  /** Absolute path of the app's generated route tree. */
  routeTreePath: string;
}

/**
 * Prepends a side-effect import of the app's generated route tree onto the
 * project's preview file.
 *
 * The generated tree is what completes a file route: it runs `.update()` over
 * every route to supply the id, path and parent that place it in a tree. Apps
 * do that from their entry module, which Storybook never loads, so without it
 * the decorator receives routes that cannot derive a URL or reach the layouts
 * above them.
 *
 * The project's preview file is the injection point because it is the only
 * module reliably in the graph under both story formats. A `previewAnnotations`
 * entry does not work: for projects using CSF factories the Vite builder emits
 * an import for the preview file alone and drops preset-contributed
 * annotations. Targeting the framework's own preview module does not work
 * either, for the mirror-image reason — it enters the graph only on the CSF3
 * path, since CSF factories reach it inside the bundled framework entry where
 * plugin transforms do not run.
 */
export function routeTreeInjectionPlugin({
  previewPath,
  routeTreePath,
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
