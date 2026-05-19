import { describe, it, expect } from 'vitest';
import { buildJsonSchemaPrompt } from '../src/browser/schemaExtract.js';

describe('schema extraction prompt', () => {
  it('builds a strict JSON prompt from schema and page text', () => {
    const prompt = buildJsonSchemaPrompt({ fields: { title: { selector: 'h1' } } }, 'Hello');
    expect(prompt).toContain('Return only JSON');
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('Hello');
  });
});
