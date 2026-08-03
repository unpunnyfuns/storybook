// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { redirect } from '@tanstack/react-router';

import { onNavigate } from './spies.ts';
import { useServerFn } from './start.ts';

/**
 * These live apart from `start.test.ts` because they need a DOM and that file
 * must not have one. `@vitest-environment` is per file, and happy-dom
 * implements the fetch spec's forbidden header list, so a `Request` built with
 * a `cookie` header silently loses it. The cookie scope tests in `start.test.ts`
 * seed a request cookie exactly that way and would fail for a reason that has
 * nothing to do with the code under test.
 */
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
