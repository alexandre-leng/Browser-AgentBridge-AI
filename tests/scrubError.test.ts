import { describe, it, expect } from 'vitest';
import { scrubError } from '../src/transport/ws.js';

describe('scrubError', () => {
  it('keeps first line only', () => {
    const e = new Error('line1\nline2\nline3');
    expect(scrubError(e).message).toBe('line1');
  });
  it('caps length at 300 chars', () => {
    const e = new Error('x'.repeat(500));
    expect(scrubError(e).message.length).toBe(300);
  });
  it('returns Error name as code', () => {
    const e = new TypeError('oops');
    expect(scrubError(e).code).toBe('TypeError');
  });
  it('handles non-Error values', () => {
    expect(scrubError('boom').message).toBe('boom');
    expect(scrubError(null).message).toBe('null');
  });
});
