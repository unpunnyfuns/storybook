import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setStoryStartContext } from '../story-start-context.ts';
import { getStartContext } from './start-storage-context.ts';

describe('story start context', () => {
  /**
   * The fallback context only materialises once a Start app has booted, which
   * `createStart` signals by publishing its options. A story that reaches a
   * server function has always booted one, so establish the same precondition
   * here.
   */
  beforeEach(() => {
    (globalThis as any).__TSS_START_OPTIONS__ = {};
  });

  afterEach(() => {
    delete (globalThis as any).__TSS_START_OPTIONS__;
    setStoryStartContext(undefined);
  });

  it("seeds contextAfterGlobalMiddlewares from the story's start context", () => {
    setStoryStartContext({ user: 'ada' });
    expect(getStartContext().contextAfterGlobalMiddlewares).toEqual({ user: 'ada' });
  });

  it('falls back to an empty object when a story sets no context', () => {
    setStoryStartContext(undefined);
    expect(getStartContext({ throwIfNotFound: false })?.contextAfterGlobalMiddlewares).toEqual({});
  });
});
