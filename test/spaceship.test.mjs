import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceshipProvider } from '../dist/providers/spaceship.js';

test('updates Spaceship nameservers via the public API', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SPACESHIP_API_KEY;
  const originalSecret = process.env.SPACESHIP_API_SECRET;
  process.env.SPACESHIP_API_KEY = 'test-key';
  process.env.SPACESHIP_API_SECRET = 'test-secret';
  let request;

  globalThis.fetch = async (url, init) => {
    request = {url:String(url), method:init?.method, headers:init?.headers, body:init?.body};
    return new Response('{}', {status:200});
  };

  try {
    await new SpaceshipProvider().setNameservers('thechoicervoicer.online', ['ns1.cloudflare.com', 'ns2.cloudflare.com']);
    assert.equal(request.url, 'https://spaceship.dev/api/v1/domains/thechoicervoicer.online/nameservers');
    assert.equal(request.method, 'PUT');
    assert.equal(request.headers['X-API-Key'], 'test-key');
    assert.equal(request.headers['X-API-Secret'], 'test-secret');
    assert.deepEqual(JSON.parse(request.body), {provider:'custom', hosts:['ns1.cloudflare.com','ns2.cloudflare.com']});
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SPACESHIP_API_KEY;
    else process.env.SPACESHIP_API_KEY = originalKey;
    if (originalSecret === undefined) delete process.env.SPACESHIP_API_SECRET;
    else process.env.SPACESHIP_API_SECRET = originalSecret;
  }
});
