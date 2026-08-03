import React from 'react';
import { once } from 'storybook/internal/client-logger';
import { fn } from 'storybook/test';
import {
  type createServerFn as _createServerFn,
  createMiddleware as clientCreateMiddleware,
  createServerFn as realCreateServerFn,
} from '@tanstack/start-client-core';
import { createInProcessTransport } from './server-fn-transport.ts';
import { onNavigate } from './spies.ts';

export * from '@tanstack/start-client-core';
export * from '@tanstack/react-start';

const START_SERVER_STATE_SYMBOL = Symbol.for('storybook.tanstack-react.start-server.state');

type RequestOptions<TRegister = unknown> = {
  context?: TRegister extends { server: { requestContext: infer TRequestContext } }
    ? TRequestContext
    : unknown;
};

type MockRequestExecutor<TRegister = unknown> = (
  request: Request,
  opts?: RequestOptions<TRegister>
) => Promise<unknown> | unknown;

type HandlerContext = {
  request: Request;
  responseHeaders: Headers;
  router?: unknown;
  context?: unknown;
  requestContext?: unknown;
};

type HandlerCallback<TRouter = unknown> = (
  context: HandlerContext & { router?: TRouter }
) => Promise<unknown> | unknown;

type SessionConfig = Record<string, unknown>;

type MockSession<TSessionData extends Record<string, unknown> = Record<string, unknown>> = {
  data: Partial<TSessionData>;
  update: (
    update?: Partial<TSessionData> | ((prev: Partial<TSessionData>) => Partial<TSessionData>)
  ) => Promise<MockSession<TSessionData>>;
  save: () => Promise<void>;
  clear: () => Promise<void>;
};

type MockServerState = {
  request: Request;
  responseHeaders: Headers;
  responseStatus?: {
    code?: number;
    text?: string;
  };
  cookies: Map<string, string>;
  sessionData: Record<string, unknown>;
};

type BrowserStartGlobals = typeof globalThis & {
  __TSR_ROUTER__?: unknown;
  __TSS_START_OPTIONS__?: unknown;
  [START_SERVER_STATE_SYMBOL]?: MockServerState;
};

const browserGlobals = globalThis as BrowserStartGlobals;

export const HEADERS = {
  TSS_SHELL: 'X-TSS_SHELL',
} as const;

export const VIRTUAL_MODULES = {
  startManifest: 'tanstack-start-manifest:v',
  injectedHeadScripts: 'tanstack-start-injected-head-scripts:v',
  serverFnResolver: '#tanstack-start-server-fn-resolver',
} as const;

function createNamedMock<T extends (...args: Array<any>) => any>(
  name: string,
  implementation: T
): T {
  return fn(implementation).mockName(`@tanstack/react-start/server::${name}`) as unknown as T;
}

function createDefaultRequest() {
  return new Request('http://localhost/');
}

function parseCookieHeader(cookieHeader: string | null) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const segment of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = segment.trim().split('=');

    if (!rawName) {
      continue;
    }

    cookies.set(rawName, decodeURIComponent(rawValue.join('=')));
  }

  return cookies;
}

function serializeCookie(name: string, value: string, options?: Record<string, unknown>) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (typeof options?.path === 'string') {
    parts.push(`Path=${options.path}`);
  }

  if (typeof options?.domain === 'string') {
    parts.push(`Domain=${options.domain}`);
  }

  if (typeof options?.maxAge === 'number') {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options?.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options?.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options?.secure) {
    parts.push('Secure');
  }

  if (typeof options?.sameSite === 'string') {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join('; ');
}

function createMockState(request = createDefaultRequest()): MockServerState {
  return {
    request,
    responseHeaders: new Headers(),
    responseStatus: undefined,
    cookies: parseCookieHeader(request.headers.get('cookie')),
    sessionData: {},
  };
}

function getState() {
  const existingState = browserGlobals[START_SERVER_STATE_SYMBOL];

  if (existingState) {
    return existingState;
  }

  const nextState = createMockState();
  browserGlobals[START_SERVER_STATE_SYMBOL] = nextState;
  return nextState;
}

