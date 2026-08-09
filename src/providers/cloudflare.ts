import { requestJson } from '../utils/http.js';
import { requiredEnv } from '../utils/errors.js';
type CF<T> = {success:boolean;result:T;errors?:unknown[]};
export class CloudflareProvider {
  private base='https://api.cloudflare.com/client/v4';
  private headers(){return {Authorization:`Bearer ${requiredEnv('CLOUDFLARE_API_TOKEN')}`,'Content-Type':'application/json'};}
  async findOrCreateZone(domain:string){
    const q=await requestJson<CF<Array<{id:string;name:string;status:string;name_servers:string[]}>>(`${this.base}/zones?name=${encodeURIComponent(domain)}`,{headers:this.headers()});
    if(q.result[0]) return q.result[0];
    const r=await requestJson<CF<{id:string;name:string;status:string;name_servers:string[]}>>(`${this.base}/zones`,{method:'POST',headers:this.headers(),body:JSON.stringify({name:domain,account:{id:requiredEnv('CLOUDFLARE_ACCOUNT_ID')},jump_start:false,type:'full'})});
    return r.result;
  }
  async getZone(zoneId:string){return (await requestJson<CF<{id:string;status:string;name_servers:string[]}>>(`${this.base}/zones/${zoneId}`,{headers:this.headers()})).result;}
  async setAlwaysHttps(zoneId:string, enabled:boolean){return requestJson(`${this.base}/zones/${zoneId}/settings/always_use_https`,{method:'PATCH',headers:this.headers(),body:JSON.stringify({value:enabled?'on':'off'})});}
  async upsertDns(zoneId:string, type:string, name:string, content:string, proxied=false){
    const q=await requestJson<CF<Array<{id:string}>>(`${this.base}/zones/${zoneId}/dns_records?type=${type}&name=${encodeURIComponent(name)}`,{headers:this.headers()});
    const body=JSON.stringify({type,name,content,ttl:1,proxied});
    if(q.result[0]) return requestJson(`${this.base}/zones/${zoneId}/dns_records/${q.result[0].id}`,{method:'PUT',headers:this.headers(),body});
    return requestJson(`${this.base}/zones/${zoneId}/dns_records`,{method:'POST',headers:this.headers(),body});
  }
  async ensureWwwRedirect(zoneId:string, domain:string){
    const phase='http_request_dynamic_redirect';
    const entry=await requestJson<CF<{id:string;rules?:Array<{id:string;description?:string}>}>>(`${this.base}/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`,{headers:this.headers()},[200,404]);
    const rule={action:'redirect',description:'auto-launch: www to apex',enabled:true,expression:`(http.host eq \"www.${domain}\")`,action_parameters:{from_value:{status_code:301,target_url:{expression:`concat(\"https://${domain}\", http.request.uri.path)`},preserve_query_string:true}}};
    if(!entry.result?.id){return requestJson(`${this.base}/zones/${zoneId}/rulesets`,{method:'POST',headers:this.headers(),body:JSON.stringify({name:'auto-launch redirects',kind:'zone',phase,rules:[rule]})});}
    const existing=entry.result.rules?.find(x=>x.description==='auto-launch: www to apex');
    if(existing) return requestJson(`${this.base}/zones/${zoneId}/rulesets/${entry.result.id}/rules/${existing.id}`,{method:'PATCH',headers:this.headers(),body:JSON.stringify(rule)});
    return requestJson(`${this.base}/zones/${zoneId}/rulesets/${entry.result.id}/rules`,{method:'POST',headers:this.headers(),body:JSON.stringify(rule)});
  }
  async enableEmailRouting(zoneId:string){return requestJson(`${this.base}/zones/${zoneId}/email/routing/dns`,{method:'POST',headers:this.headers(),body:JSON.stringify({name:'@'})},[200]);}
  async listEmailRules(zoneId:string){return requestJson<CF<Array<{id:string;name?:string;matchers:Array<{field:string;value:string}>}>>>(`${this.base}/zones/${zoneId}/email/routing/rules`,{headers:this.headers()});}
  async createEmailRule(zoneId:string, alias:string, destination:string){return requestJson(`${this.base}/zones/${zoneId}/email/routing/rules`,{method:'POST',headers:this.headers(),body:JSON.stringify({name:`auto-launch ${alias}`,enabled:true,matchers:[{type:'literal',field:'to',value:alias}],actions:[{type:'forward',value:[destination]}]})});}
}
