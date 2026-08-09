import { requestJson } from '../utils/http.js';
import { requiredEnv } from '../utils/errors.js';
export class GoogleProvider {
  private async token(){
    const body=new URLSearchParams({client_id:requiredEnv('GOOGLE_CLIENT_ID'),client_secret:requiredEnv('GOOGLE_CLIENT_SECRET'),refresh_token:requiredEnv('GOOGLE_REFRESH_TOKEN'),grant_type:'refresh_token'});
    return (await requestJson<{access_token:string}>('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body})).access_token;
  }
  private async auth(){return {Authorization:`Bearer ${await this.token()}`,'Content-Type':'application/json'};}
  async createGa4Property(name:string){
    const parent=requiredEnv('GA4_PARENT_ACCOUNT');
    const p=await requestJson<{name:string}>(`https://analyticsadmin.googleapis.com/v1beta/properties`,{method:'POST',headers:await this.auth(),body:JSON.stringify({parent,displayName:name,timeZone:'Europe/Amsterdam',currencyCode:'EUR'})});
    const s=await requestJson<{webStreamData?:{measurementId?:string}}>(`https://analyticsadmin.googleapis.com/v1beta/${p.name}/dataStreams`,{method:'POST',headers:await this.auth(),body:JSON.stringify({type:'WEB_DATA_STREAM',displayName:name,webStreamData:{defaultUri:`https://${name}`}})});
    const measurementId=s.webStreamData?.measurementId;
    if(!measurementId) throw new Error('GA4 data stream response did not include webStreamData.measurementId');
    return {property:p.name,measurementId};
  }
  async addSearchConsoleSite(domain:string){await requestJson(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(`sc-domain:${domain}`)}`,{method:'PUT',headers:await this.auth(),body:''},[204]);}
  async getVerificationToken(domain:string){
    const r=await requestJson<{token:string}>('https://www.googleapis.com/siteVerification/v1/token',{method:'POST',headers:await this.auth(),body:JSON.stringify({site:{type:'INET_DOMAIN',identifier:domain},verificationMethod:'DNS_TXT'})}); return r.token;
  }
  async verifyDomain(domain:string){await requestJson(`https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT`,{method:'POST',headers:await this.auth(),body:JSON.stringify({site:{type:'INET_DOMAIN',identifier:domain}})},[200]);}
  async submitSitemap(domain:string,url:string){await requestJson(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(`sc-domain:${domain}`)}/sitemaps/${encodeURIComponent(url)}`,{method:'PUT',headers:await this.auth(),body:''},[204]);}
}
