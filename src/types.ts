export type Visibility = 'public' | 'private';
export type RegistrarProvider = 'namecheap' | 'spaceship';
export interface SiteConfig {
  domain: string;
  site: { name: string; canonicalUrl?: string };
  repository: { owner: string; name: string; visibility?: Visibility; template?: string };
  hosting: { provider: 'cloudflare'; type: 'pages' | 'workers'; projectName: string; productionBranch?: string; setupCommand?: string; deployCommand?: string; customDomainCommand?: string };
  registrar: { provider: RegistrarProvider };
  cloudflare?: { alwaysHttps?: boolean; redirectWwwToApex?: boolean; crawlerHints?: boolean };
  email?: { enabled?: boolean; aliases?: string[]; destinationEnv?: string };
  analytics?: { ga4?: boolean; plausible?: boolean; injectCommand?: string };
  search?: { gsc?: boolean; sitemapPath?: string };
  audit?: { buildCommand?: string; launchAuditCommand?: string };
}
export interface LaunchState {
  version: 1;
  domain: string;
  steps: Record<string, { ok: boolean; at: string; detail?: unknown }>;
}
