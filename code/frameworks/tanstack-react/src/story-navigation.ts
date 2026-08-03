/**
 * Whether the current story performs navigation or only records it.
 *
 * This deliberately does not live under `export-mocks/`. Files there are the
 * redirect targets of `plugins/module-interception.ts`, so anything exported
 * from them is importable under a real TanStack specifier and becomes API no
 * real app has. The value crosses module boundaries through a well-known
 * symbol on `globalThis`, and the reader declares its own `Symbol.for` with
 * the same key rather than importing this.
 */
const STORY_NAVIGATION_SYMBOL = Symbol.for('storybook.tanstack-react.story-navigation');

type BrowserNavigationGlobals = typeof globalThis & {
  [STORY_NAVIGATION_SYMBOL]?: boolean;
};

const browserGlobals = globalThis as BrowserNavigationGlobals;

/**
 * Publishes the current story's navigate flag, or clears it when the story
 * declares none. The decorator calls this for every story, because Storybook
 * keeps preview modules alive across navigations and one story's setting must
 * not survive into the next.
 */
export function setStoryNavigation(enabled: boolean | undefined) {
  if (enabled === undefined) {
    delete browserGlobals[STORY_NAVIGATION_SYMBOL];
    return;
  }

  browserGlobals[STORY_NAVIGATION_SYMBOL] = enabled;
}
