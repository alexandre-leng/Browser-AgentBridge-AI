import { describe, it, expect, beforeEach } from 'vitest';
import { hostOf, waitForDomainBudget } from '../src/browser/polite.js';

describe('polite browsing', () => {
  beforeEach(() => {
    process.env.BRIDGE_POLITE_MODE = '1';
    process.env.BRIDGE_POLITE_MIN_DELAY_MS = '5';
  });

  it('extracts host from urls', () => {
    expect(hostOf('https://www.leboncoin.fr/ad/123')).toBe('www.leboncoin.fr');
    expect(hostOf('not a url')).toBe('');
  });

  it('waits on repeated requests to the same host', async () => {
    const first = await waitForDomainBudget('https://example.com/a');
    const second = await waitForDomainBudget('https://example.com/b');
    expect(first.waitedMs).toBe(0);
    expect(second.waitedMs).toBeGreaterThanOrEqual(0);
    expect(second.host).toBe('example.com');
  });

  it('can be disabled for local tests', async () => {
    process.env.BRIDGE_POLITE_MODE = '0';
    const result = await waitForDomainBudget('https://example.com/a');
    expect(result.waitedMs).toBe(0);
  });
});
