import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubProvider } from '../dist/providers/github.js';

test('creates a repository for the authenticated user', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  const urls = [];
  globalThis.fetch = async (url, init) => {
    urls.push({url:String(url), method:init?.method || 'GET', body:init?.body});
    if (String(url).endsWith('/user')) {
      return new Response(JSON.stringify({login:'CoderLim'}), {status:200});
    }
    return new Response(JSON.stringify({html_url:'https://github.com/CoderLim/bills-must-be-paid'}), {status:201});
  };

  try {
    await new GitHubProvider().createRepository('CoderLim', 'bills-must-be-paid', false);
    assert.equal(urls[1].url, 'https://api.github.com/user/repos');
    assert.equal(urls[1].method, 'POST');
    assert.deepEqual(JSON.parse(urls[1].body), {name:'bills-must-be-paid', private:false, auto_init:false});
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});

test('creates a repository under an organization', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).endsWith('/user')) {
      return new Response(JSON.stringify({login:'CoderLim'}), {status:200});
    }
    return new Response(JSON.stringify({html_url:'https://github.com/acme/site'}), {status:201});
  };

  try {
    await new GitHubProvider().createRepository('acme', 'site', true);
    assert.equal(urls[1], 'https://api.github.com/orgs/acme/repos');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});
