import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/version';

describe('Bridge', () => {
  it('version is 3.2.0', () => {
    expect(VERSION).toBe('3.2.0');
  });
});