async function withRequestState<T>(request: Request, run: () => Promise<T> | T) {
  const previousState = browserGlobals[START_SERVER_STATE_SYMBOL];
  browserGlobals[START_SERVER_STATE_SYMBOL] = createMockState(request);

  try {
    return await run();
  } finally {
    if (previousState) {
      browserGlobals[START_SERVER_STATE_SYMBOL] = previousState;
    } else {
      delete browserGlobals[START_SERVER_STATE_SYMBOL];
    }
  }
}

function mergeResponseState(response: Response) {
  const state = getState();
  const headers = new Headers(response.headers);

  state.responseHeaders.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      headers.append(key, value);
      return;
    }

    headers.set(key, value);
  });

  return new Response(response.body, {
    status: state.responseStatus?.code ?? response.status,
    statusText: state.responseStatus?.text ?? response.statusText,
    headers,
  });
}

function toResponse(result: unknown) {
  if (result instanceof Response) {
    return mergeResponseState(result);
  }

  if (result === undefined || result === null) {
    return mergeResponseState(new Response(null));
  }

  if (typeof result === 'string') {
    return mergeResponseState(new Response(result));
  }

  return mergeResponseState(
    new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' },
    })
  );
}

function getSessionRecord<
  TSessionData extends Record<string, unknown> = Record<string, unknown>,
>(): MockSession<TSessionData> {
  const state = getState();

  return {
    data: state.sessionData as Partial<TSessionData>,
    update: async (
      update?: Partial<TSessionData> | ((prev: Partial<TSessionData>) => Partial<TSessionData>)
    ) => {
      const nextValue =
        typeof update === 'function' ? update(state.sessionData as Partial<TSessionData>) : update;

      state.sessionData = {
        ...state.sessionData,
        ...nextValue,
      };

      return getSessionRecord<TSessionData>();
    },
    save: async () => {},
    clear: async () => {
      state.sessionData = {};
    },
  } satisfies MockSession<TSessionData>;
}

export function StartServer() {
  return null;
}

export const defineHandlerCallback = createNamedMock(
  'defineHandlerCallback',
  <TRouter = unknown>(handler: HandlerCallback<TRouter>) => handler
);

export const defaultStreamHandler = createNamedMock(
  'defaultStreamHandler',
  async () => new Response('Storybook Mock', { status: 200 })
);

export const defaultRenderHandler = createNamedMock(
  'defaultRenderHandler',
  async () => new Response('Storybook Mock', { status: 200 })
);

export const requestHandler = createNamedMock(
  'requestHandler',
  <TRegister = unknown>(handler: MockRequestExecutor<TRegister>) => {
    return async (request: Request, requestOpts?: RequestOptions<TRegister>) =>
      withRequestState(request, async () => toResponse(await handler(request, requestOpts)));
  }
);

export const createRequestHandler = createNamedMock(
  'createRequestHandler',
  <TRegister = unknown>(handler: MockRequestExecutor<TRegister>) => requestHandler(handler)
);

export const createStartHandler = createNamedMock(
  'createStartHandler',
  <TRegister = unknown>(
    cbOrOptions:
      | HandlerCallback
      | {
          handler?: HandlerCallback;
        }
  ) => {
    const handler = typeof cbOrOptions === 'function' ? cbOrOptions : cbOrOptions?.handler;

    return requestHandler<TRegister>(async (request, requestOpts) => {
      if (!handler) {
        return new Response('Storybook Mock', { status: 200 });
      }

      return handler({
        request,
        responseHeaders: getState().responseHeaders,
        router: browserGlobals.__TSR_ROUTER__,
        context: requestOpts?.context,
        requestContext: requestOpts?.context,
      });
    });
  }
);

export const attachRouterServerSsrUtils = createNamedMock(
  'attachRouterServerSsrUtils',
  <TRouter>(router: TRouter) => router
);

export const transformReadableStreamWithRouter = createNamedMock(
  'transformReadableStreamWithRouter',
  <TReadableStream>(stream: TReadableStream) => stream
);

export const transformPipeableStreamWithRouter = createNamedMock(
  'transformPipeableStreamWithRouter',
  <TPipeableStream>(stream: TPipeableStream) => stream
);

