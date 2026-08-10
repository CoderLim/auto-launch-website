import test from 'node:test';
import assert from 'node:assert/strict';
import { PlausibleProvider } from '../dist/providers/plausible.js';

test('Plausible findOrCreateSite reuses an existing site', async () => {
  const originalFetch = globalThis.fetch;
  process.env.PLAUSIBLE_API_TOKEN = 'plausible-token';
  delete process.env.PLAUSIBLE_API_BASE;

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/api/v1/sites/example.com') && (init.method || 'GET') === 'GET') {
      return new Response(
        JSON.stringify({
          domain: 'example.com',
          tracker_script_configuration: { id: 'pa-test123' },
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${u}`);
  };

  try {
    const result = await new PlausibleProvider().findOrCreateSite('example.com');
    assert.equal(result.domain, 'example.com');
    assert.equal(result.trackerId, 'pa-test123');
    assert.equal(result.scriptSrc, 'https://plausible.io/js/pa-test123.js');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.PLAUSIBLE_API_TOKEN;
  }
});

test('Plausible findOrCreateSite creates a site when missing', async () => {
  const originalFetch = globalThis.fetch;
  process.env.PLAUSIBLE_API_TOKEN = 'plausible-token';
  process.env.PLAUSIBLE_TEAM_ID = 'team-1';
  let postBody;

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/api/v1/sites/new.example') && (init.method || 'GET') === 'GET') {
      return new Response('not found', { status: 404 });
    }
    if (u.endsWith('/api/v1/sites') && init.method === 'POST') {
      postBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          domain: 'new.example',
          tracker_script_configuration: { id: 'pa-new456' },
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${u}`);
  };

  try {
    const result = await new PlausibleProvider().findOrCreateSite('new.example');
    assert.equal(result.scriptSrc, 'https://plausible.io/js/pa-new456.js');
    assert.equal(postBody.domain, 'new.example');
    assert.equal(postBody.team_id, 'team-1');
    assert.equal(postBody.tracker_script_configuration.form_submissions, true);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.PLAUSIBLE_API_TOKEN;
    delete process.env.PLAUSIBLE_TEAM_ID;
  }
});

test('provisionPlausibleSite falls back to legacy script without API token', async () => {
  delete process.env.PLAUSIBLE_API_TOKEN;
  process.env.PLAUSIBLE_SCRIPT_SRC = 'https://app.pageview.app/js/script.js';
  delete process.env.PLAUSIBLE_API_BASE;
  const { provisionPlausibleSite } = await import('../dist/providers/plausible.js');
  const result = await provisionPlausibleSite('example.com');
  assert.equal(result.mode, 'legacy');
  assert.equal(result.domain, 'example.com');
  assert.equal(result.scriptSrc, 'https://app.pageview.app/js/script.js');
  assert.equal(result.trackerId, null);
  delete process.env.PLAUSIBLE_SCRIPT_SRC;
});

test('defaultPlausibleScriptSrc derives from PLAUSIBLE_API_BASE', async () => {
  delete process.env.PLAUSIBLE_SCRIPT_SRC;
  delete process.env.PLAUSIBLE_API_TOKEN;
  process.env.PLAUSIBLE_API_BASE = 'https://analytics.example.com';
  const { defaultPlausibleScriptSrc } = await import('../dist/providers/plausible.js');
  assert.equal(defaultPlausibleScriptSrc(), 'https://analytics.example.com/js/script.js');
  delete process.env.PLAUSIBLE_API_BASE;
});
