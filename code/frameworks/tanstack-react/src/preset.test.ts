import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { optimizeViteDeps } from './preset';

const devtoolsPackages = [
  '@tanstack/react-devtools',
  '@tanstack/react-query-devtools',
  '@tanstack/react-router-devtools',
];

/**
 * `optimizeViteDeps` may be a static array or a preset extension function
 * (`(config, options) => config`); resolve it against a given project
 * directory either way, mirroring how `options.presets.apply('optimizeViteDeps', [])`
 * consumes it in `storybook-optimize-deps-plugin.ts`.
 */
function resolveOptimizeViteDeps(configDir: string): string[] {
  return typeof optimizeViteDeps === 'function'
    ? (optimizeViteDeps as (config: string[], options: any) => string[])([], { configDir })
    : optimizeViteDeps;
}

describe('optimizeViteDeps', () => {
  it("always pre-bundles the framework's own runtime deps", () => {
    expect(resolveOptimizeViteDeps(__dirname)).toEqual(
      expect.arrayContaining([
        '@tanstack/react-store',
        '@tanstack/react-router > @tanstack/react-store',
        'use-sync-external-store/shim/with-selector',
      ])
    );
  });

  it('does not include a devtools package that is not installed in the project', () => {
    // None of the three devtools packages are a dependency of this package,
    // so none of them should resolve from its own directory. Vite would log
    // "Failed to resolve dependency" on cold start for every entry that
    // doesn't resolve, so an unconditional include regresses every project
    // that doesn't also depend on the devtools packages (most of them).
    const result = resolveOptimizeViteDeps(__dirname);
    for (const pkg of devtoolsPackages) {
      expect(result).not.toContain(pkg);
    }
  });

  it('does not throw when called directly with no options, as a public subpath export allows', () => {
    // `./preset` is a public subpath export, so a direct call like
    // `optimizeViteDeps([])` is a real usage, not just Storybook's own
    // `presets.apply('optimizeViteDeps', [])` invocation, which always
    // supplies `options`.
    expect(() => optimizeViteDeps([])).not.toThrow();
    expect(optimizeViteDeps([])).toEqual(
      expect.arrayContaining([
        '@tanstack/react-store',
        '@tanstack/react-router > @tanstack/react-store',
        'use-sync-external-store/shim/with-selector',
      ])
    );
  });

  it('includes only the devtools packages that actually resolve in the project', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'tanstack-optimize-deps-'));
    try {
      const pkgDir = join(projectDir, 'node_modules', '@tanstack', 'react-router-devtools');
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({
          name: '@tanstack/react-router-devtools',
          version: '0.0.0',
          main: 'index.js',
        })
      );
      writeFileSync(join(pkgDir, 'index.js'), 'module.exports = {};');

      const result = resolveOptimizeViteDeps(projectDir);

      expect(result).toContain('@tanstack/react-router-devtools');
      expect(result).not.toContain('@tanstack/react-devtools');
      expect(result).not.toContain('@tanstack/react-query-devtools');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
