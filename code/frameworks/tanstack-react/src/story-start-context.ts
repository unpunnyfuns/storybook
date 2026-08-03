/**
 * The context a story supplies in place of global function middleware.
 *
 * This deliberately does not live in `export-mocks/start-storage-context.ts`.
 * `plugins/module-interception.ts` redirects `@tanstack/start-storage-context`
 * to that file, so anything exported there is importable under the real
 * package's specifier and becomes API no real TanStack app has. The value is
 * therefore passed across module boundaries through a well-known symbol on
 * `globalThis`, the way the start context itself already is, and the reader
 * declares its own `Symbol.for` with the same key rather than importing this.
 */
const STORY_CONTEXT_SYMBOL = Symbol.for('storybook.tanstack-react.story-start-context');

type BrowserStartGlobals = typeof globalThis & {
  [STORY_CONTEXT_SYMBOL]?: Record<string, unknown>;
};

const browserGlobals = globalThis as BrowserStartGlobals;

/**
 * Publishes the current story's start context, or clears it when the story
 * declares none. The decorator calls this for every story, because Storybook
 * keeps preview modules alive across navigations and one story's context must
 * not survive into the next.
 */
export function setStoryStartContext(context: Record<string, unknown> | undefined) {
  if (context === undefined) {
    delete browserGlobals[STORY_CONTEXT_SYMBOL];
    return;
  }

  browserGlobals[STORY_CONTEXT_SYMBOL] = context;
}
