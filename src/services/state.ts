import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LaunchState } from '../types.js';
export class StateStore {
  constructor(private readonly directory = '.auto-launch-state', private readonly legacyPath = '.auto-launch-state.json') {}
  private normalizeDomain(domain: string) { return domain.toLowerCase(); }
  private path(domain: string) { return join(this.directory, `${this.normalizeDomain(domain)}.json`); }
  async load(domain: string): Promise<LaunchState> {
    const normalized=this.normalizeDomain(domain);
    try { const s = JSON.parse(await readFile(this.path(normalized), 'utf8')) as LaunchState; return this.normalizeDomain(s.domain) === normalized ? {...s,domain:normalized} : this.empty(normalized); }
    catch {
      try { const legacy = JSON.parse(await readFile(this.legacyPath, 'utf8')) as LaunchState; return this.normalizeDomain(legacy.domain) === normalized ? {...legacy,domain:normalized} : this.empty(normalized); }
      catch { return this.empty(normalized); }
    }
  }
  async mark(state: LaunchState, step: string, detail?: unknown) {
    state.domain=this.normalizeDomain(state.domain);
    state.steps[step] = { ok: true, at: new Date().toISOString(), detail };
    await mkdir(this.directory,{recursive:true});
    await writeFile(this.path(state.domain), JSON.stringify(state, null, 2));
  }
  private empty(domain: string): LaunchState { return { version: 1, domain, steps: {} }; }
}
