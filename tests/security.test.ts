import { describe, it, expect } from 'vitest';
import { assertExecAllowed, requireBridgeToken, validateNavigableUrl } from '../src/browser/security.js';

describe('security defaults', () => {
  it('requires a bridge token outside localhost', () => {
    expect(() => requireBridgeToken({
      bindHost: '0.0.0.0',
      bridgeToken: '',
      adminToken: '',
      allowedOrigins: [],
      allowFileUrls: false,
      allowedFileRoots: [],
      allowExecScript: false,
    })).toThrow(/BRIDGE_TOKEN/);
  });

  it('allows empty bridge token on localhost', () => {
    expect(requireBridgeToken({
      bindHost: '127.0.0.1',
      bridgeToken: '',
      adminToken: '',
      allowedOrigins: [],
      allowFileUrls: false,
      allowedFileRoots: [],
      allowExecScript: false,
    })).toBe('');
  });

  it('allows file urls only inside configured roots', () => {
    const sec = {
      bindHost: '127.0.0.1',
      bridgeToken: '',
      adminToken: '',
      allowedOrigins: [],
      allowFileUrls: true,
      allowedFileRoots: [process.cwd()],
      allowExecScript: false,
    };
    const url = new URL(`file:///${process.cwd().replace(/\\/g, '/')}/README.md`).toString();
    expect(validateNavigableUrl(url, 'test', sec)).toMatch(/^file:/);
  });

  it('requires explicit exec enablement and token', () => {
    expect(() => assertExecAllowed('x', {
      bindHost: '127.0.0.1',
      bridgeToken: '',
      adminToken: 'x',
      allowedOrigins: [],
      allowFileUrls: false,
      allowedFileRoots: [],
      allowExecScript: false,
    })).toThrow(/disabled/);
  });
});
