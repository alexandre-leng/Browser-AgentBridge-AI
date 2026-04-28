import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface TraceEvent {
  id: number;
  ts: string;
  sessionId: string;
  command: string;
  ok: boolean;
  durationMs: number;
  payload?: unknown;
  resultSummary?: unknown;
  error?: string;
}

function traceDir() {
  return join(process.cwd(), 'logs', 'traces');
}

function summarize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const v = value as Record<string, unknown>;
  return {
    url: v.url,
    title: v.title,
    imageUrl: v.imageUrl,
    path: v.path,
    count: Array.isArray(v.elements) ? v.elements.length : undefined,
    keys: Object.keys(v).slice(0, 20),
  };
}

class TraceRecorder {
  private events = new Map<string, TraceEvent[]>();
  private nextId = 1;

  record(input: Omit<TraceEvent, 'id' | 'ts' | 'resultSummary'> & { result?: unknown }) {
    const event: TraceEvent = {
      id: this.nextId++,
      ts: new Date().toISOString(),
      sessionId: input.sessionId,
      command: input.command,
      ok: input.ok,
      durationMs: input.durationMs,
      payload: input.payload,
      resultSummary: summarize(input.result),
      error: input.error,
    };
    const list = this.events.get(event.sessionId) ?? [];
    list.push(event);
    this.events.set(event.sessionId, list.slice(-500));
  }

  list(sessionId = 'default') {
    return this.events.get(sessionId) ?? [];
  }

  async save(sessionId = 'default') {
    const dir = traceDir();
    await mkdir(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `trace-${ts}-session-${sessionId}.json`;
    const path = join(dir, filename);
    await writeFile(path, JSON.stringify({ sessionId, events: this.list(sessionId) }, null, 2), 'utf8');
    return { path, count: this.list(sessionId).length };
  }

  async artifacts() {
    const dir = traceDir();
    const files = await readdir(dir).catch(() => []);
    return files.filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
  }

  async read(path: string) {
    return JSON.parse(await readFile(path, 'utf8')) as { sessionId: string; events: TraceEvent[] };
  }
}

export const traces = new TraceRecorder();
