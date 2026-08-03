import { afterEach, describe, expect, it } from 'vitest';

import { setStoryNavigation } from './story-navigation.ts';

const NAVIGATION_SYMBOL = Symbol.for('storybook.tanstack-react.story-navigation');

const globals = globalThis as typeof globalThis & { [NAVIGATION_SYMBOL]?: boolean };

afterEach(() => {
  delete globals[NAVIGATION_SYMBOL];
});

describe('setStoryNavigation', () => {
  it('publishes the flag a story enabled', () => {
    setStoryNavigation(true);
    expect(globals[NAVIGATION_SYMBOL]).toBe(true);
  });

  it('clears the flag when a story declares none, so it cannot leak into the next', () => {
    setStoryNavigation(true);
    setStoryNavigation(undefined);
    expect(NAVIGATION_SYMBOL in globals).toBe(false);
  });

  it('clears the flag when a story explicitly disables it', () => {
    setStoryNavigation(true);
    setStoryNavigation(false);
    expect(globals[NAVIGATION_SYMBOL]).toBe(false);
  });
});
