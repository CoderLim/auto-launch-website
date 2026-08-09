import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppError } from './utils/errors.js';
import type { SiteConfig } from './types.js';
export async function loadConfig(path = 'site.config.json'): Promise<SiteConfig> {
  const raw = JSON.parse(await readFile(resolve(path), 'utf8')) as SiteConfig;
  validate(raw);
  return raw;
}
function validate(c: SiteConfig) {
  if (!c.domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.domain)) throw new AppError('Invalid domain in config', 'INVALID_CONFIG');
  if (c.site?.canonicalUrl && c.site.canonicalUrl !== `https://${c.domain}`) throw new AppError('site.canonicalUrl must match apex domain', 'INVALID_CONFIG');
  for (const key of ['owner','name'] as const) if (!c.repository?.[key]) throw new AppError(`repository.${key} is required`, 'INVALID_CONFIG');
  if (!c.hosting?.projectName) throw new AppError('hosting.projectName is required', 'INVALID_CONFIG');
}
