import { describe, it, expect } from 'vitest';
import { detectKind } from '../src/browser/resolver.js';

describe('detectKind', () => {
  it('should detect XPath', () => {
    expect(detectKind('//div')).toBe('xpath');
    expect(detectKind('(/html/body/div)[1]')).toBe('xpath');
    expect(detectKind('xpath=//button')).toBe('xpath');
  });

  it('should detect CSS selectors', () => {
    expect(detectKind('#id')).toBe('css');
    expect(detectKind('.class')).toBe('css');
    expect(detectKind('div > p')).toBe('css');
    expect(detectKind('input[name="test"]')).toBe('css');
    expect(detectKind('button::before')).toBe('css');
  });

  it('should detect CSS selectors for known tags', () => {
    expect(detectKind('body')).toBe('css');
    expect(detectKind('div')).toBe('css');
    expect(detectKind('input')).toBe('css');
  });

  it('should detect explicit prefixes', () => {
    expect(detectKind('css=div.custom')).toBe('css');
    expect(detectKind('text=Login')).toBe('text');
  });

  it('should detect text by default', () => {
    expect(detectKind('Click me')).toBe('text');
    expect(detectKind('Search...')).toBe('text');
    expect(detectKind('123')).toBe('text');
  });

  it('should throw on empty query', () => {
    expect(() => detectKind('')).toThrow();
    expect(() => detectKind(null)).toThrow();
  });
});
