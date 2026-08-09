import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubProvider } from '../dist/providers/github.js';

test('accepts an SSH URL for the template repository', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = String(url);
    return new Response(JSON.stringify({html_url:'https://github.com/CoderLim/bills-must-be-paid'}), {status:201});
  };

  try {
    await new GitHubProvider().createFromTemplate(
      'git@github.com:shipany-ai/shipany-tanstack.git',
      'CoderLim',
      'bills-must-be-paid',
      false
    );
    assert.equal(requestUrl, 'https://api.github.com/repos/shipany-ai/shipany-tanstack/generate');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});
