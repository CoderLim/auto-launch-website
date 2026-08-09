import { requestJson } from '../utils/http.js';
import { requiredEnv } from '../utils/errors.js';
export class GitHubProvider {
  private headers() { return {Authorization:`Bearer ${requiredEnv('GITHUB_TOKEN')}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}; }
  async createFromTemplate(template: string, owner: string, name: string, isPrivate: boolean) {
    const [tOwner,tRepo] = template.split('/');
    if (!tOwner || !tRepo) throw new Error('template must be owner/repo');
    return requestJson<{html_url:string}>(`https://api.github.com/repos/${tOwner}/${tRepo}/generate`, {method:'POST',headers:this.headers(),body:JSON.stringify({owner,name,private:isPrivate,include_all_branches:false})}, [201]);
  }
  async repoExists(owner: string, name: string): Promise<boolean> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {headers:this.headers()});
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(await res.text());
    return true;
  }
}
