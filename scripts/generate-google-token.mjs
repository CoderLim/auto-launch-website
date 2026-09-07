#!/usr/bin/env node
/**
 * Generate GOOGLE_REFRESH_TOKEN for auto-launch-website.
 * Requires redirect URI http://localhost:8765/callback on the OAuth web client.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envPath = join(root, '.env');
const port = 8765;
const redirectUri = `http://localhost:${port}/callback`;
const scopes = [
  'https://www.googleapis.com/auth/analytics.edit',
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/siteverification',
];

function loadEnv() {
  const text = readFileSync(envPath, 'utf8');
  const get = (key) => text.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();
  const clientId = get('GOOGLE_CLIENT_ID');
  const clientSecret = get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
    process.exit(1);
  }
  return { clientId, clientSecret, text };
}

function upsertEnv(text, key, value) {
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, 'm').test(text)) {
    return text.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  }
  return `${text.trimEnd()}\n${line}\n`;
}

const { clientId, clientSecret, text: envText } = loadEnv();
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', scopes.join(' '));
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('Visit this URL in your browser to authorize:\n');
console.log(authUrl.toString());
console.log(`\nWaiting for callback on ${redirectUri} ...`);

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith('/callback')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const url = new URL(req.url, redirectUri);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Authorization failed: ${error || 'missing code'}`);
    server.close();
    process.exit(1);
  }

  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = await tokenRes.json();
    if (!tokenRes.ok || !payload.refresh_token) {
      throw new Error(JSON.stringify(payload));
    }

    const nextEnv = upsertEnv(envText, 'GOOGLE_REFRESH_TOKEN', payload.refresh_token);
    writeFileSync(envPath, nextEnv, 'utf8');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Success</h1><p>GOOGLE_REFRESH_TOKEN updated. You can close this tab.</p>');
    console.log('\nGOOGLE_REFRESH_TOKEN updated in .env');
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(e));
    server.close();
    process.exit(1);
  }
});

server.listen(port);

setTimeout(() => {
  console.error('Timed out waiting for authorization callback (5 minutes).');
  server.close();
  process.exit(1);
}, 5 * 60 * 1000);
