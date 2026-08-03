import { fn } from 'storybook/test';

export type NavigationEvent = { to?: string; from?: string };

/**
 * Spy called whenever navigation is attempted (Link click, useNavigate, etc.).
 * It records `{ to, from }` unconditionally, so play functions can assert on
 * it whether or not the attempt goes through. Whether it goes through is a
 * separate switch: `parameters.tanstack.router.navigate`, off by default, in
 * which case the story stays on screen.
 */
export const onNavigate = fn<(event: NavigationEvent) => void>().mockName('navigate');
