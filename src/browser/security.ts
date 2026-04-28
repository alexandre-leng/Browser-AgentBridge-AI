import { resolve, sep } from 'node:path';

const LOCAL_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const DEFAULT_PROTOCOLS = new Set(['http:', 'https:', 'about:']);

export interface RuntimeSecurity {
  bindHost: string;
  bridgeToken: string;
  adminToken: string;
  allowedOrigins: string[];
  allowFileUrls: boolean;
  allowedFileRoots: string[];
  allowExecScript: boolean;
}

export function securityFromEnv(env: NodeJS.ProcessEnv = process.env): RuntimeSecurity {
  const bindHost = env.BRIDGE_HOST ?? '127.0.0.1';
  return {
    bindHost,
    bridgeToken: env.BRIDGE_TOKEN ?? '',
    adminToken: env.BRIDGE_ADMIN_TOKEN ?? '',
    allowedOrigins: (env.BRIDGE_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    allowFileUrls: env.BRIDGE_ALLOW_FILE_URLS === '1',
    allowedFileRoots: (env.BRIDGE_ALLOWED_FILE_ROOTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    allowExecScript: env.BRIDGE_ALLOW_EXEC_SCRIPT === '1',
  };
}

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host);
}

export function requireBridgeToken(sec = securityFromEnv()): string {
  if (!isLocalHost(sec.bindHost) && !sec.bridgeToken) {
    throw new Error('BRIDGE_TOKEN is required when BRIDGE_HOST is not localhost');
  }
  return sec.bridgeToken;
}

function isInside(baseDir: string, targetPath: string): boolean {
  const base = resolve(baseDir);
  const target = resolve(targetPath);
  return target === base || target.startsWith(base + sep);
}

export function validateNavigableUrl(raw: unknown, cmd = 'navigate', sec = securityFromEnv()): string {
  if (typeof raw !== 'string' || !raw) throw new Error(`${cmd}: url must be a non-empty string`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${cmd}: invalid url '${raw}'`);
  }
  if (DEFAULT_PROTOCOLS.has(url.protocol)) return url.toString();
  if (url.protocol !== 'file:') throw new Error(`${cmd}: protocol '${url.protocol}' not allowed`);
  if (!sec.allowFileUrls) throw new Error(`${cmd}: file: URLs disabled; set BRIDGE_ALLOW_FILE_URLS=1`);
  const path = decodeURIComponent(url.pathname);
  const normalizedPath = process.platform === 'win32' && /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
  if (sec.allowedFileRoots.length === 0) {
    throw new Error(`${cmd}: file: URLs require BRIDGE_ALLOWED_FILE_ROOTS`);
  }
  if (!sec.allowedFileRoots.some((root) => isInside(root, normalizedPath))) {
    throw new Error(`${cmd}: file path is outside BRIDGE_ALLOWED_FILE_ROOTS`);
  }
  return url.toString();
}

export function assertExecAllowed(adminToken: unknown, sec = securityFromEnv()): void {
  if (!sec.allowExecScript) throw new Error('exec.script disabled: set BRIDGE_ALLOW_EXEC_SCRIPT=1');
  if (!sec.adminToken) throw new Error('exec.script disabled: set BRIDGE_ADMIN_TOKEN');
  if (adminToken !== sec.adminToken) throw new Error('exec.script: invalid admin token');
}
