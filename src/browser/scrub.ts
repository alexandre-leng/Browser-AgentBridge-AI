const SENSITIVE_KEYS = new Set([
  'token',
  'adminToken',
  'admin_token',
  'password',
  'pass',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'cookies',
]);

const REDACTED = '[redacted]';

const SENSITIVE_COMMANDS = new Set(['agent.type', 'dom.fill', 'input.fill', 'input.type']);

export function scrubPayload(value: unknown, command?: string): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubPayload(v, command));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = REDACTED;
      continue;
    }
    if (k === 'text' && command && SENSITIVE_COMMANDS.has(command)) {
      out[k] = REDACTED;
      continue;
    }
    out[k] = scrubPayload(v, command);
  }
  return out;
}
