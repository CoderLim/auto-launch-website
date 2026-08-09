import { requiredEnv } from '../utils/errors.js';
import { AppError } from '../utils/errors.js';
export class NamecheapProvider {
  async setNameservers(domain:string, nameservers:string[]){
    const parts=domain.split('.'); if(parts.length<2) throw new AppError('Invalid domain');
    const tld=parts.pop()!; const sld=parts.join('.');
    const p=new URLSearchParams({ApiUser:requiredEnv('NAMECHEAP_API_USER'),ApiKey:requiredEnv('NAMECHEAP_API_KEY'),UserName:requiredEnv('NAMECHEAP_USERNAME'),ClientIp:requiredEnv('NAMECHEAP_CLIENT_IP'),Command:'namecheap.domains.dns.setCustom',SLD:sld,TLD:tld,Nameservers:nameservers.join(',')});
    const r=await fetch(`https://api.namecheap.com/xml.response?${p}`); const text=await r.text();
    if(!r.ok || /Status="ERROR"/i.test(text) || /<Error /i.test(text)) throw new AppError(`Namecheap setCustom failed: ${text.slice(0,1200)}`,'NAMECHEAP_ERROR');
  }
}
