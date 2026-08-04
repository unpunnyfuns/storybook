import { describe, expect, it } from 'vitest';

import { routeTreeInjectionPlugin } from './route-tree-injection.ts';

const previewPath = '/app/.storybook/preview.tsx';
const routeTreePath = '/app/src/routeTree.gen.ts';

function transform(id: string, code = 'export const x = 1;') {
  const plugin = routeTreeInjectionPlugin({ previewPath, routeTreePath });
  const handler = (plugin.transform as any).handler;
  return handler.call({}, code, id);
}

describe('routeTreeInjectionPlugin', () => {
  it("prepends the route tree import to the project's preview file", () => {
    const result = transform(previewPath);

    expect(result.code).toBe(`import "${routeTreePath}";\nexport const x = 1;`);
  });

  it('runs the tree before the rest of the module', () => {
    const result = transform(previewPath);

    // Anything reading a route's resolved identity must see it already
    // connected, so the import cannot be appended.
    expect(result.code.indexOf(routeTreePath)).toBeLessThan(result.code.indexOf('export const x'));
  });

  it('leaves other modules alone', () => {
    expect(transform('/app/src/routes/about.tsx')).toBeNull();
  });

  it('leaves a module whose name merely contains "preview" alone', () => {
    // The id filter is a coarse prefilter; only the exact preview module is
    // rewritten. A user file called `preview-card.tsx` passes the filter.
    expect(transform('/app/src/components/preview-card.tsx')).toBeNull();
  });

  it('matches the preview module when Vite appends a query suffix', () => {
    const result = transform(`${previewPath}?v=abc123`);

    expect(result.code).toContain(`import "${routeTreePath}";`);
  });
});
