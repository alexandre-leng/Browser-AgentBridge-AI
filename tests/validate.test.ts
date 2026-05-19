import { describe, it, expect } from 'vitest';
import { validate, validateUrl } from '../src/browser/handlers/validate.js';

describe('validate', () => {
  it('accepts valid payload', () => {
    expect(() => validate({ url: 'x', count: 3 }, {
      url: { type: 'string', required: true },
      count: { type: 'number', min: 0, max: 10 },
    }, 'test')).not.toThrow();
  });
  it('rejects missing required', () => {
    expect(() => validate({}, { url: { type: 'string', required: true } }, 'test')).toThrow(/required/);
  });
  it('enforces enum', () => {
    expect(() => validate({ mode: 'x' }, { mode: { type: 'string', enum: ['a', 'b'] } }, 't')).toThrow(/one of/);
  });
  it('enforces number bounds', () => {
    expect(() => validate({ n: 100 }, { n: { type: 'number', max: 10 } }, 't')).toThrow(/<=/);
  });
  it('rejects non-array for array type', () => {
    expect(() => validate({ xs: 'nope' }, { xs: { type: 'array' } }, 't')).toThrow(/array/);
  });
  it('rejects non-object payload', () => {
    expect(() => validate('x' as any, {}, 't')).toThrow(/object/);
  });
});

describe('validateUrl', () => {
  it('accepts http/https', () => {
    expect(validateUrl('https://example.com')).toMatch(/^https:/);
    expect(validateUrl('http://example.com')).toMatch(/^http:/);
  });
  it('rejects javascript:', () => {
    expect(() => validateUrl('javascript:alert(1)')).toThrow();
  });
  it('rejects data:', () => {
    expect(() => validateUrl('data:text/html,<script>')).toThrow();
  });
  it('rejects file: by default', () => {
    expect(() => validateUrl('file:///tmp/agentbridge.html')).toThrow(/file/);
  });
  it('rejects garbage', () => {
    expect(() => validateUrl('not a url')).toThrow();
  });
  it('rejects empty', () => {
    expect(() => validateUrl('')).toThrow();
  });
});
