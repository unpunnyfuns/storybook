import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';

import type { RouteTreeConnection } from './route-tree-connection.ts';
import { findGeneratedRouteTree, resolveRouteTreeConnection } from './route-tree-connection.ts';
import { routeTreeInjectionPlugin } from './route-tree-injection.ts';

function project(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'sb-tanstack-'));
  for (const file of files) {
    const full = join(root, file);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, '');
  }
  return root;
}

function generate(root: string, file: string) {
  const full = join(root, file);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, '');
  return full;
}

/** Runs the connection through the plugin it feeds, as the preset wires them. */
function transformPreview(connection: RouteTreeConnection | undefined) {
  if (!connection) {
    throw new Error('no connection was resolved');
  }
  const plugin = routeTreeInjectionPlugin(connection);
  const handler = (plugin.transform as any).handler;
  return handler.call({}, 'export const x = 1;', connection.previewPath);
}

describe('findGeneratedRouteTree', () => {
  it('finds the tree at the location the router plugin writes by default', () => {
    const root = project(['src/routeTree.gen.ts']);

    expect(findGeneratedRouteTree(root)).toBe(join(root, 'src/routeTree.gen.ts'));
  });

  it('returns nothing when the project has no generated tree', () => {
    const root = project(['src/main.tsx']);

    expect(findGeneratedRouteTree(root)).toBeUndefined();
  });

  it('resolves a configured path relative to the project root', () => {
    const root = project(['custom/myTree.gen.ts']);

    expect(findGeneratedRouteTree(root, 'custom/myTree.gen.ts')).toBe(
      join(root, 'custom/myTree.gen.ts')
    );
  });

  it('accepts an absolute configured path', () => {
    const root = project(['custom/myTree.gen.ts']);
    const absolute = join(root, 'custom/myTree.gen.ts');

    expect(findGeneratedRouteTree(root, absolute)).toBe(absolute);
  });

  it('does not fall back to the default when a configured path is missing', () => {
    // The default exists, but the user pointed somewhere else. Silently loading
    // a different tree would be worse than loading none.
    const root = project(['src/routeTree.gen.ts']);

    expect(findGeneratedRouteTree(root, 'custom/myTree.gen.ts')).toBeUndefined();
  });
});

describe('resolveRouteTreeConnection', () => {
  it('pairs the generated tree with the project preview file', () => {
    const root = project(['src/routeTree.gen.ts', '.storybook/preview.ts']);

    const connection = resolveRouteTreeConnection({ configDir: join(root, '.storybook') });

    expect(connection?.previewPath).toBe(join(root, '.storybook/preview.ts'));
    expect(connection?.resolveRouteTreePath()).toBe(join(root, 'src/routeTree.gen.ts'));
  });

  it('connects nothing when the project has no preview file', () => {
    // The preview file is the only module both story formats are guaranteed to
    // load, so without one there is nowhere to inject that works for both.
    // Connecting on one path only would be worse than leaving it alone.
    const root = project(['src/routeTree.gen.ts']);

    expect(resolveRouteTreeConnection({ configDir: join(root, '.storybook') })).toBeUndefined();
  });

  it('honours an explicit opt-out even when both files exist', () => {
    const root = project(['src/routeTree.gen.ts', '.storybook/preview.ts']);

    expect(
      resolveRouteTreeConnection({
        configDir: join(root, '.storybook'),
        generatedRouteTree: false,
      })
    ).toBeUndefined();
  });

  it('uses a configured tree path', () => {
    const root = project(['custom/myTree.gen.ts', '.storybook/preview.ts']);

    const connection = resolveRouteTreeConnection({
      configDir: join(root, '.storybook'),
      generatedRouteTree: 'custom/myTree.gen.ts',
    });

    expect(connection?.previewPath).toBe(join(root, '.storybook/preview.ts'));
    expect(connection?.resolveRouteTreePath()).toBe(join(root, 'custom/myTree.gen.ts'));
  });
});

describe('connecting a tree that does not exist yet at config time', () => {
  it('injects a tree the router plugin only writes once the build has started', () => {
    // `routeTree.gen.ts` is gitignored and written by `@tanstack/router-plugin`
    // during the build, so on a clean checkout it is missing while `viteFinal`
    // runs. Deciding then leaves every fresh clone, and therefore CI, silently
    // unconnected.
    const root = project(['.storybook/preview.ts']);
    const connection = resolveRouteTreeConnection({ configDir: join(root, '.storybook') });

    const routeTreePath = generate(root, 'src/routeTree.gen.ts');

    expect(transformPreview(connection).code).toContain(`import "${routeTreePath}";`);
  });

  it('injects a configured tree written after config time', () => {
    const root = project(['.storybook/preview.ts']);
    const connection = resolveRouteTreeConnection({
      configDir: join(root, '.storybook'),
      generatedRouteTree: 'custom/myTree.gen.ts',
    });

    const routeTreePath = generate(root, 'custom/myTree.gen.ts');

    expect(transformPreview(connection).code).toContain(`import "${routeTreePath}";`);
  });

  it('leaves the preview file alone when no tree ever appears', () => {
    // The normal case for code-based and virtual routing. Importing a file that
    // will never exist would break those projects outright, so the check moves
    // rather than goes away.
    const root = project(['.storybook/preview.ts']);
    const connection = resolveRouteTreeConnection({ configDir: join(root, '.storybook') });

    expect(transformPreview(connection)).toBeNull();
  });

  it('leaves the preview file alone when a configured tree never appears', () => {
    const root = project(['src/routeTree.gen.ts', '.storybook/preview.ts']);
    const connection = resolveRouteTreeConnection({
      configDir: join(root, '.storybook'),
      generatedRouteTree: 'custom/myTree.gen.ts',
    });

    expect(transformPreview(connection)).toBeNull();
  });

  it('keeps the opt-out total, so nothing is installed to reconsider later', () => {
    const root = project(['.storybook/preview.ts']);

    const connection = resolveRouteTreeConnection({
      configDir: join(root, '.storybook'),
      generatedRouteTree: false,
    });
    generate(root, 'src/routeTree.gen.ts');

    expect(connection).toBeUndefined();
  });
});
