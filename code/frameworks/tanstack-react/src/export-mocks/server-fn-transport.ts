import { getDefaultSerovalPlugins } from '@tanstack/start-client-core';
import { fromCrossJSON, toCrossJSONAsync } from 'seroval';

/**
 * Mirrors what the real transport does to values crossing the wire, so a story
 * cannot pass something the server would reject and cannot share a reference
 * the real app would have copied.
 *
 * The real transport uses two different serialize/deserialize pairs depending
 * on direction: the client encodes outgoing payloads with toJSONAsync, which
 * the server decodes with fromJSON, while the server encodes results with
 * toCrossJSONAsync, which the client decodes with fromCrossJSON. toJSONAsync's
 * output is not shaped for fromCrossJSON: toJSONAsync wraps the tree in
 * { t, f, m } and fromCrossJSON reads its argument as the tree itself, so
 * pairing them throws on every input. Since this helper has to own both
 * directions of a single in-process round trip, it uses the toCrossJSONAsync
 * and fromCrossJSON pair, which is the one the real code actually matches.
 *
 * getDefaultSerovalPlugins() is read fresh on every call rather than cached.
 * It derives from getStartOptions().serializationAdapters, and createStart()
 * writes serializationAdapters to window.__TSS_START_OPTIONS__ per story,
 * while Storybook keeps this module alive across story navigations. Caching
 * the plugin list once would risk serving one story's adapters to the next.
 * The read is a cheap array spread (getDefaultSerovalPlugins.ts), so there is
 * no cost to paying it on every call.
 */
export async function roundTrip<T>(value: T): Promise<T> {
  const serialized = await toCrossJSONAsync(value, {
    refs: new Map(),
    plugins: getDefaultSerovalPlugins(),
  });
  return fromCrossJSON(serialized, { plugins: getDefaultSerovalPlugins() }) as T;
}
