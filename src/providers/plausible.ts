import { requestJson } from '../utils/http.js';
import { AppError, requiredEnv } from '../utils/errors.js';

type PlausibleSite = {
  domain: string;
  tracker_script_configuration?: { id?: string };
};

export type PlausibleSiteResult = {
  domain: string;
  scriptSrc: string;
  trackerId: string | null;
};

/** Shared script URL for self-hosted / custom Plausible (legacy mode). */
export function defaultPlausibleScriptSrc(): string {
  const explicit = process.env.PLAUSIBLE_SCRIPT_SRC?.trim();
  if (explicit) return explicit;
  const base = process.env.PLAUSIBLE_API_BASE?.trim().replace(/\/$/, '');
  if (base) return `${base}/js/script.js`;
  return 'https://plausible.io/js/script.js';
}

export function plausibleDashboardUrl(): string {
  const dashboard = process.env.PLAUSIBLE_DASHBOARD_URL?.trim().replace(/\/$/, '');
  if (dashboard) return dashboard;
  const base = process.env.PLAUSIBLE_API_BASE?.trim().replace(/\/$/, '');
  if (base && !base.includes('plausible.io')) return base;
  return 'https://plausible.io';
}

/** Sites API — create/reuse a site and resolve its tracker script URL. */
export class PlausibleProvider {
  private base() {
    return (process.env.PLAUSIBLE_API_BASE || 'https://plausible.io').replace(/\/$/, '');
  }

  private headers() {
    return {
      Authorization: `Bearer ${requiredEnv('PLAUSIBLE_API_TOKEN')}`,
      'Content-Type': 'application/json',
    };
  }

  private toResult(site: PlausibleSite, fallbackDomain: string): PlausibleSiteResult {
    const domain = site.domain || fallbackDomain;
    const trackerId = site.tracker_script_configuration?.id?.trim() || null;
    const scriptSrc = trackerId ? `${this.base()}/js/${trackerId}.js` : defaultPlausibleScriptSrc();
    return { domain, scriptSrc, trackerId };
  }

  /** Idempotent: GET existing site or POST a new one (Sites API). Requires PLAUSIBLE_API_TOKEN. */
  async findOrCreateSite(domain: string): Promise<PlausibleSiteResult> {
    const base = this.base();
    const headers = this.headers();
    const getRes = await fetch(`${base}/api/v1/sites/${encodeURIComponent(domain)}`, { headers });
    if (getRes.ok) {
      return this.toResult((await getRes.json()) as PlausibleSite, domain);
    }
    if (getRes.status !== 404) {
      const text = await getRes.text();
      throw new AppError(`HTTP ${getRes.status} ${base}/api/v1/sites/${domain}: ${text.slice(0, 1000)}`, 'HTTP_ERROR');
    }

    const body: Record<string, unknown> = {
      domain,
      timezone: process.env.PLAUSIBLE_TIMEZONE || 'Asia/Shanghai',
      tracker_script_configuration: {
        outbound_links: true,
        file_downloads: true,
        form_submissions: true,
      },
    };
    if (process.env.PLAUSIBLE_TEAM_ID) body.team_id = process.env.PLAUSIBLE_TEAM_ID;

    const created = await requestJson<PlausibleSite>(`${base}/api/v1/sites`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return this.toResult(created, domain);
  }
}

/** Sites API when token is set; otherwise inject domain + shared script (self-hosted or cloud). */
export async function provisionPlausibleSite(domain: string): Promise<PlausibleSiteResult & { mode: 'sites-api' | 'legacy' }> {
  if (!process.env.PLAUSIBLE_API_TOKEN?.trim()) {
    return {
      domain,
      scriptSrc: defaultPlausibleScriptSrc(),
      trackerId: null,
      mode: 'legacy',
    };
  }
  const site = await new PlausibleProvider().findOrCreateSite(domain);
  return { ...site, mode: 'sites-api' };
}
