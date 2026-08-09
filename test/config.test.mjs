import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../dist/config.js';

test('loads a valid site config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auto-launch-'));
  const path = join(dir, 'site.config.json');
  await writeFile(path, JSON.stringify({domain:'example.com',site:{name:'Example',canonicalUrl:'https://example.com'},repository:{owner:'x',name:'y'},hosting:{provider:'cloudflare',type:'pages',projectName:'y'},registrar:{provider:'namecheap'}}));
  const config = await loadConfig(path);
  assert.equal(config.domain, 'example.com');
  await rm(dir,{recursive:true,force:true});
});

test('rejects mismatched canonical URL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auto-launch-'));
  const path = join(dir, 'site.config.json');
  await writeFile(path, JSON.stringify({domain:'example.com',site:{name:'Example',canonicalUrl:'https://www.example.com'},repository:{owner:'x',name:'y'},hosting:{provider:'cloudflare',type:'pages',projectName:'y'},registrar:{provider:'namecheap'}}));
  await assert.rejects(() => loadConfig(path), /canonicalUrl/);
  await rm(dir,{recursive:true,force:true});
});
