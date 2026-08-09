import type { SiteConfig } from '../types.js';
import { StateStore } from '../services/state.js';
import { run } from '../services/shell.js';
import { CloudflareProvider } from '../providers/cloudflare.js';
import { NamecheapProvider } from '../providers/namecheap.js';
import { GoogleProvider } from '../providers/google.js';
import { requiredEnv, AppError } from '../utils/errors.js';
import { productionAudit } from '../services/audit.js';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function launch(config:SiteConfig, opts:{dryRun?:boolean}={}){
  if(config.registrar.provider==='spaceship') throw new AppError('Spaceship registrar adapter is not implemented in MVP; use Namecheap or add an adapter.','UNSUPPORTED_PROVIDER');
  const stateStore=new StateStore(); const state=await stateStore.load(config.domain);
  const step=async(name:string,fn:()=>Promise<unknown>)=>{const completed=state.steps[name];if(completed?.ok)return completed.detail;if(opts.dryRun){console.log(`[dry-run] ${name}`);return;}const detail=await fn();await stateStore.mark(state,name,detail);return detail;};
  await step('prelaunch-audit',async()=>{await run(config.audit?.launchAuditCommand||''); await run(config.audit?.buildCommand||'npm run build'); return {ok:true};});
  const cf=new CloudflareProvider();
  const zone=await step('cloudflare-zone',()=>cf.findOrCreateZone(config.domain)) as {id:string;name_servers:string[]}|undefined;
  if(!zone && !opts.dryRun) throw new AppError('Missing Cloudflare zone result');
  await step('registrar-ns',()=>new NamecheapProvider().setNameservers(config.domain,zone!.name_servers));
  await step('cloudflare-active',async()=>{for(let i=0;i<60;i++){const z=await cf.getZone(zone!.id); if(z.status==='active') return z; await sleep(10_000);}throw new AppError('Cloudflare zone did not become active','ZONE_TIMEOUT');});
  await step('hosting-setup',async()=>{await run(config.hosting.setupCommand||'',process.cwd(),{AUTO_LAUNCH_DOMAIN:config.domain,AUTO_LAUNCH_PROJECT:config.hosting.projectName});return {ok:true};});
  await step('hosting-deploy',async()=>{if(!config.hosting.deployCommand) throw new AppError('hosting.deployCommand is required for end-to-end launch','MISSING_DEPLOY_COMMAND'); await run(config.hosting.deployCommand,process.cwd(),{AUTO_LAUNCH_DOMAIN:config.domain,AUTO_LAUNCH_PROJECT:config.hosting.projectName});return {ok:true};});
  await step('hosting-domain',async()=>{await run(config.hosting.customDomainCommand||'',process.cwd(),{AUTO_LAUNCH_DOMAIN:config.domain,AUTO_LAUNCH_PROJECT:config.hosting.projectName});return {ok:true};});
  if(config.cloudflare?.alwaysHttps!==false) await step('always-https',()=>cf.setAlwaysHttps(zone!.id,true));
  await step('www-dns',()=>cf.upsertDns(zone!.id,'CNAME',`www.${config.domain}`,config.domain,true));
  if(config.cloudflare?.redirectWwwToApex!==false) await step('www-redirect',()=>cf.ensureWwwRedirect(zone!.id,config.domain));
  if(config.email?.enabled!==false){
    await step('email-routing-enable',()=>cf.enableEmailRouting(zone!.id));
    for(const alias of config.email?.aliases||['support']){
      const address=`${alias}@${config.domain}`;
      await step(`email-${alias}`,async()=>{const destination=requiredEnv(config.email?.destinationEnv||'SUPPORT_EMAIL_DESTINATION');const rules=await cf.listEmailRules(zone!.id);if(rules.result.some(r=>r.matchers.some(m=>m.field==='to'&&m.value===address)))return {status:'exists',address};return cf.createEmailRule(zone!.id,address,destination);});
    }
  }
  const google=new GoogleProvider();
  if(config.analytics?.ga4){
    const ga=await step('ga4',()=>google.createGa4Property(config.domain)) as {measurementId:string}|undefined;
    await step('ga4-inject',async()=>{if(!config.analytics?.injectCommand) throw new AppError('analytics.injectCommand is required when analytics.ga4=true','MISSING_GA_INJECT_COMMAND');await run(config.analytics.injectCommand,process.cwd(),{AUTO_LAUNCH_DOMAIN:config.domain,AUTO_LAUNCH_GA_ID:ga!.measurementId});return {measurementId:ga!.measurementId};});
    await step('ga4-redeploy',async()=>{await run(config.hosting.deployCommand!,process.cwd(),{AUTO_LAUNCH_DOMAIN:config.domain,AUTO_LAUNCH_PROJECT:config.hosting.projectName,AUTO_LAUNCH_GA_ID:ga!.measurementId});return {ok:true};});
  }
  if(config.search?.gsc){const search=config.search;const token=await step('gsc-token',()=>google.getVerificationToken(config.domain)) as string|undefined;await step('gsc-dns',()=>cf.upsertDns(zone!.id,'TXT',config.domain,token!,false));await step('gsc-verify',()=>google.verifyDomain(config.domain));await step('gsc-property',()=>google.addSearchConsoleSite(config.domain));await step('gsc-sitemap',()=>google.submitSitemap(config.domain,`https://${config.domain}${search.sitemapPath||'/sitemap.xml'}`));}
  await step('production-audit',()=>productionAudit(config.domain));
  return state;
}
