import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleProvider } from '../dist/providers/google.js';

test('GA4 returns webStreamData.measurementId from created data stream', async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = {...process.env};
  process.env.GOOGLE_CLIENT_ID='client';
  process.env.GOOGLE_CLIENT_SECRET='secret';
  process.env.GOOGLE_REFRESH_TOKEN='refresh';
  process.env.GA4_PARENT_ACCOUNT='accounts/123';
  let dataStreamBody;
  globalThis.fetch = async (url, init={}) => {
    const u=String(url);
    if(u.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({access_token:'token'}),{status:200});
    if(u.endsWith('/v1beta/properties')) return new Response(JSON.stringify({name:'properties/456'}),{status:200});
    if(u.endsWith('/v1beta/properties/456/dataStreams')) {
      dataStreamBody=JSON.parse(init.body);
      return new Response(JSON.stringify({webStreamData:{measurementId:'G-TEST123',defaultUri:'https://example.com'}}),{status:200});
    }
    throw new Error(`unexpected URL: ${u}`);
  };
  try {
    const result=await new GoogleProvider().createGa4Property('example.com');
    assert.equal(result.measurementId,'G-TEST123');
    assert.equal(dataStreamBody.webStreamData.defaultUri,'https://example.com');
  } finally {
    globalThis.fetch=oldFetch;
    for(const k of Object.keys(process.env)) if(!(k in oldEnv)) delete process.env[k];
    Object.assign(process.env,oldEnv);
  }
});
