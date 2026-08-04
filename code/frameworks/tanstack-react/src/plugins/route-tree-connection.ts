import { existsSync } from 'node:fs';

import { loadPreviewOrConfigFile } from 'storybook/internal/common';
import { dirname, isAbsolute, join } from 'pathe';

/**
 * Where `@tanstack/router-plugin` writes the generated tree by default. Users
 * can move it with the plugin's `generatedRouteTree` option, which is why the
 * framework option exists as an escape hatch.
 */
const DEFAULT_LOCATIONS = ['src/routeTree.gen.ts', 'src/routeTree.gen.tsx', 'routeTree.gen.ts'];

/**
 * Locates the app's generated route tree.
 *
 * A file route only carries its own file path until `routeTree.gen.ts` runs
 * `.update()` over it and supplies the path, id and parent that place it in a
 * tree. Apps get that from their entry module, which Storybook never loads, so
 * without it the decorator receives routes with no context: they cannot derive
 * a URL, and they cannot reach the layouts above them.
 *
 * Loading the generated module is enough, because it mutates the route
 * singletons that story files import. Returns undefined when there is nothing
 * to load, which is the normal case for code-based and virtual routing.
 */
export function findGeneratedRouteTree(root: string, configured?: string): string | undefined {
  const candidates = configured
    ? [isAbsolute(configured) ? configured : join(root, configured)]
    : DEFAULT_LOCATIONS.map((relative) => join(root, relative));

  return candidates.find((candidate) => existsSync(candidate));
}

export interface RouteTreeConnection {
  previewPath: string;
  routeTreePath: string;
}

/**
 * Decides whether this project can have its route tree connected, and where to
 * inject the import.
 *
 * Both halves are required. Without a generated tree there is nothing to load,
 * which is the normal case for code-based and virtual routing. Without a
 * preview file there is nowhere to put the import that both story formats
 * reach, so the project is left alone rather than connected on one path only.
 */
export function resolveRouteTreeConnection({
  configDir,
  generatedRouteTree,
}: {
  configDir: string;
  generatedRouteTree?: string | false;
}): RouteTreeConnection | undefined {
  if (generatedRouteTree === false) {
    return undefined;
  }

  const routeTreePath = findGeneratedRouteTree(dirname(configDir), generatedRouteTree);
  if (!routeTreePath) {
    return undefined;
  }

  const previewPath = loadPreviewOrConfigFile({ configDir });
  return previewPath ? { previewPath, routeTreePath } : undefined;
}
