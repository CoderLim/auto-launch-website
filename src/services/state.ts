import { readFile, writeFile } from 'node:fs/promises';
import type { LaunchState } from '../types.js';
export class StateStore {
  constructor(private readonly path = '.auto-launch-state.json') {}
  async load(domain: string): Promise<LaunchState> {
    try { const s = JSON.parse(await readFile(this.path, 'utf8')) as LaunchState; return s.domain === domain ? s : this.empty(domain); }
    catch { return this.empty(domain); }
  }
  async mark(state: LaunchState, step: string, detail?: unknown) {
    state.steps[step] = { ok: true, at: new Date().toISOString(), detail };
    await writeFile(this.path, JSON.stringify(state, null, 2));
  }
  private empty(domain: string): LaunchState { return { version: 1, domain, steps: {} }; }
}
