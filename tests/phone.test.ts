import { describe, it, expect } from 'vitest';
import { extractFrenchPhones } from '../src/browser/handlers/phone.js';

describe('extractFrenchPhones', () => {
  it('extracts a valid French mobile', () => {
    const out = extractFrenchPhones('Contact : 06 12 34 56 78 pour plus d\'infos.');
    expect(out.length).toBe(1);
    expect(out[0]).toMatch(/06/);
  });
  it('extracts international format', () => {
    const out = extractFrenchPhones('Call +33 1 42 34 56 78 anytime.');
    expect(out.length).toBe(1);
  });
  it('rejects product SKU preceded by "ref"', () => {
    const out = extractFrenchPhones('Ref: 0123456789 fiche produit');
    expect(out.length).toBe(0);
  });
  it('rejects SIRET preceded by "siret"', () => {
    const out = extractFrenchPhones('SIRET : 0612345678 autre texte');
    expect(out.length).toBe(0);
  });
  it('returns empty on empty input', () => {
    expect(extractFrenchPhones('')).toEqual([]);
  });
  it('deduplicates repeated numbers', () => {
    const t = 'Appelez 01 42 34 56 78 ou 01 42 34 56 78 merci';
    expect(extractFrenchPhones(t).length).toBe(1);
  });
});
