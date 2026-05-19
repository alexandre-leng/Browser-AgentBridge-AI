import { resolve as resolvePath } from 'node:path';
import type { Page } from 'playwright';
import type { HandlerContext, Handler } from './types.js';
import { resolveVisible } from '../resolver.js';
import { humanPause, humanType } from '../human.js';
import { assertNoAntiBot } from '../polite.js';

type FormValue = string | number | boolean | string[];

interface FillField {
  query?: string;
  selector?: string;
  label?: string;
  name?: string;
  value: FormValue;
}

function normalizeKey(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function formSnapshot(page: Page) {
  return page.evaluate(() => {
    const isVisible = (el: Element) => {
      const style = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const cssPath = (el: Element) => {
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && cur.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        const tag = cur.tagName.toLowerCase();
        const id = (cur as HTMLElement).id;
        if (id) {
          parts.unshift(`${tag}#${CSS.escape(id)}`);
          break;
        }
        const parent: Element | null = cur.parentElement;
        if (!parent) {
          parts.unshift(tag);
          break;
        }
        const siblings = Array.from(parent.children as HTMLCollectionOf<Element>).filter((x: Element) => x.tagName === cur!.tagName);
        const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(cur) + 1})` : '';
        parts.unshift(`${tag}${nth}`);
        cur = parent;
      }
      return parts.join(' > ');
    };
    const labelFor = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
      const explicit = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '';
      const wrapped = el.closest('label')?.textContent;
      const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
      const nearby = el.closest('[role="group"], .form-group, .field, .control, div, p')?.querySelector('label, legend, [class*="label"], [class*="Label"]')?.textContent;
      return [explicit, wrapped, aria, nearby].find((x) => x && x.trim())?.replace(/\s+/g, ' ').trim() || '';
    };
    const controls = Array.from(document.querySelectorAll('input, textarea, select, button')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>;
    return {
      url: location.href,
      title: document.title,
      forms: Array.from(document.forms).map((form, formIndex) => ({
        formIndex,
        selector: cssPath(form),
        name: form.getAttribute('name') || form.id || '',
        action: form.action || '',
        method: (form.method || 'get').toUpperCase(),
        fieldCount: form.querySelectorAll('input, textarea, select').length,
      })),
      fields: controls.map((el, index) => {
        const input = el as HTMLInputElement;
        const optionText = el instanceof HTMLSelectElement
          ? Array.from(el.options).map((option) => ({ value: option.value, text: option.textContent?.trim() || '', selected: option.selected }))
          : [];
        const r = el.getBoundingClientRect();
        const form = el.closest('form');
        return {
          index,
          selector: cssPath(el),
          formIndex: form ? Array.from(document.forms).indexOf(form) : -1,
          tag: el.tagName.toLowerCase(),
          type: input.type || el.tagName.toLowerCase(),
          name: input.name || el.id || '',
          id: el.id || '',
          label: labelFor(el as any),
          placeholder: input.placeholder || '',
          autocomplete: input.autocomplete || '',
          role: el.getAttribute('role') || '',
          value: 'value' in el ? String((el as any).value ?? '') : '',
          checked: 'checked' in input ? input.checked : undefined,
          required: 'required' in input ? input.required : false,
          disabled: 'disabled' in input ? input.disabled : false,
          visible: isVisible(el),
          options: optionText,
          box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      }),
    };
  });
}

function scoreField(field: any, wanted: string) {
  const haystack = [
    field.label,
    field.name,
    field.id,
    field.placeholder,
    field.autocomplete,
    field.role,
    field.type,
  ].map(normalizeKey).filter(Boolean);
  const exact = haystack.some((part) => part === wanted);
  if (exact) return 100;
  const contains = haystack.some((part) => part.includes(wanted) || wanted.includes(part));
  if (contains) return 70;
  return wanted.split(' ').filter((token) => token.length > 1 && haystack.some((part) => part.includes(token))).length * 12;
}

async function resolveFormField(page: Page, field: FillField) {
  const direct = field.query ?? field.selector;
  if (direct) return resolveVisible(page, direct);
  const wanted = normalizeKey(field.label ?? field.name);
  if (!wanted) throw new Error('form.fill: each field needs query, selector, label, or name');
  const snapshot = await formSnapshot(page);
  const candidates = snapshot.fields
    .filter((item: any) => item.visible && !item.disabled && !['button', 'submit', 'reset', 'image', 'hidden'].includes(item.type))
    .map((item: any) => ({ item, score: scoreField(item, wanted) }))
    .filter((item: any) => item.score > 0)
    .sort((a: any, b: any) => b.score - a.score);
  const best = candidates[0]?.item;
  if (!best) throw new Error(`form.fill: no visible field matched "${field.label ?? field.name}"`);
  return page.locator(best.selector).first();
}

async function setFieldValue(page: Page, field: FillField, clearFirst: boolean) {
  const loc = await resolveFormField(page, field);
  const value = field.value;
  const info = await loc.evaluate((el: Element) => ({
    tag: el.tagName.toLowerCase(),
    type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
  }));

  if (info.tag === 'select') {
    const selected = await loc.selectOption(Array.isArray(value) ? value.map(String) : String(value));
    return { action: 'select', selected };
  }
  if (info.type === 'checkbox') {
    await loc.setChecked(Boolean(value));
    return { action: 'check', checked: Boolean(value) };
  }
  if (info.type === 'radio') {
    if (typeof value === 'boolean') await loc.setChecked(value);
    else await page.locator(`input[type="radio"][value="${String(value).replace(/"/g, '\\"')}"]`).first().setChecked(true);
    return { action: 'radio' };
  }
  if (info.type === 'file') {
    const files = Array.isArray(value) ? value : [String(value)];
    await loc.setInputFiles(files.map((file) => resolvePath(file)));
    return { action: 'files', count: files.length };
  }

  await loc.click();
  if (clearFirst) {
    await loc.fill('').catch(async () => {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await page.keyboard.press('Backspace');
    });
  }
  await humanType(page, String(value ?? ''));
  return { action: 'type', typed: String(value ?? '').length };
}

async function submitForm(page: Page, query?: string, timeout = 15000) {
  const wait = page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
  if (query) {
    const loc = await resolveVisible(page, query);
    await loc.click();
  } else {
    const clicked = await page.evaluate(() => {
      const submit = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).find((el: any) => {
        const text = `${el.innerText || el.value || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
        return !el.disabled && /(search|rechercher|submit|envoyer|valider|go|ok|find)/i.test(text);
      }) as HTMLElement | undefined;
      submit?.click();
      return Boolean(submit);
    });
    if (!clicked) await page.keyboard.press('Enter');
  }
  await wait;
}

export function formHandlers(ctx: HandlerContext): Record<string, Handler> {
  return {
    'form.inspect': async () => {
      const page = await ctx.p();
      await assertNoAntiBot(page);
      return { type: 'forms', ...(await formSnapshot(page)) };
    },

    'form.fill': async ({ fields, values, clearFirst = true }: any) => {
      const page = await ctx.p();
      const normalized: FillField[] = Array.isArray(fields)
        ? fields
        : Object.entries(values ?? {}).map(([name, value]) => ({ name, value: value as FormValue }));
      if (!normalized.length) throw new Error('form.fill: provide fields[] or values{}');
      const results = [];
      for (const field of normalized) {
        results.push({ field: field.label ?? field.name ?? field.query ?? field.selector, ...(await setFieldValue(page, field, Boolean(clearFirst))) });
        await humanPause(80, 220);
      }
      return { filled: results.length, results };
    },

    'form.submit': async ({ query, selector, timeout = 15000 }: any = {}) => {
      const page = await ctx.p();
      await submitForm(page, query ?? selector, timeout);
      await assertNoAntiBot(page);
      return { ok: true, url: page.url(), title: await page.title().catch(() => '') };
    },

    'form.search': async ({ query, field, submit, timeout = 15000 }: any) => {
      if (!query || typeof query !== 'string') throw new Error('form.search: query is required');
      const page = await ctx.p();
      const snapshot = await formSnapshot(page);
      const wanted = normalizeKey(field ?? 'search recherche q query keywords mot cle');
      const candidates = snapshot.fields
        .filter((item: any) => item.visible && !item.disabled && ['search', 'text', 'url', 'email', 'textarea'].includes(item.type))
        .map((item: any) => ({ item, score: Math.max(scoreField(item, wanted), scoreField(item, 'search'), scoreField(item, 'recherche'), scoreField(item, 'q')) }))
        .sort((a: any, b: any) => b.score - a.score);
      const target = candidates[0]?.item;
      if (!target) throw new Error('form.search: no visible search field found');
      await setFieldValue(page, { selector: `css=${target.selector}`, value: query }, true);
      await submitForm(page, submit, timeout);
      await assertNoAntiBot(page);
      return { ok: true, field: target, url: page.url(), title: await page.title().catch(() => '') };
    },
  };
}
