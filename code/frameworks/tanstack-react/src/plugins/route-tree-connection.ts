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
  /**
   * Looks the tree up on the filesystem, returning undefined while there is
   * none. Deliberately a function: see `resolveRouteTreeConnection`.
   */
  resolveRouteTreePath: () => string | undefined;
}

/**
 * Decides where to inject the route tree import, and how to find the tree when
 * the time comes.
 *
 * Two things can rule a project out, and only one of them can be settled here.
 * Without a preview file there is nowhere to put an import that both story
 * formats reach, so the project is left alone rather than connected on one path
 * only; a preview file is authored and committed, so asking now is safe.
 *
 * Whether a generated tree exists is not safe to ask now. `routeTree.gen.ts` is
 * written by `@tanstack/router-plugin` during the build and is gitignored, so
 * on a clean checkout it is still missing while `viteFinal` runs. Answering
 * from config time would connect projects on machines that had run the app
 * before and quietly skip every fresh clone, which is to say every CI run and
 * every new user. So the lookup is handed back as a function for the injection
 * plugin to call from its transform hook, by which point the router plugin has
 * written the file. Missing then is a real answer, and the normal one for
 * code-based and virtual routing, which never generate a tree.
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

  const previewPath = loadPreviewOrConfigFile({ configDir });
  if (!previewPath) {
    return undefined;
  }

  const root = dirname(configDir);
  let found: string | undefined;

  return {
    previewPath,
    resolveRouteTreePath: () => {
      // Only a hit is remembered. A miss has to stay open, because the tree may
      // still be on its way.
      found ??= findGeneratedRouteTree(root, generatedRouteTree);
      return found;
    },
  };
}
