import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadScriptCommands, mapCommand, parseArgs } from '../src/cli/bridge.js';
import { installForTarget, parseInstallArgs } from '../src/cli/install.js';

describe('parseArgs', () => {
  it('splits on spaces', () => {
    expect(parseArgs('click login')).toEqual(['click', 'login']);
  });
  it('keeps double-quoted groups', () => {
    expect(parseArgs('type "hello world"')).toEqual(['type', 'hello world']);
  });
  it('keeps single-quoted groups', () => {
    expect(parseArgs("type 'hello world'")).toEqual(['type', 'hello world']);
  });
  it('handles escaped quotes', () => {
    expect(parseArgs('type \\"quoted\\"')).toEqual(['type', '"quoted"']);
  });
  it('handles backslash escapes', () => {
    expect(parseArgs('echo a\\ b')).toEqual(['echo', 'a b']);
  });
  it('throws on unterminated quote', () => {
    expect(() => parseArgs('type "oops')).toThrow(/unterminated/);
  });
  it('collapses multiple spaces', () => {
    expect(parseArgs('a    b')).toEqual(['a', 'b']);
  });
  it('returns empty for empty input', () => {
    expect(parseArgs('')).toEqual([]);
  });
});

describe('mapCommand', () => {
  it('maps comma separated visible-text filter alternatives', () => {
    expect(mapCommand('visible-text', ['--filter-any=Formation,IA,Marseille', '--filter-lines']).payload).toMatchObject({
      filterAny: ['Formation', 'IA', 'Marseille'],
      filterLines: true,
    });
  });

  it('defaults click-text to a bounded timeout', () => {
    expect(mapCommand('click-text', ['Rechercher dans cette zone']).payload).toMatchObject({
      text: 'Rechercher dans cette zone',
      timeoutMs: 15000,
    });
  });

  it('maps extract listings', () => {
    expect(mapCommand('extract', ['listings'])).toMatchObject({
      type: 'dom.extract',
      payload: { type: 'listings' },
    });
  });

  it('maps marketplace extraction options', () => {
    expect(mapCommand('extract', ['marketplace', '--limit=10', '--format=csv'])).toMatchObject({
      type: 'dom.extract',
      payload: { type: 'marketplace', limit: 10, format: 'csv' },
    });
  });

  it('maps scrape shorthand', () => {
    expect(mapCommand('scrape', ['--limit=10'])).toMatchObject({
      type: 'scrape.results',
      payload: { type: 'marketplace', limit: 10 },
    });
  });

  it('maps authenticated site search shorthand', () => {
    expect(mapCommand('site-search', ['contrat', 'fournisseur', '--field=Recherche'])).toMatchObject({
      type: 'form.search',
      payload: { query: 'contrat fournisseur', field: 'Recherche' },
    });
  });

  it('maps web search with pagination options', () => {
    expect(mapCommand('web-search', ['chats', 'asiatique', '--limit=20', '--engine=google', '--pages=3', '--organic'])).toMatchObject({
      type: 'web.search',
      payload: { query: 'chats asiatique', limit: 20, engine: 'google', pages: 3, organicOnly: true },
    });
  });

  it('loads json script files into bridge commands', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openclaw-script-'));
    const file = join(dir, 'script.json');
    writeFileSync(file, JSON.stringify({
      steps: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'annotate' },
        { type: 'click', ref: 3 },
      ],
    }));
    try {
      expect(loadScriptCommands(file)).toMatchObject([
        { type: 'navigate', payload: { url: 'https://example.com' } },
        { type: 'page.annotate' },
        { type: 'agent.click', payload: { ref: 3 } },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('install adapters', () => {
  it('parses install targets and options', () => {
    expect(parseInstallArgs(['openclaw', '--global', '--force']).target).toBe('openclaw');
    expect(parseInstallArgs(['hermes', '--workspace', '/tmp/project']).options.workspace).toBe('/tmp/project');
  });

  it('plans openclaw and hermes skill files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openclaw-install-'));
    try {
      const openclaw = installForTarget('openclaw', { workspace: dir, dryRun: true });
      const hermes = installForTarget('hermes', { workspace: dir, dryRun: true });
      expect(openclaw.skillDir).toContain(join('skills', 'openclaw-browser-bridge'));
      expect(hermes.skillDir).toContain(join('.hermes', 'skills', 'openclaw-browser-bridge'));
      expect(openclaw.files.map(file => file.endsWith('SKILL.md'))).toContain(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
