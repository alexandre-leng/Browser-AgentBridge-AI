export type Primitive = 'string' | 'number' | 'boolean';
export type FieldSpec =
  | { type: Primitive; required?: boolean; min?: number; max?: number; enum?: readonly string[] }
  | { type: 'object'; required?: boolean }
  | { type: 'array'; required?: boolean; min?: number };

export interface Schema {
  [field: string]: FieldSpec;
}

export function validate(payload: unknown, schema: Schema, cmd: string): void {
  if (payload === null || typeof payload !== 'object') {
    throw new Error(`${cmd}: payload must be an object`);
  }
  const p = payload as Record<string, unknown>;
  for (const [field, spec] of Object.entries(schema)) {
    const v = p[field];
    if (v === undefined || v === null) {
      if (spec.required) throw new Error(`${cmd}: field '${field}' is required`);
      continue;
    }
    if (spec.type === 'array') {
      if (!Array.isArray(v)) throw new Error(`${cmd}: field '${field}' must be an array`);
      if ('min' in spec && spec.min !== undefined && v.length < spec.min) {
        throw new Error(`${cmd}: field '${field}' must have at least ${spec.min} item(s)`);
      }
    } else if (spec.type === 'object') {
      if (typeof v !== 'object' || Array.isArray(v)) {
        throw new Error(`${cmd}: field '${field}' must be an object`);
      }
    } else if (spec.type === 'string') {
      if (typeof v !== 'string') throw new Error(`${cmd}: field '${field}' must be a string`);
      if ('min' in spec && spec.min !== undefined && v.length < spec.min) {
        throw new Error(`${cmd}: field '${field}' must have length >= ${spec.min}`);
      }
      if ('max' in spec && spec.max !== undefined && v.length > spec.max) {
        throw new Error(`${cmd}: field '${field}' must have length <= ${spec.max}`);
      }
      if (spec.enum && !spec.enum.includes(v)) {
        throw new Error(`${cmd}: field '${field}' must be one of: ${spec.enum.join(', ')}`);
      }
    } else if (spec.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`${cmd}: field '${field}' must be a finite number`);
      }
      if ('min' in spec && spec.min !== undefined && v < spec.min) {
        throw new Error(`${cmd}: field '${field}' must be >= ${spec.min}`);
      }
      if ('max' in spec && spec.max !== undefined && v > spec.max) {
        throw new Error(`${cmd}: field '${field}' must be <= ${spec.max}`);
      }
    } else if (spec.type === 'boolean') {
      if (typeof v !== 'boolean') throw new Error(`${cmd}: field '${field}' must be a boolean`);
    }
  }
}

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'about:', 'file:']);

export function validateUrl(raw: unknown, cmd = 'navigate'): string {
  if (typeof raw !== 'string' || !raw) throw new Error(`${cmd}: url must be a non-empty string`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${cmd}: invalid url '${raw}'`);
  }
  if (!SAFE_URL_PROTOCOLS.has(url.protocol)) {
    throw new Error(`${cmd}: protocol '${url.protocol}' not allowed`);
  }
  return url.toString();
}
