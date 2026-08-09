import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { newsite, toCloneUrl } from '../dist/commands/newsite.js';

const config = {
  domain:'billsmustbepaid.net',
  site:{name:'Bills Must Be Paid',canonicalUrl:'https://billsmustbepaid.net'},
  repository:{owner:'CoderLim',name:'bills-must-be-paid',template:'git@github.com:shipany-ai/shipany-tanstack.git'},
  hosting:{provider:'cloudflare',type:'pages',projectName:'bills-must-be-paid'},
  registrar:{provider:'namecheap'}
};

test('toCloneUrl keeps SSH and HTTPS URLs and expands owner/repo', () => {
  assert.equal(toCloneUrl('git@github.com:shipany-ai/shipany-tanstack.git'), 'git@github.com:shipany-ai/shipany-tanstack.git');
  assert.equal(toCloneUrl('https://github.com/shipany-ai/shipany-tanstack.git'), 'https://github.com/shipany-ai/shipany-tanstack.git');
  assert.equal(toCloneUrl('shipany-ai/shipany-tanstack'), 'git@github.com:shipany-ai/shipany-tanstack.git');
});

test('clones an existing remote repository when the local project is missing', async () => {
  const projectsRoot = await mkdtemp(join(tmpdir(), 'auto-launch-projects-'));
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  globalThis.fetch = async () => new Response('{}', {status:200});
  let cloneRemote;
  let published = false;

  try {
    const result = await newsite(config, {
      projectsRoot,
      clone: async (remote, destination) => {
        cloneRemote = remote;
        await mkdir(join(destination, '.git'), {recursive:true});
      },
      publish: async () => { published = true; }
    });

    assert.equal(result.localPath, join(projectsRoot, 'bills-must-be-paid'));
    assert.equal(result.status, 'exists');
    assert.equal(cloneRemote, 'git@github.com:CoderLim/bills-must-be-paid.git');
    assert.equal(published, false);
    assert.equal((await stat(join(result.localPath, '.git'))).isDirectory(), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    await rm(projectsRoot, {recursive:true,force:true});
  }
});

test('seeds a new site by cloning the source repo into a fresh GitHub repository', async () => {
  const projectsRoot = await mkdtemp(join(tmpdir(), 'auto-launch-projects-'));
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  const urls = [];
  globalThis.fetch = async (url, init) => {
    urls.push({url:String(url), method:init?.method || 'GET'});
    if (String(url).endsWith('/user')) return new Response(JSON.stringify({login:'CoderLim'}), {status:200});
    if (String(url).includes('/repos/CoderLim/bills-must-be-paid') && (!init || !init.method || init.method === 'GET')) {
      return new Response('{}', {status:404});
    }
    return new Response(JSON.stringify({html_url:'https://github.com/CoderLim/bills-must-be-paid'}), {status:201});
  };
  let cloneRemote;
  let publishOrigin;

  try {
    const result = await newsite(config, {
      projectsRoot,
      clone: async (remote, destination) => {
        cloneRemote = remote;
        await mkdir(join(destination, '.git'), {recursive:true});
      },
      publish: async (localPath, origin) => {
        publishOrigin = origin;
        assert.equal(localPath, join(projectsRoot, 'bills-must-be-paid'));
      }
    });

    assert.equal(result.status, 'created');
    assert.equal(cloneRemote, 'git@github.com:shipany-ai/shipany-tanstack.git');
    assert.equal(publishOrigin, 'git@github.com:CoderLim/bills-must-be-paid.git');
    assert.equal(urls.some(item => item.url === 'https://api.github.com/user/repos' && item.method === 'POST'), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    await rm(projectsRoot, {recursive:true,force:true});
  }
});

test('reuses an existing local Git repository without cloning it again', async () => {
  const projectsRoot = await mkdtemp(join(tmpdir(), 'auto-launch-projects-'));
  const localPath = join(projectsRoot, 'bills-must-be-paid');
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  globalThis.fetch = async () => new Response('{}', {status:200});
  execFileSync('git', ['init', localPath], {stdio:'ignore'});

  try {
    const result = await newsite(config, {
      projectsRoot,
      clone: async () => assert.fail('clone must not run for an existing Git repository'),
      publish: async () => assert.fail('publish must not run for an existing Git repository')
    });
    assert.equal(result.status, 'exists');
    assert.equal(result.localPath, localPath);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    await rm(projectsRoot, {recursive:true,force:true});
  }
});

test('rejects an existing local path that is not a Git repository', async () => {
  const projectsRoot = await mkdtemp(join(tmpdir(), 'auto-launch-projects-'));
  const localPath = join(projectsRoot, 'bills-must-be-paid');
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  globalThis.fetch = async () => new Response('{}', {status:200});
  await mkdir(join(localPath, '.git'), {recursive:true});

  try {
    await assert.rejects(
      () => newsite(config, {projectsRoot}),
      /not a Git repository/
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    await rm(projectsRoot, {recursive:true,force:true});
  }
});

test('detects a local path conflict before making GitHub changes', async () => {
  const projectsRoot = await mkdtemp(join(tmpdir(), 'auto-launch-projects-'));
  const localPath = join(projectsRoot, 'bills-must-be-paid');
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  let githubRequests = 0;
  globalThis.fetch = async () => {
    githubRequests += 1;
    return new Response('{}', {status:404});
  };
  await mkdir(localPath);

  try {
    await assert.rejects(() => newsite(config, {projectsRoot}), /not a Git repository/);
    assert.equal(githubRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    await rm(projectsRoot, {recursive:true,force:true});
  }
});
