import { logger } from '@storybook/node-logger';
import type { Options, StorybookConfig, StorybookConfigOptions } from '@storybook/core-common';
import { getDirectoryFromWorkingDir } from '@storybook/core-common';
import chalk from 'chalk';
import express from 'express';
import { pathExists } from 'fs-extra';
import path from 'path';
import favicon from 'serve-favicon';

import dedent from 'ts-dedent';
import { ServeStaticOptions } from 'serve-static';

const defaultFavIcon = require.resolve('@storybook/core-server/public/favicon.ico');

/**
 *
 * @param router
 * @param endpoint
 * @param path
 * @param dir
 * @param options
 */
function registerRoute(
  router: any,
  endpoint: string,
  path: string,
  dir: string,
  options: ServeStaticOptions = {}
): void {
  logger.info(chalk`=> Serving static files from {cyan ${dir}} at {cyan ${endpoint}}`);
  router.use(endpoint, express.static(path, { index: false, ...options }));
}

/**
 * DEPRECATED
 * @param router
 * @param statics
 */
async function deprecatedStaticDir(router: any, statics: string[]): Promise<void> {
  if (statics && statics.length > 0) {
    await Promise.all(
      statics.map(async (dir) => {
        try {
          const { staticDir, staticPath, targetEndpoint } = await parseStaticDir(dir);
          registerRoute(router, targetEndpoint, staticPath, staticDir);
        } catch (e) {
          logger.warn(e.message);
        }
      })
    );
  }
}

export async function useStatics(router: any, options: Options) {
  let hasCustomFavicon = false;
  const staticDirs = await options.presets.apply<StorybookConfig['staticDirs']>('staticDirs');

  if (staticDirs && options.staticDir) {
    throw new Error(dedent`
      Conflict when trying to read staticDirs:
      * Storybook's configuration option: 'staticDirs'
      * Storybook's CLI flag: '--staticDir' or '-s'
      
      Choose one of them, but not both.
    `);
  }

  if (options.staticDir) {
    return deprecatedStaticDir(router, options.staticDir);
  }

  // const staticDirs = staticDirs;
  // .map((dir) =>
  //   typeof dir === 'string' ? dir : `${dir.from}:${dir.to}`
  // );

  logger.info(JSON.stringify(staticDirs));

  if (staticDirs && staticDirs.length > 0) {
    await Promise.all(
      staticDirs.map(async (entry) => {
        try {
          if (typeof entry === 'string') {
            const relativeDir = getDirectoryFromWorkingDir({
              configDir: options.configDir,
              workingDir: process.cwd(),
              directory: entry,
            });

            const { staticDir, staticPath } = await newparseStaticDir(relativeDir);
            const { targetEndpoint } = await newparseTargetDir(relativeDir);

            registerRoute(router, targetEndpoint, staticPath, staticDir);

            return;
          }

          const from = getDirectoryFromWorkingDir({
            configDir: options.configDir,
            workingDir: process.cwd(),
            directory: entry.from,
          });

          const { staticDir, staticPath } = await newparseStaticDir(from);
          const { targetEndpoint } = await newparseTargetDir(entry.to);

          registerRoute(router, targetEndpoint, staticPath, staticDir, entry?.options ?? {});
        } catch (e) {
          logger.warn(e.message);
        }
      })
    );
  }
}

export const newparseStaticDir = async (arg: string) => {
  const staticDir = path.isAbsolute(arg) ? arg : `./${arg}`;
  const staticPath = path.resolve(staticDir);

  if (!(await pathExists(staticPath))) {
    throw new Error(
      dedent(chalk`
        Failed to load static files, no such directory: {cyan ${staticPath}}
        Make sure this directory exists, or omit the {bold -s (--static-dir)} option.
      `)
    );
  }

  return { staticDir, staticPath };
};

export const newparseTargetDir = async (arg: string) => {
  const targetDir = arg.replace(/^\/?/, './');
  const targetEndpoint = targetDir.substring(1);
  return { targetDir, targetEndpoint };
};

export const parseStaticDir = async (arg: string) => {
  // Split on ':' only if not followed by '\', for Windows compatibility (e.g. 'C:\some\dir')
  const [rawDir, target = '/'] = arg.split(/:(?!\\)/);
  const staticDir = path.isAbsolute(rawDir) ? rawDir : `./${rawDir}`;
  const staticPath = path.resolve(staticDir);
  const targetDir = target.replace(/^\/?/, './');
  const targetEndpoint = targetDir.substr(1);

  if (!(await pathExists(staticPath))) {
    throw new Error(
      dedent(chalk`
        Failed to load static files, no such directory: {cyan ${staticPath}}
        Make sure this directory exists, or omit the {bold -s (--static-dir)} option.
      `)
    );
  }

  return { staticDir, staticPath, targetDir, targetEndpoint };
};
