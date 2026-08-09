import { GitHubProvider } from '../providers/github.js';
import type { SiteConfig } from '../types.js';
export async function newsite(config:SiteConfig){
  const gh=new GitHubProvider();
  if(await gh.repoExists(config.repository.owner,config.repository.name)) return {status:'exists'};
  if(!config.repository.template) throw new Error('repository.template is required to create a new repository');
  return gh.createFromTemplate(config.repository.template,config.repository.owner,config.repository.name,config.repository.visibility==='private');
}
