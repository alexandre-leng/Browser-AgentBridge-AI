import { describe, it, expect } from 'vitest';
import { scrubPayload } from '../src/browser/scrub.js';

describe('scrubPayload', () => {
  it('redacts known sensitive keys', () => {
    const out = scrubPayload({ token: 'abc', password: 'p', ok: true }) as any;
    expect(out.token).toBe('[redacted]');
    expect(out.password).toBe('[redacted]');
    expect(out.ok).toBe(true);
  });

  it('redacts text only for typing commands', () => {
    const typed = scrubPayload({ ref: 1, text: 'hunter2' }, 'agent.type') as any;
    expect(typed.text).toBe('[redacted]');
    expect(typed.ref).toBe(1);

    const clicked = scrubPayload({ ref: 1, text: 'Sign in' }, 'agent.click') as any;
    expect(clicked.text).toBe('Sign in');
  });

  it('walks nested structures', () => {
    const out = scrubPayload({ outer: { inner: { token: 'x', list: [{ apiKey: 'y' }] } } }) as any;
    expect(out.outer.inner.token).toBe('[redacted]');
    expect(out.outer.inner.list[0].apiKey).toBe('[redacted]');
  });

  it('passes primitives through', () => {
    expect(scrubPayload(null)).toBe(null);
    expect(scrubPayload(undefined)).toBe(undefined);
    expect(scrubPayload('plain')).toBe('plain');
    expect(scrubPayload(42)).toBe(42);
  });
});
