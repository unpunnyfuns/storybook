import { createContext } from 'react';
import type { AnyRouter } from '@tanstack/react-router';

/**
 * How navigation behaves inside a story:
 *
 * - `'spy'` (default): navigation is blocked and logged to the Actions panel.
 *   The story always stays on screen.
 * - `'same-route'`: navigation that resolves to the story's current route
 *   (search-param or path-param changes) is performed for real; cross-route
 *   navigation stays blocked-and-logged. The story keeps its identity while
 *   its subject changes state.
 * - `'real'`: all navigation is performed against the story's memory router.
 *   The canvas may leave the story's bound route; remount to return.
 */
export type NavigationMode = 'spy' | 'same-route' | 'real';

export const NavigationModeContext = createContext<NavigationMode>('spy');

interface NavigationTarget {
  to?: string;
  params?: Record<string, unknown>;
  search?: unknown;
  hash?: string;
  from?: string;
}

/**
 * Whether navigating to `target` lands on the same route definition the
 * router currently matches (same leaf route id; params/search may differ).
 * Unresolvable destinations report `false` so `'same-route'` mode falls back
 * to the blocked-and-logged behavior instead of navigating somewhere
 * unexpected.
 */
export function isSameRouteNavigation(router: AnyRouter, target: NavigationTarget): boolean {
  try {
    const { matches, location } = router.state;
    let currentLeafId = matches[matches.length - 1]?.routeId;
    if (currentLeafId == null) {
      // matches only commit through the render subscription in some setups;
      // resolve the current leaf the same way we resolve the destination.
      const currentMatches = router.matchRoutes(location.pathname, location.search);
      currentLeafId = currentMatches[currentMatches.length - 1]?.routeId;
    }
    if (currentLeafId == null) {
      return false;
    }
    const destination = router.buildLocation(target as any);
    const destinationMatches = router.matchRoutes(destination.pathname, destination.search);
    const destinationLeafId = destinationMatches[destinationMatches.length - 1]?.routeId;
    return destinationLeafId != null && destinationLeafId === currentLeafId;
  } catch {
    return false;
  }
}
