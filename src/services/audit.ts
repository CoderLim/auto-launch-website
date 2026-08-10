import { AppError } from '../utils/errors.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile) as (
  file: string,
  args: string[],
  options: { encoding: string },
) => Promise<{ stdout: string; stderr: string }>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveA(hostname: string): Promise<string> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
  const r = await fetch(url, { headers: { accept: 'application/dns-json' } });
  if (!r.ok) throw new Error(`DoH failed for ${hostname}: ${r.status}`);
  const data = (await r.json()) as { Answer?: Array<{ type: number; data: string }> };
  const ip = data.Answer?.find((a) => a.type === 1)?.data;
  if (!ip) throw new Error(`No A record for ${hostname}`);
  return ip;
}

async function curlHead(url: string, resolveHost: string, ip: string): Promise<{ status: number; location?: string }> {
  const { stdout } = await execFileAsync(
    'curl',
    ['-sI', '--max-time', '20', '--resolve', `${resolveHost}:443:${ip}`, url],
    { encoding: 'utf8' },
  );
  const status = Number((stdout.match(/^HTTP\/\S+\s+(\d+)/m) || [])[1] || 0);
  const location = (stdout.match(/^location:\s*(.+)$/im) || [])[1]?.trim();
  return { status, location };
}

async function withRetries<T>(fn: () => Promise<T>, attempts = 12, delayMs = 20_000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw last;
}

export async function productionAudit(domain: string) {
  // Prefer DoH + curl --resolve so local fake-ip/VPN DNS cannot break checks,
  // and retry while Cloudflare edge certs finish provisioning.
  const result = await withRetries(async () => {
    const ip = await resolveA(domain);
    const wwwIp = await resolveA(`www.${domain}`).catch(() => ip);
    const https = await curlHead(`https://${domain}/`, domain, ip);
    const www = await curlHead(`https://www.${domain}/`, `www.${domain}`, wwwIp);
    const sitemap = await curlHead(`https://${domain}/sitemap.xml`, domain, ip);
    const robots = await curlHead(`https://${domain}/robots.txt`, domain, ip);
    const checks = {
      https: https.status >= 200 && https.status < 400,
      'www-redirect':
        [301, 302, 307, 308].includes(www.status) && !!www.location?.includes(domain) && !www.location?.includes(`www.${domain}`),
      sitemap: sitemap.status >= 200 && sitemap.status < 400,
      robots: robots.status >= 200 && robots.status < 400,
    };
    if (Object.values(checks).some((v) => !v)) {
      throw new Error(`audit pending: ${JSON.stringify({ ip, https, www, sitemap, robots, checks })}`);
    }
    return checks;
  });
  if (Object.values(result).some((v) => !v)) {
    throw new AppError(`Production audit failed: ${JSON.stringify(result)}`, 'PRODUCTION_AUDIT_FAILED');
  }
  return result;
}
