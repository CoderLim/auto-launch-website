import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppError } from './utils/errors.js';
import type { SiteConfig } from './types.js';
type RawSiteConfig = Omit<SiteConfig,'repository'> & { repository?: Partial<SiteConfig['repository']> };
export async function loadConfig(path = 'site.config.json'): Promise<SiteConfig> {
  const raw = JSON.parse(await readFile(resolve(path), 'utf8')) as RawSiteConfig;
  const repository=raw.repository ?? {};
  const name=repository.name || raw.site?.name
    ?.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const config={...raw,repository:{...repository,name,template:repository.template || 'git@github.com:shipany-ai/shipany-tanstack.git'}} as SiteConfig;
  validate(config);
  return config;
}
function validate(c: SiteConfig) {
  if (!c.domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.domain)) throw new AppError('Invalid domain in config', 'INVALID_CONFIG');
  if (c.site?.canonicalUrl && c.site.canonicalUrl !== `https://${c.domain}`) throw new AppError('site.canonicalUrl must match apex domain', 'INVALID_CONFIG');
  for (const key of ['owner','name'] as const) if (!c.repository?.[key]) throw new AppError(`repository.${key} is required`, 'INVALID_CONFIG');
  if(!/^[a-z0-9._-]+$/i.test(c.repository.name) || c.repository.name==='.' || c.repository.name==='..') throw new AppError('repository.name must be a single GitHub-compatible repository name','INVALID_CONFIG');
  if (!c.hosting?.projectName) throw new AppError('hosting.projectName is required', 'INVALID_CONFIG');
  if(c.analytics?.plausible && c.hosting.type!=='workers') throw new AppError('Plausible automation requires Workers hosting with D1','INVALID_CONFIG');
}
