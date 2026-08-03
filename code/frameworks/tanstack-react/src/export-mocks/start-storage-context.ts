import type { StartStorageContext } from '@tanstack/start-storage-context';

const START_CONTEXT_SYMBOL = Symbol.for('storybook.tanstack-react.start-storage-context');

/**
 * Declared here rather than imported so nothing this file exports grows: the
 * interception plugin redirects `@tanstack/start-storage-context` to this file,
 * which makes every export importable under the real package's specifier. The
 * decorator publishes the value under the same well-known key.
 */
const STORY_CONTEXT_SYMBOL = Symbol.for('storybook.tanstack-react.story-start-context');

type BrowserStartGlobals = typeof globalThis & {
  __TSR_ROUTER__?: unknown;
  __TSS_START_OPTIONS__?: unknown;
  [START_CONTEXT_SYMBOL]?: StartStorageContext;
  [STORY_CONTEXT_SYMBOL]?: Record<string, unknown>;
};

const browserGlobals = globalThis as BrowserStartGlobals;

function createFallbackStartContext(): StartStorageContext | undefined {
  if (
    browserGlobals.__TSR_ROUTER__ === undefined &&
    browserGlobals.__TSS_START_OPTIONS__ === undefined
  ) {
    return undefined;
  }

  return {
    getRouter: () => browserGlobals.__TSR_ROUTER__ as never,
    request: new Request('http://localhost/'),
    startOptions: browserGlobals.__TSS_START_OPTIONS__,
    contextAfterGlobalMiddlewares: browserGlobals[STORY_CONTEXT_SYMBOL] ?? {},
    executedRequestMiddlewares: new Set(),
  };
}

export async function runWithStartContext<T>(
  context: StartStorageContext,
  fn: () => T | Promise<T>
): Promise<T> {
  const previousContext = browserGlobals[START_CONTEXT_SYMBOL];
  browserGlobals[START_CONTEXT_SYMBOL] = context;

  try {
    return await fn();
  } finally {
    if (previousContext) {
      browserGlobals[START_CONTEXT_SYMBOL] = previousContext;
    } else {
      delete browserGlobals[START_CONTEXT_SYMBOL];
    }
  }
}

export function getStartContext<TThrow extends boolean = true>(opts?: {
  throwIfNotFound?: TThrow;
}): TThrow extends false ? StartStorageContext | undefined : StartStorageContext {
  const context = browserGlobals[START_CONTEXT_SYMBOL] ?? createFallbackStartContext();

  if (!context && opts?.throwIfNotFound !== false) {
    throw new Error('No Start context found in Storybook mock.');
  }

  return context as TThrow extends false ? StartStorageContext | undefined : StartStorageContext;
}

export type { StartStorageContext };
