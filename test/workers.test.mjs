import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializeWranglerConfig, ensureProductionEnv } from '../dist/services/workers.js';

test('materializeWranglerConfig fills D1 id, account, and production URL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alw-wrangler-'));
  const siteName = 'ACME "AI" \\ $& $1';
  await writeFile(
    join(dir, 'wrangler.example.jsonc'),
    `{
  "name": "shipany-tanstack",
  "vars": {
    "VITE_APP_URL": "https://example.workers.dev",
    "VITE_APP_NAME": "My App"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "shipany-db",
      "database_id": "REPLACE_WITH_OUTPUT_OF_WRANGLER_D1_CREATE"
    }
  ],
  "routes": [{ "pattern": "old.example/*", "zone_name": "old.example" }]
}
`,
  );
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-123';
  await materializeWranglerConfig({
    projectDir: dir,
    workerName: 'demo-site',
    siteName,
    domain: 'demo.example',
    databaseName: 'demo-site-db',
    databaseId: 'db-uuid-1',
  });
  await materializeWranglerConfig({
    projectDir: dir,
    workerName: 'demo-site',
    siteName,
    domain: 'demo.example',
    databaseName: 'demo-site-db',
    databaseId: 'db-uuid-1',
  });
  const text = await readFile(join(dir, 'wrangler.jsonc'), 'utf8');
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(text); }, 'generated wrangler.jsonc must stay parseable');
  assert.match(text, /"name": "demo-site"/);
  assert.match(text, /"account_id": "acct-123"/);
  assert.match(text, /"database_name": "demo-site-db"/);
  assert.match(text, /"database_id": "db-uuid-1"/);
  assert.match(text, /"VITE_APP_URL": "https:\/\/demo\.example"/);
  assert.equal(parsed.vars.VITE_APP_NAME, siteName);
  assert.doesNotMatch(text, /"routes"/);
});

test('ensureProductionEnv upserts VITE_APP_URL and VITE_APP_NAME', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alw-env-'));
  await writeFile(join(dir, '.env.production'), 'VITE_APP_URL=http://localhost:3000\nFOO=bar\n');
  await ensureProductionEnv(dir, 'demo.example', 'Demo Site');
  const text = await readFile(join(dir, '.env.production'), 'utf8');
  assert.match(text, /^VITE_APP_URL=https:\/\/demo\.example$/m);
  assert.match(text, /^VITE_APP_NAME=Demo Site$/m);
  assert.match(text, /^FOO=bar$/m);
});

test('CloudflareProvider clears only address records before custom domains', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method || 'GET', body: init.body });
    if (url.includes('/dns_records?name=')) {
      return new Response(
        JSON.stringify({
          success: true,
          result: [
            { id: '1', type: 'AAAA', name: 'demo.example', content: '100::' },
            { id: '2', type: 'TXT', name: 'demo.example', content: 'keep' },
            { id: '3', type: 'MX', name: 'demo.example', content: 'mx' },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes('/dns_records/1') && (init.method || 'GET') === 'DELETE') {
      return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
    }
    if (url.includes('/workers/domains') && (init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
    }
    if (url.includes('/workers/domains') && init.method === 'PUT') {
      return new Response(
        JSON.stringify({
          success: true,
          result: { id: 'd1', hostname: 'demo.example', service: 'demo-site' },
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  process.env.CLOUDFLARE_API_TOKEN = 'tok';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
  const { CloudflareProvider } = await import('../dist/providers/cloudflare.js');
  const cf = new CloudflareProvider();
  const cleared = await cf.clearAddressRecords('zone1', 'demo.example');
  assert.deepEqual(cleared.deleted, ['AAAA:demo.example']);
  const attached = await cf.attachWorkerDomain('demo.example', 'zone1', 'demo-site');
  assert.equal(attached.hostname, 'demo.example');
  assert.ok(calls.some((c) => c.method === 'DELETE'));
  assert.ok(calls.some((c) => c.method === 'PUT' && String(c.url).includes('/workers/domains')));
  globalThis.fetch = original;
});
