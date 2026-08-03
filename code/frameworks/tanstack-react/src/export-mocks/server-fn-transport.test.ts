import { describe, expect, it, vi } from 'vitest';
import { getDefaultSerovalPlugins } from '@tanstack/start-client-core';
import { roundTrip } from './server-fn-transport.ts';

vi.mock('@tanstack/start-client-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/start-client-core')>();
  return {
    ...actual,
    getDefaultSerovalPlugins: vi.fn(actual.getDefaultSerovalPlugins),
  };
});

describe('roundTrip', () => {
  it('preserves plain data', async () => {
    await expect(roundTrip({ a: 1, b: 'two' })).resolves.toEqual({ a: 1, b: 'two' });
  });

  it('preserves types a structured clone would keep', async () => {
    const result = await roundTrip({ when: new Date(0), tags: new Set(['a']) });
    expect(result.when).toBeInstanceOf(Date);
    expect(result.tags).toBeInstanceOf(Set);
  });

  it('returns a copy rather than the same reference', async () => {
    const original = { nested: { n: 1 } };
    const result = await roundTrip(original);
    expect(result).not.toBe(original);
    expect(result.nested).not.toBe(original.nested);
  });

  it('rejects a value the real transport could not send', async () => {
    await expect(roundTrip({ fn: () => 'nope' })).rejects.toThrow();
  });

  it('re-reads the plugin list on every call instead of freezing it after the first', async () => {
    const spy = vi.mocked(getDefaultSerovalPlugins);
    spy.mockClear();

    await roundTrip({ a: 1 });
    const callsAfterFirst = spy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await roundTrip({ a: 2 });
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
