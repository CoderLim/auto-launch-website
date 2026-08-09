import { GitHubProvider } from '../providers/github.js';
import type { SiteConfig } from '../types.js';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { AppError } from '../utils/errors.js';

type CloneRepository = (remote: string, destination: string) => Promise<void>;
type NewsiteOptions = { projectsRoot?: string; clone?: CloneRepository };

const cloneRepository: CloneRepository = (remote, destination) => new Promise((resolve, reject) => {
  const child = spawn('git', ['clone', '--', remote, destination], {shell:false,stdio:'inherit'});
  child.on('exit', code => code === 0 ? resolve() : reject(new AppError(`git clone failed with exit code ${code}`, 'COMMAND_FAILED')));
  child.on('error', reject);
});

async function exists(path: string) {
  try { await stat(path); return true; }
  catch (error) {
    if ((error as {code?:string}).code === 'ENOENT') return false;
    throw error;
  }
}

async function validateLocalGitRepository(path: string) {
  const topLevel=await new Promise<string>((resolveTopLevel,reject) => {
    execFile('git',['-C',path,'rev-parse','--show-toplevel'],{encoding:'utf8'},(error,stdout) => {
      if(error) reject(new AppError(`Local path exists but is not a Git repository: ${path}`,'LOCAL_PATH_CONFLICT'));
      else resolveTopLevel(stdout.trim());
    });
  });
  if(await realpath(topLevel)!==await realpath(path)) throw new AppError(`Local path is inside a different Git repository: ${path}`,'LOCAL_PATH_CONFLICT');
}

export async function newsite(config:SiteConfig, options:NewsiteOptions={}){
  const projectsRoot=options.projectsRoot ?? join(homedir(),'Projects');
  const localPath=join(projectsRoot,config.repository.name);
  await mkdir(projectsRoot,{recursive:true});
  const localExists=await exists(localPath);
  if(localExists) await validateLocalGitRepository(localPath);

  const gh=new GitHubProvider();
  const remoteExists=await gh.repoExists(config.repository.owner,config.repository.name);
  if(!remoteExists){
    if(!config.repository.template) throw new Error('repository.template is required to create a new repository');
    await gh.createFromTemplate(config.repository.template,config.repository.owner,config.repository.name,config.repository.visibility==='private');
  }
  if(!localExists) {
    await (options.clone ?? cloneRepository)(`git@github.com:${config.repository.owner}/${config.repository.name}.git`,localPath);
  }
  return {status:remoteExists?'exists':'created',localPath};
}