export const getRequest = createNamedMock('getRequest', () => getState().request);

export const getRequestHeaders = createNamedMock(
  'getRequestHeaders',
  () => getState().request.headers
);

export const getRequestHeader = createNamedMock('getRequestHeader', (name: string) => {
  return getState().request.headers.get(name) ?? undefined;
});

export const getRequestIP = createNamedMock(
  'getRequestIP',
  (opts?: { xForwardedFor?: boolean }) => {
    if (!opts?.xForwardedFor) {
      return undefined;
    }

    return getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim();
  }
);

export const getRequestHost = createNamedMock(
  'getRequestHost',
  (opts?: { xForwardedHost?: boolean }) => {
    const host = opts?.xForwardedHost
      ? getRequestHeader('x-forwarded-host')
      : getRequestHeader('host');

    return host ?? new URL(getState().request.url).host ?? 'localhost';
  }
);

export const getRequestUrl = createNamedMock(
  'getRequestUrl',
  (opts?: { xForwardedHost?: boolean; xForwardedProto?: boolean }) => {
    const url = new URL(getState().request.url);
    const forwardedHost = opts?.xForwardedHost ? getRequestHeader('x-forwarded-host') : undefined;
    const forwardedProto =
      opts?.xForwardedProto === false ? undefined : getRequestHeader('x-forwarded-proto');

    if (forwardedHost) {
      url.host = forwardedHost;
    }

    if (forwardedProto) {
      url.protocol = `${forwardedProto}:`;
    }

    return url;
  }
);

export const getRequestProtocol = createNamedMock(
  'getRequestProtocol',
  (opts?: { xForwardedProto?: boolean }) => {
    const forwardedProto =
      opts?.xForwardedProto === false ? undefined : getRequestHeader('x-forwarded-proto');

    if (forwardedProto) {
      return forwardedProto;
    }

    return getRequestUrl().protocol.replace(/:$/, '') || 'http';
  }
);

export const setResponseHeaders = createNamedMock('setResponseHeaders', (headers: HeadersInit) => {
  const existing = getState().responseHeaders;
  new Headers(headers).forEach((value, key) => {
    existing.set(key, value);
  });
});

export const getResponseHeaders = createNamedMock(
  'getResponseHeaders',
  () => getState().responseHeaders
);

export const getResponseHeader = createNamedMock('getResponseHeader', (name: string) => {
  return getState().responseHeaders.get(name) ?? undefined;
});

export const setResponseHeader = createNamedMock(
  'setResponseHeader',
  (name: string, value: string | Array<string>) => {
    const headers = getState().responseHeaders;
    headers.delete(name);

    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(name, entry));
      return;
    }

    headers.set(name, value);
  }
);

export const removeResponseHeader = createNamedMock('removeResponseHeader', (name: string) => {
  getState().responseHeaders.delete(name);
});

export const clearResponseHeaders = createNamedMock(
  'clearResponseHeaders',
  (headerNames?: Array<string>) => {
    if (!headerNames?.length) {
      getState().responseHeaders = new Headers();
      return;
    }

    headerNames.forEach((name) => getState().responseHeaders.delete(name));
  }
);

export const getResponseStatus = createNamedMock('getResponseStatus', () => {
  return getState().responseStatus?.code ?? 200;
});

export const setResponseStatus = createNamedMock(
  'setResponseStatus',
  (code?: number, text?: string) => {
    getState().responseStatus = {
      code,
      text,
    };
  }
);

export const getCookies = createNamedMock('getCookies', () => {
  return Object.fromEntries(getState().cookies);
});

export const getCookie = createNamedMock('getCookie', (name: string) => {
  return getState().cookies.get(name);
});

export const setCookie = createNamedMock(
  'setCookie',
  (name: string, value: string, options?: Record<string, unknown>) => {
    getState().responseHeaders.append('set-cookie', serializeCookie(name, value, options));
  }
);

export const deleteCookie = createNamedMock(
  'deleteCookie',
  (name: string, options?: Record<string, unknown>) => {
    getState().responseHeaders.append(
      'set-cookie',
      serializeCookie(name, '', {
        ...options,
        maxAge: 0,
      })
    );
  }
);

