import { describe, expect, it } from 'vitest';

import { routeTreeInjectionPlugin } from './route-tree-injection.ts';

const previewPath = '/app/.storybook/preview.tsx';
const routeTreePath = '/app/src/routeTree.gen.ts';

function transform(
  id: string,
  code = 'export const x = 1;',
  resolveRouteTreePath: () => string | undefined = () => routeTreePath
) {
  const plugin = routeTreeInjectionPlugin({ previewPath, resolveRouteTreePath });
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

    // Anything reading a route's identity must see it already connected.
    expect(result.code.indexOf(routeTreePath)).toBeLessThan(result.code.indexOf('export const x'));
  });

  it('leaves other modules alone', () => {
    expect(transform('/app/src/routes/about.tsx')).toBeNull();
  });

  it('leaves a module whose name merely contains "preview" alone', () => {
    // The id filter is a coarse prefilter; this file passes it.
    expect(transform('/app/src/components/preview-card.tsx')).toBeNull();
  });

  it('matches the preview module when Vite appends a query suffix', () => {
    const result = transform(`${previewPath}?v=abc123`);

    expect(result.code).toContain(`import "${routeTreePath}";`);
  });

  it('leaves the preview file alone while no tree has been generated', () => {
    expect(transform(previewPath, 'export const x = 1;', () => undefined)).toBeNull();
  });

  it('asks for the tree on every transform rather than once', () => {
    // A first transform that finds nothing must not settle the question.
    let generated: string | undefined = undefined;
    const plugin = routeTreeInjectionPlugin({
      previewPath,
      resolveRouteTreePath: () => generated,
    });
    const handler = (plugin.transform as any).handler;

    expect(handler.call({}, 'export const x = 1;', previewPath)).toBeNull();

    generated = routeTreePath;

    expect(handler.call({}, 'export const x = 1;', previewPath).code).toContain(
      `import "${routeTreePath}";`
    );
  });
});
