#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { newsite } from './commands/newsite.js';
import { launch } from './commands/launch.js';

function loadDotEnv(path = '.env') {
  const file = resolve(path);
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

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