export const useSession = createNamedMock(
  'useSession',
  async <TSessionData extends Record<string, unknown> = Record<string, unknown>>(
    _config: SessionConfig
  ) => getSessionRecord<TSessionData>()
);

export const getSession = createNamedMock(
  'getSession',
  async <TSessionData extends Record<string, unknown> = Record<string, unknown>>(
    _config: SessionConfig
  ) => getSessionRecord<TSessionData>()
);

export const updateSession = createNamedMock(
  'updateSession',
  async <TSessionData extends Record<string, unknown> = Record<string, unknown>>(
    _config: SessionConfig,
    update?: Partial<TSessionData> | ((prev: Partial<TSessionData>) => Partial<TSessionData>)
  ) => getSessionRecord<TSessionData>().update(update)
);

export const sealSession = createNamedMock('sealSession', async (_config: SessionConfig) => {
  return JSON.stringify(getState().sessionData);
});

export const unsealSession = createNamedMock(
  'unsealSession',
  async (_config: SessionConfig, sealed: string) => {
    try {
      return JSON.parse(sealed);
    } catch {
      return {};
    }
  }
);

export const clearSession = createNamedMock(
  'clearSession',
  async (_config: Partial<SessionConfig>) => {
    getState().sessionData = {};
  }
);

export const getResponse = createNamedMock('getResponse', () => {
  return {
    status: getState().responseStatus?.code,
    statusText: getState().responseStatus?.text,
    get headers() {
      return getState().responseHeaders;
    },
  };
});

export const getValidatedQuery = createNamedMock(
  'getValidatedQuery',
  async (schema: {
    parse?: (value: Record<string, string>) => unknown;
    safeParse?: (value: Record<string, string>) => unknown;
    ['~standard']?: {
      validate?: (value: Record<string, string>) => Promise<unknown> | unknown;
    };
  }) => {
    const query = Object.fromEntries(getRequestUrl().searchParams.entries());

    if (typeof schema?.parse === 'function') {
      return schema.parse(query);
    }

    if (typeof schema?.safeParse === 'function') {
      const result = await schema.safeParse(query);

      if (result && typeof result === 'object' && 'data' in result) {
        return (result as { data: unknown }).data;
      }

      return result;
    }

    if (typeof schema?.['~standard']?.validate === 'function') {
      return schema['~standard'].validate(query);
    }

    return query;
  }
);

// ============================================================================
// Client-side APIs (from @tanstack/react-start and @tanstack/start-client-core)
// ============================================================================

export function useServerFn<T extends (...args: Array<any>) => Promise<any>>(
  serverFn: T
): (...args: Parameters<T>) => ReturnType<T> {
  return React.useCallback(
    (...args: Parameters<T>) => serverFn(...args) as ReturnType<T>,
    [serverFn]
  );
}

/**
 * Wraps a real `createServerFn` builder so every chain step stays wrapped and
 * `.handler()` ends in a spy.
 *
 * The real builder is `Object.assign(fun, res)`: a callable that also carries
 * `options`, `middleware`, `inputValidator` and `handler`, and `middleware()`
 * additionally tags its result with a symbol the next `middleware()` call reads
 * back. Copying the real builder onto the wrapper first preserves all of that,
 * including symbol keys, so a wrapped builder can still be passed into another
 * builder's `middleware([...])`. The overrides then re-wrap, because each real
 * chain method returns a brand new builder that would otherwise escape the
 * wrapper and take `.handler()` with it.
 *
 * `validator` is not on the real builder. It is the name the Storybook mock has
 * always exposed, and stories written against it must keep working, so it stays
 * as an alias for `inputValidator`.
 */
function wrapServerFnBuilder(builder: any): any {
  const wrapped = (options?: any) => wrapServerFnBuilder(builder(options));

  return Object.assign(wrapped, builder, {
    middleware: (middleware: Array<any>) => wrapServerFnBuilder(builder.middleware(middleware)),
    inputValidator: (validator: any) => wrapServerFnBuilder(builder.inputValidator(validator)),
    validator: (validator: any) => wrapServerFnBuilder(builder.inputValidator(validator)),
    handler: (userHandler?: (...args: Array<any>) => any) => {
      const { transport, bind } = createInProcessTransport();
      const real = builder.handler(transport, userHandler);
      bind(real);

      return fn(real).mockName('@tanstack/start-client-core::createServerFn.handler()');
    },
  });
}

