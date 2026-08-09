import { GitHubProvider } from '../providers/github.js';
import type { SiteConfig } from '../types.js';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { AppError } from '../utils/errors.js';

type CloneRepository = (remote: string, destination: string) => Promise<void>;
type PublishRepository = (localPath: string, origin: string) => Promise<void>;
type NewsiteOptions = { projectsRoot?: string; clone?: CloneRepository; publish?: PublishRepository };

const cloneRepository: CloneRepository = (remote, destination) => new Promise((resolve, reject) => {
  const child = spawn('git', ['clone', '--', remote, destination], {shell:false,stdio:'inherit'});
  child.on('exit', code => code === 0 ? resolve() : reject(new AppError(`git clone failed with exit code ${code}`, 'COMMAND_FAILED')));
  child.on('error', reject);
});

const publishRepository: PublishRepository = (localPath, origin) => new Promise((resolve, reject) => {
  execFile('git', ['-C', localPath, 'remote', 'set-url', 'origin', origin], {encoding:'utf8'}, (setUrlError: Error|null) => {
    if (setUrlError) return reject(setUrlError);
    const child = spawn('git', ['-C', localPath, 'push', '-u', 'origin', 'HEAD'], {shell:false,stdio:'inherit'});
    child.on('exit', code => code === 0 ? resolve() : reject(new AppError(`git push failed with exit code ${code}`, 'COMMAND_FAILED')));
    child.on('error', reject);
  });
});

export function toCloneUrl(source: string) {
  if (/^(git@|https?:\/\/)/.test(source)) return source;
  return `git@github.com:${source.replace(/\.git$/, '')}.git`;
}

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
  const origin=`git@github.com:${config.repository.owner}/${config.repository.name}.git`;
  await mkdir(projectsRoot,{recursive:true});
  const localExists=await exists(localPath);
  if(localExists) await validateLocalGitRepository(localPath);

  const gh=new GitHubProvider();
  const remoteExisted=await gh.repoExists(config.repository.owner,config.repository.name);
  if(!remoteExisted){
    if(!config.repository.template) throw new Error('repository.template is required to create a new repository');
    await gh.createRepository(config.repository.owner,config.repository.name,config.repository.visibility==='private');
  }
  if(!localExists) {
    const clone = options.clone ?? cloneRepository;
    const publish = options.publish ?? publishRepository;
    if(remoteExisted) {
      await clone(origin, localPath);
    } else {
      await clone(toCloneUrl(config.repository.template!), localPath);
      await publish(localPath, origin);
    }
  }
  return {status:remoteExisted?'exists':'created',localPath};
}
