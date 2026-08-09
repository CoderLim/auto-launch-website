#!/usr/bin/env node
import { loadConfig } from './config.js';
import { newsite } from './commands/newsite.js';
import { launch } from './commands/launch.js';
const args=process.argv.slice(2); const cmd=args[0];
const get=(name:string,def?:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:def};
async function main(){
  const config=await loadConfig(get('--config','site.config.json'));
  if(cmd==='newsite'){console.log(JSON.stringify(await newsite(config),null,2));return;}
  if(cmd==='launch'){console.log(JSON.stringify(await launch(config,{dryRun:args.includes('--dry-run')}),null,2));return;}
  if(cmd==='status'){const {StateStore}=await import('./services/state.js');console.log(JSON.stringify(await new StateStore().load(config.domain),null,2));return;}
  console.log('Usage: auto-launch-website <newsite|launch|status> [--config site.config.json] [--dry-run]'); process.exitCode=1;
}
main().catch(e=>{console.error(e instanceof Error?e.stack||e.message:e);process.exitCode=1;});
