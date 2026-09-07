import type { LaunchState, SiteConfig } from '../types.js';
import { plausibleDashboardUrl } from '../providers/plausible.js';

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
        url: plausibleDashboardUrl(),
        steps: [
          `Sign in and add a site with domain: ${config.domain}`,
          'Use the exact domain (no https://) — launch already set data-domain via plausible_domain in D1',
          'After adding, open the live site and confirm pageviews appear within a few minutes',
        ],
      });
    }
  }

  if (config.payments?.enabled) {
    items.push({
      id: 'payment-provider',
      title: 'Payment — configure provider + smoke checkout',
      url: `https://${config.domain}/admin`,
      steps: [
        'Launch does not seed payment keys — Admin → Settings → Payment (or D1 config) must enable a provider',
        'Required for Waffo: waffo_enabled, default_payment_provider=waffo, merchant/store/private key, product_ids_mapping',
        'Confirm https://<domain>/api/config/public shows the provider enabled',
        'Exhaust free quota (or set D1 usage to the daily cap), open checkout, and verify redirect to the provider — not "No payment provider configured"',
        'Register webhook https://<domain>/api/payment/notify/<provider> at the merchant dashboard',
        'Checklist: .claude/skills/launch-site/payment.md in auto-launch-website',
      ],
    });
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
