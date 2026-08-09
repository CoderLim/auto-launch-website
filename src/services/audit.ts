import { AppError } from '../utils/errors.js';
export async function productionAudit(domain:string){
  const checks:Array<[string,()=>Promise<boolean>]>=[
    ['https',async()=>{const r=await fetch(`https://${domain}`,{redirect:'manual'});return r.status>=200&&r.status<400;}],
    ['www-redirect',async()=>{const r=await fetch(`https://www.${domain}`,{redirect:'manual'});return [301,302,307,308].includes(r.status)&&!!r.headers.get('location')?.includes(domain);} ],
    ['sitemap',async()=>{const r=await fetch(`https://${domain}/sitemap.xml`);return r.ok;}],
    ['robots',async()=>{const r=await fetch(`https://${domain}/robots.txt`);return r.ok;}]
  ];
  const result:Record<string,boolean>={}; for(const [n,f] of checks){try{result[n]=await f();}catch{result[n]=false;}}
  if(Object.values(result).some(v=>!v)) throw new AppError(`Production audit failed: ${JSON.stringify(result)}`,'PRODUCTION_AUDIT_FAILED');
  return result;
}
