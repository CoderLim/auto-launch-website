import { requestJson } from '../utils/http.js';
import { requiredEnv } from '../utils/errors.js';
export class GitHubProvider {
  private headers() { return {Authorization:`Bearer ${requiredEnv('GITHUB_TOKEN')}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}; }
  async createRepository(owner: string, name: string, isPrivate: boolean) {
    const me = await requestJson<{login:string}>('https://api.github.com/user', {headers:this.headers()});
    const url = me.login.toLowerCase() === owner.toLowerCase()
      ? 'https://api.github.com/user/repos'
      : `https://api.github.com/orgs/${owner}/repos`;
    return requestJson<{html_url:string}>(url, {
      method:'POST',
      headers:this.headers(),
      body:JSON.stringify({name,private:isPrivate,auto_init:false})
    }, [201]);
  }
  async repoExists(owner: string, name: string): Promise<boolean> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {headers:this.headers()});
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(await res.text());
    return true;
  }
}
