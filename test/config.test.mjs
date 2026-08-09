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

test('defaults repository template and name from the site name', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auto-launch-'));
  const path = join(dir, 'site.config.json');
  await writeFile(path, JSON.stringify({
    domain:'billsmustbepaid.net',
    site:{name:'Bills Must Be Paid',canonicalUrl:'https://billsmustbepaid.net'},
    repository:{owner:'x'},
    hosting:{provider:'cloudflare',type:'pages',projectName:'bills-must-be-paid'},
    registrar:{provider:'namecheap'}
  }));

  const config = await loadConfig(path);

  assert.equal(config.repository.name, 'bills-must-be-paid');
  assert.equal(config.repository.template, 'git@github.com:shipany-ai/shipany-tanstack.git');
  await rm(dir,{recursive:true,force:true});
});

test('rejects mismatched canonical URL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auto-launch-'));
  const path = join(dir, 'site.config.json');
  await writeFile(path, JSON.stringify({domain:'example.com',site:{name:'Example',canonicalUrl:'https://www.example.com'},repository:{owner:'x',name:'y'},hosting:{provider:'cloudflare',type:'pages',projectName:'y'},registrar:{provider:'namecheap'}}));
  await assert.rejects(() => loadConfig(path), /canonicalUrl/);
  await rm(dir,{recursive:true,force:true});
});

test('rejects a repository name that can escape the projects directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auto-launch-'));
  const path = join(dir, 'site.config.json');
  await writeFile(path, JSON.stringify({domain:'example.com',site:{name:'Example'},repository:{owner:'x',name:'../outside'},hosting:{provider:'cloudflare',type:'pages',projectName:'example'},registrar:{provider:'namecheap'}}));
  await assert.rejects(() => loadConfig(path), /repository.name/);
  await rm(dir,{recursive:true,force:true});
});
