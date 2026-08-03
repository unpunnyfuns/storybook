// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { redirect } from '@tanstack/react-router';

import { onNavigate } from './spies.ts';
import { createServerFn, useServerFn } from './start.ts';

type MockCreateServerFnBuilder = {
  validator: (validator: (input: unknown) => unknown) => {
    handler: (handlerFn: () => Promise<string>) => () => Promise<string>;
  };
};

describe('createServerFn', () => {
  it('supports TanStack Start validator chain syntax', async () => {
    const serverFn = (createServerFn() as unknown as MockCreateServerFnBuilder)
      .validator((input: unknown) => input)
      .handler(async () => 'ok');

    await expect(serverFn()).resolves.toBe('ok');
  });
});

describe('useServerFn', () => {
  function renderProbe(serverFn: () => Promise<unknown>) {
    let call: (() => Promise<unknown>) | undefined;

    function Probe() {
      call = useServerFn(serverFn);
      return null;
    }

    render(React.createElement(Probe));
    return () => call!();
  }

  it('navigates instead of rejecting when a server function throws a redirect', async () => {
    const call = renderProbe(async () => {
      throw redirect({ to: '/after' });
    });

    await expect(call()).resolves.toBeUndefined();
    expect(onNavigate).toHaveBeenCalledWith({ to: '/after' });
  });

  it('navigates instead of returning when a server function returns a redirect', async () => {
    const call = renderProbe(async () => redirect({ to: '/returned' }));

    await expect(call()).resolves.toBeUndefined();
    expect(onNavigate).toHaveBeenCalledWith({ to: '/returned' });
  });

  it('falls back to href when a redirect has no to', async () => {
    const call = renderProbe(async () => {
      throw redirect({ href: 'https://example.com/x' });
    });

    await expect(call()).resolves.toBeUndefined();
    expect(onNavigate).toHaveBeenCalledWith({ to: 'https://example.com/x' });
  });

  it('rethrows a non-redirect error unchanged', async () => {
    onNavigate.mockClear();
    const call = renderProbe(async () => {
      throw new Error('boom');
    });

    await expect(call()).rejects.toThrow('boom');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('returns the resolved value unchanged for a non-redirect result', async () => {
    const call = renderProbe(async () => 'ok');

    await expect(call()).resolves.toBe('ok');
  });
});
