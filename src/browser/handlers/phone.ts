import { findPhoneNumbersInText } from 'libphonenumber-js';

const EXCLUDE_CONTEXT = /\b(ref|reference|référence|code|sku|ean|upc|siret|siren|tva)\b\s*[:#]?\s*$/i;

export function extractFrenchPhones(text: string): string[] {
  if (!text) return [];
  const hits = findPhoneNumbersInText(text, 'FR');
  const out: string[] = [];
  for (const h of hits) {
    if (!h.number.isValid()) continue;
    const before = text.slice(Math.max(0, h.startsAt - 40), h.startsAt);
    if (EXCLUDE_CONTEXT.test(before)) continue;
    out.push(h.number.formatNational());
  }
  return Array.from(new Set(out));
}