/**
 * Delegates to the real `createServerFn` instead of reimplementing it, so a
 * story runs the middleware chain and the input validator the app declared.
 *
 * The real builder expects the compiler to have supplied an RPC stub as the
 * first argument to `.handler()`; nothing compiles a Storybook preview, so the
 * in-process transport stands in for it and calls the server half directly.
 *
 * `fn(real)` rather than `fn().mockImplementation(real)` is deliberate. Vitest
 * restores the implementation a mock was constructed with on `mockReset`, and
 * Storybook resets mocks between stories, so only the constructed form keeps
 * running the real chain in the second story a user visits.
 */
export const createServerFn: typeof _createServerFn = (options?: any) => {
  return wrapServerFnBuilder(realCreateServerFn(options));
};

export const Link = ({
  to,
  children,
  ...props
}: {
  to: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}) => React.createElement('a', { href: to, ...props }, children);

export const Navigate = ({ to }: { to: string }) => {
  React.useEffect(() => {
    onNavigate({ to });
  }, [to]);

  return null;
};

export const Hydrate = ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
  children ?? null;

export const notFound = () => {
  throw new Error('Not found');
};

/**
 * Global function middleware cannot run in a Storybook build, so say so instead
 * of silently dropping it.
 *
 * The real chain reads it from `getStartOptions()`, which is built on
 * `createIsomorphicFn`. The runtime ships that as an explicit dummy that
 * discards both implementations and relies on a compiler transform which never
 * runs over `node_modules`, so the call returns `undefined` no matter what
 * `createStart` was given. Nothing this framework can do from the outside
 * changes that, which is why this is a warning and a documented escape hatch
 * rather than an implementation.
 */
function warnAboutGlobalFunctionMiddleware(options: any) {
  if (!Array.isArray(options?.functionMiddleware) || options.functionMiddleware.length === 0) {
    return;
  }

  once.warn(
    'TanStack: the global functionMiddleware passed to createStart() does not run in Storybook, ' +
      'so server functions receive no context from it. Supply the context that middleware would ' +
      'have produced with the parameters.tanstack.start.context story parameter.'
  );
}

// TanStack Start server entry
/**
 * The real `createStart` returns `{ getOptions, createMiddleware }` and is
 * entirely lazy: it calls the thunk only inside `getOptions()`.
 *
 * The shape is mirrored, the laziness deliberately is not. Nothing in a
 * Storybook preview ever calls `getOptions()`, so staying lazy would mean the
 * options are never published and the global middleware warning never reaches
 * the app that needs it. The thunk is therefore called once, eagerly, and
 * `getOptions()` hands back that same result rather than calling it again, so a
 * story sees the thunk run exactly once rather than twice or not at all.
 *
 * Not mirrored: the real `getOptions()` also dedupes `serializationAdapters`.
 * Neither branch composed here had that, and a merge is the wrong place to add
 * behavior that neither side shipped.
 */
export const createStart = (getOptions?: () => any) => {
  const result = getOptions ? getOptions() : {};

  if (result && typeof result.then === 'function') {
    Promise.resolve(result).then((resolved) => {
      browserGlobals.__TSS_START_OPTIONS__ = resolved;
      warnAboutGlobalFunctionMiddleware(resolved);
    });
  } else {
    browserGlobals.__TSS_START_OPTIONS__ = result;
    warnAboutGlobalFunctionMiddleware(result);
  }

  return {
    getOptions: async () => result,
    createMiddleware: clientCreateMiddleware,
  };
};

// Cookie helpers (client-side simple storage)
const clientCookieStore = new Map<string, string>();

export const clearCookieStore = () => {
  clientCookieStore.clear();
};

// Server entry default export
const fetchHandler = async () => new Response('Storybook Mock', { status: 200 });

export { fetchHandler as fetch };

export default { fetch: fetchHandler };
