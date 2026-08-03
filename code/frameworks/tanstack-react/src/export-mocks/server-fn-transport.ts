import { isRedirect } from '@tanstack/router-core';
import { X_TSS_RAW_RESPONSE, getDefaultSerovalPlugins } from '@tanstack/start-client-core';
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
 * getDefaultSerovalPlugins() is read fresh on every call rather than cached,
 * though today that read is constant. It derives from
 * getStartOptions()?.serializationAdapters, and getStartOptions is the same
 * dead createIsomorphicFn stub that makes global function middleware
 * unreachable, so a story's custom serialization adapters never arrive here
 * and only router-core's defaultSerovalPlugins apply. createStart() does write
 * __TSS_START_OPTIONS__ per story, so if that stub is ever intercepted the
 * list becomes per-story and a cache would serve one story's adapters to the
 * next, while Storybook keeps this module alive across navigations. The read
 * is a cheap array spread, so paying it every call costs nothing and removes
 * the trap in advance.
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
 * A `Response` never reaches the serializer, and neither does a redirect.
 *
 * The real server handler unwraps `result || error` and, when what it finds is
 * a `Response`, sets the `x-tss-raw` header on it and sends that `Response` as
 * the entire HTTP response instead of the usual serialized envelope
 * (server-functions-handler.ts). The client fetcher sees the header and returns
 * the `Response` as the transport's whole return value, not as an envelope
 * (serverFnFetcher.ts, getResponse). The client middleware then routes it to
 * `result` through the `userCtx instanceof Response` branch in `userNext`
 * (createServerFn.ts), so the caller receives the bare `Response`.
 *
 * Two consequences of that path are reproduced here on purpose. A `Response`
 * the handler *threw* comes back as a resolved value, because `result || error`
 * does not care which field held it. And any `sendContext` the server
 * middleware set is dropped, because the envelope that would have carried it is
 * never sent.
 *
 * One thing is not reproduced: fetch rebuilds the `Response` on the way back,
 * so a real story never holds the instance its handler created. This hands that
 * instance straight over, which also means the header set below is written onto
 * the handler's own object.
 *
 * A redirect is a `Response` too but takes the other branch: the handler
 * returns it without the raw header, and `handleRedirectResponse` in
 * createStartHandler.ts re-encodes it as JSON options, which the client rebuilds
 * into a fresh redirect and throws. Rethrowing reaches the same caller-visible
 * outcome, a rejected call carrying a redirect, by a shorter route. Two things
 * therefore differ: this throws the handler's own `Response` rather than a copy
 * rebuilt from JSON, and it skips `handleRedirectResponse`'s guards, which
 * reject a relative `to` and functional `search`, `params` or `hash`. Those
 * guards only ever run for unresolved redirects in a real server too, since
 * `handleRedirectResponse` returns early for any redirect carrying
 * `options.href`. Both leave a story more forgiving than the wire, never
 * stricter.
 */
function unwrapServerResult(returned: any) {
  const unwrapped = returned.result || returned.error;

  if (isRedirect(unwrapped)) {
    throw unwrapped;
  }

  if (unwrapped instanceof Response) {
    unwrapped.headers.set(X_TSS_RAW_RESPONSE, 'true');
    return unwrapped;
  }

  return roundTrip(returned);
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

    const returned = await built.current!.__executeServer({ ...sent, method: payload.method });
    return unwrapServerResult(returned);
  };

  return { transport, bind: (fn: typeof built.current) => (built.current = fn) };
}
