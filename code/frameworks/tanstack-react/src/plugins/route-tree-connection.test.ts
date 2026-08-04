import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';

import { findGeneratedRouteTree, resolveRouteTreeConnection } from './route-tree-connection.ts';

function project(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'sb-tanstack-'));
  for (const file of files) {
    const full = join(root, file);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, '');
  }
  return root;
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

    expect(resolveRouteTreeConnection({ configDir: join(root, '.storybook') })).toEqual({
      routeTreePath: join(root, 'src/routeTree.gen.ts'),
      previewPath: join(root, '.storybook/preview.ts'),
    });
  });

  it('connects nothing when the project has no generated tree', () => {
    // The normal case for code-based and virtual routing.
    const root = project(['.storybook/preview.ts']);

    expect(resolveRouteTreeConnection({ configDir: join(root, '.storybook') })).toBeUndefined();
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

    expect(
      resolveRouteTreeConnection({
        configDir: join(root, '.storybook'),
        generatedRouteTree: 'custom/myTree.gen.ts',
      })
    ).toEqual({
      routeTreePath: join(root, 'custom/myTree.gen.ts'),
      previewPath: join(root, '.storybook/preview.ts'),
    });
  });
});
