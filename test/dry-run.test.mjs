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
