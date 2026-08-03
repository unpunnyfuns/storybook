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

/**
 * FormData never reaches the serializer in a real app: the client sends it as
 * the raw request body and the server rebuilds it with request.formData(), so
 * the handler always receives a FormData instance that is not the one the
 * caller passed. Copying it here reproduces that much.
 *
 * Two divergences from the real path are left in deliberately. The real client
 * mutates the caller's FormData to carry the serialized context, which a story
 * has no reason to observe. And this copy is shallow, so File and Blob entries
 * stay reference-identical where a rebuilt instance would not. Both leave a
 * story more forgiving than the wire, never stricter.
 */
function copyFormData(data: FormData) {
  const copy = new FormData();
  data.forEach((value, key) => copy.append(key, value as string));
  return copy;
}

/**
 * Stands in for the RPC stub TanStack's compiler generates. The real one
 * serializes and fetches; this one serializes and calls the server half in
 * process, so no request leaves the browser.
 *
 * Only `data` and `context` cross the boundary, because only they cross the
 * real one: serverFnFetcher's serializePayload puts exactly those two keys on
 * the wire, and the server handler reconstructs `method` itself rather than
 * reading it from the payload. The argument the client middleware chain hands a
 * transport is much wider than that, carrying `extractedFn`, `serverFn`,
 * `middleware` and `inputValidator` alongside them, and every one of those is a
 * function seroval refuses to serialize. Round-tripping the whole argument
 * would therefore throw on every call.
 *
 * The two branches mirror serverFnFetcher's two: a payload without FormData is
 * serialized whole, so seroval can preserve references shared between `data`
 * and `context`, while a FormData payload has only its `context` serialized,
 * exactly as getFetchBody does.
 *
 * The mutable holder is deliberate: the transport needs a reference to the
 * object `.handler()` returns, which does not exist until after `.handler()` is
 * called. The transport is only invoked later, so binding afterwards is safe.
 */
export function createInProcessTransport() {
  const built: { current?: { __executeServer: (opts: any) => Promise<any> } } = {};

  const transport = async (payload: any) => {
    const sent =
      payload.data instanceof FormData
        ? { data: copyFormData(payload.data), context: await roundTrip(payload.context) }
        : await roundTrip({ data: payload.data, context: payload.context });

    const result = await built.current!.__executeServer({ ...sent, method: payload.method });
    return roundTrip(result);
  };

  return { transport, bind: (fn: typeof built.current) => (built.current = fn) };
}
