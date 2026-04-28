import type { Page } from 'playwright';

type FieldType = 'string' | 'number' | 'boolean' | 'url' | 'array';

interface FieldSchema {
  type?: FieldType;
  selector?: string;
  attribute?: string;
  multiple?: boolean;
  required?: boolean;
}

export interface ExtractionSchema {
  fields: Record<string, FieldSchema | string>;
}

export async function extractWithSchema(page: Page, schema: ExtractionSchema) {
  if (!schema || typeof schema !== 'object' || !schema.fields || typeof schema.fields !== 'object') {
    throw new Error('dom.extract: schema.fields is required');
  }
  const fieldsJson = JSON.stringify(schema.fields).replace(/</g, '\\u003c');
  return page.evaluate(`(() => {
    const fields = ${fieldsJson};
    const read = (rawSpec) => {
      const spec = typeof rawSpec === 'string' ? { selector: rawSpec } : rawSpec;
      const selector = spec.selector;
      if (!selector || typeof selector !== 'string') throw new Error('schema field selector must be a string');
      const nodes = Array.from(document.querySelectorAll(selector));
      const values = nodes.map((el) => {
        if (spec.attribute) return el.getAttribute(spec.attribute) ?? '';
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value;
        return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      });
      const selected = spec.multiple || spec.type === 'array' ? values : values[0];
      const localCoerce = (value, type = 'string') => {
        if (type === 'array') return Array.isArray(value) ? value : value === undefined ? [] : [value];
        if (type === 'boolean') return Boolean(value);
        if (type === 'number') {
          const n = Number(String(value ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
          return Number.isFinite(n) ? n : null;
        }
        if (type === 'url' && typeof value === 'string') {
          try { return new URL(value, location.href).toString(); } catch { return value; }
        }
        return typeof value === 'string' ? value.trim() : value ?? '';
      };
      return localCoerce(selected, spec.type ?? 'string');
    };
    const out = {};
    const missing = [];
    for (const [name, spec] of Object.entries(fields)) {
      out[name] = read(spec);
      const s = typeof spec === 'string' ? { selector: spec } : spec;
      if (s.required && (out[name] === '' || out[name] === undefined || out[name] === null || (Array.isArray(out[name]) && out[name].length === 0))) {
        missing.push(name);
      }
    }
    return { data: out, missing };
  })()`);
}

export function buildJsonSchemaPrompt(schema: ExtractionSchema, text: string) {
  return [
    'Extract the requested fields from the page text as strict JSON.',
    'Return only JSON with keys from schema.fields.',
    `Schema: ${JSON.stringify(schema)}`,
    `Page text:\n${text.slice(0, 12000)}`,
  ].join('\n\n');
}
