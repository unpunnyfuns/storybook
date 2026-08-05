import { existsSync } from 'node:fs';

import { loadPreviewOrConfigFile } from 'storybook/internal/common';
import { dirname, isAbsolute, join } from 'pathe';

/** Where `@tanstack/router-plugin` writes the generated tree by default. */
const DEFAULT_LOCATIONS = ['src/routeTree.gen.ts', 'src/routeTree.gen.tsx', 'routeTree.gen.ts'];

/**
 * Locates the app's generated route tree, or undefined when it has none, which
 * is the normal case for code-based and virtual routing.
 */
export function findGeneratedRouteTree(root: string, configured?: string): string | undefined {
  const candidates = configured
    ? [isAbsolute(configured) ? configured : join(root, configured)]
    : DEFAULT_LOCATIONS.map((relative) => join(root, relative));

  return candidates.find((candidate) => existsSync(candidate));
}

export interface RouteTreeConnection {
  previewPath: string;
  /** Looks the tree up on disk. A function, not a value: see below. */
  resolveRouteTreePath: () => string | undefined;
}

/**
 * Decides where to inject the route tree import, and how to find the tree when
 * the time comes.
 *
 * A missing preview file rules the project out here: it is authored and
 * committed, so the answer cannot change later.
 *
 * A missing tree does not. `routeTree.gen.ts` is gitignored and written by
 * `@tanstack/router-plugin` during the build, so it is still absent while
 * `viteFinal` runs. Deciding here would connect only machines that had already
 * run the app, and skip every clean checkout. The lookup is therefore handed
 * back as a function, for the injection plugin to call at transform time.
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
