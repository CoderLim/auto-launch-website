import type { LaunchState, SiteConfig } from '../types.js';

export type ManualFollowUp = {
  id: string;
  title: string;
  url: string;
  steps: string[];
};

export function collectManualFollowUps(config: SiteConfig, state: LaunchState): ManualFollowUp[] {
  const items: ManualFollowUp[] = [];

  if (config.analytics?.plausible) {
    const plausible = state.steps['plausible-inject']?.detail as
      | { mode?: 'sites-api' | 'legacy'; domain?: string }
      | undefined;
    const legacy = !process.env.PLAUSIBLE_API_TOKEN?.trim() || plausible?.mode === 'legacy';
    if (legacy) {
      items.push({
        id: 'plausible-site',
        title: 'Plausible — add site in dashboard',
        url: 'https://plausible.io',
        steps: [
          `Sign in and add a site with domain: ${config.domain}`,
          'Use the exact domain (no https://) — must match plausible_domain in your site config / D1',
          'After adding, open the live site and confirm pageviews appear in Plausible within a few minutes',
        ],
      });
    }
  }

  return items;
}

export function formatManualFollowUps(items: ManualFollowUp[]): string {
  if (!items.length) return '';
  const lines = [
    '',
    '══════════════════════════════════════════════════════════════',
    '  Manual follow-ups (launch automation cannot complete these)',
    '══════════════════════════════════════════════════════════════',
  ];
  for (const item of items) {
    lines.push('', `▸ ${item.title}`, `  ${item.url}`);
    for (const step of item.steps) lines.push(`  • ${step}`);
  }
  lines.push('', '══════════════════════════════════════════════════════════════', '');
  return lines.join('\n');
}

export function printManualFollowUps(config: SiteConfig, state: LaunchState) {
  const text = formatManualFollowUps(collectManualFollowUps(config, state));
  if (text) console.log(text);
}
