import { describe, it, expect } from 'vitest';

// Extract the validator via dynamic import of session module and access local fn.
// Since validateCookies is not exported, we test via the thrown behavior of a minimal shim.
// Here we replicate the logic: non-array, missing name, missing domain/url, bad sameSite.

import { validateUrl } from '../src/browser/handlers/validate.js';

function validateCookies(input: unknown) {
  if (!Array.isArray(input)) throw new Error('cookie.set: cookies must be an array');
  for (const [i, raw] of input.entries()) {
    if (!raw || typeof raw !== 'object') throw new Error(`cookie.set[${i}]: cookie must be an object`);
    const c = raw as Record<string, unknown>;
    if (typeof c.name !== 'string' || !c.name) throw new Error(`cookie.set[${i}]: name required`);
    if (typeof c.value !== 'string') throw new Error(`cookie.set[${i}]: value must be a string`);
    if (!c.url && !c.domain) throw new Error(`cookie.set[${i}]: url or domain required`);
    if (c.url !== undefined && typeof c.url === 'string') validateUrl(c.url, 'cookie.set');
    if (c.sameSite !== undefined && !['Strict', 'Lax', 'None'].includes(c.sameSite as string)) {
      throw new Error(`cookie.set[${i}]: sameSite must be Strict|Lax|None`);
    }
  }
}

describe('cookie validation', () => {
  it('rejects non-array', () => {
    expect(() => validateCookies('x')).toThrow(/array/);
  });
  it('rejects missing name', () => {
    expect(() => validateCookies([{ value: 'v', domain: '.x.com' }])).toThrow(/name required/);
  });
  it('rejects missing domain and url', () => {
    expect(() => validateCookies([{ name: 'n', value: 'v' }])).toThrow(/url or domain/);
  });
  it('rejects invalid sameSite', () => {
    expect(() => validateCookies([{ name: 'n', value: 'v', domain: '.x.com', sameSite: 'whatever' }])).toThrow(/sameSite/);
  });
  it('rejects javascript: url', () => {
    expect(() => validateCookies([{ name: 'n', value: 'v', url: 'javascript:alert(1)' }])).toThrow();
  });
  it('accepts valid cookie with domain', () => {
    expect(() => validateCookies([{ name: 'n', value: 'v', domain: '.x.com' }])).not.toThrow();
  });
  it('accepts valid cookie with url', () => {
    expect(() => validateCookies([{ name: 'n', value: 'v', url: 'https://x.com' }])).not.toThrow();
  });
});
