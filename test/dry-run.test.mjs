import test from 'node:test';
import assert from 'node:assert/strict';
import { launch } from '../dist/commands/launch.js';

test('dry run does not require provider secrets', async () => {
  const config = {
    domain:'example.com', site:{name:'Example',canonicalUrl:'https://example.com'},
    repository:{owner:'x',name:'y'},
    hosting:{provider:'cloudflare',type:'pages',projectName:'y',deployCommand:'echo deploy'},
    registrar:{provider:'namecheap'}, cloudflare:{alwaysHttps:true,redirectWwwToApex:true},
    email:{enabled:true,aliases:['support'],destinationEnv:'SUPPORT_EMAIL_DESTINATION'},
    analytics:{ga4:true,injectCommand:'echo ga'}, search:{gsc:true,sitemapPath:'/sitemap.xml'}
  };
  const result = await launch(config,{dryRun:true});
  assert.equal(result.domain,'example.com');
  assert.deepEqual(result.steps,{});
});

test('workers dry run includes migrate/secrets and skips www-dns', async () => {
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    await launch({
      domain:'workers.example', site:{name:'Workers Example',canonicalUrl:'https://workers.example'},
      repository:{owner:'x',name:'workers-example'},
      hosting:{provider:'cloudflare',type:'workers',projectName:'workers-example',deployCommand:'pnpm cf:deploy'},
      registrar:{provider:'spaceship'}, cloudflare:{alwaysHttps:true,redirectWwwToApex:true},
      email:{enabled:false}, analytics:{ga4:true, plausible:true}, search:{gsc:false}
    }, {dryRun:true});
  } finally {
    console.log = original;
  }
  assert.ok(logs.includes('[dry-run] hosting-migrate'));
  assert.ok(logs.includes('[dry-run] hosting-secrets'));
  assert.ok(logs.includes('[dry-run] hosting-domain'));
  assert.ok(logs.includes('[dry-run] plausible'));
  assert.ok(logs.includes('[dry-run] plausible-inject'));
  assert.ok(!logs.includes('[dry-run] www-dns'));
  assert.ok(!logs.includes('[dry-run] ga4-redeploy'));
});
