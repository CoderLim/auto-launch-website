import type { SiteConfig } from '../types.js';
import { StateStore } from '../services/state.js';
import { run } from '../services/shell.js';
import { CloudflareProvider } from '../providers/cloudflare.js';
import { NamecheapProvider } from '../providers/namecheap.js';
import { SpaceshipProvider } from '../providers/spaceship.js';
import { GoogleProvider } from '../providers/google.js';
import { provisionPlausibleSite } from '../providers/plausible.js';
import { requiredEnv, AppError } from '../utils/errors.js';
import { productionAudit } from '../services/audit.js';
import { printManualFollowUps } from '../services/followups.js';
import {
  prepareWorkersHosting,
  ensureWorkerSecrets,
  applyD1Migrations,
  upsertGa4Config,
  upsertPlausibleConfig,
} from '../services/workers.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveProjectDir(config: SiteConfig) {
  const candidate = join(homedir(), 'Projects', config.repository.name);
  try {
    await stat(candidate);
    return candidate;
  } catch {
    return process.cwd();
  }
}

export async function launch(config: SiteConfig, opts: { dryRun?: boolean } = {}) {
  const projectDir = await resolveProjectDir(config);
  const isWorkers = config.hosting.type === 'workers';
  const stateStore = new StateStore();
  const state = await stateStore.load(config.domain);
  const step = async (name: string, fn: () => Promise<unknown>) => {
    const completed = state.steps[name];
    if (completed?.ok) return completed.detail;
    if (opts.dryRun) {
      console.log(`[dry-run] ${name}`);
      return;
    }
    const detail = await fn();
    await stateStore.mark(state, name, detail);
    return detail;
  };
  const siteEnv = {
    AUTO_LAUNCH_DOMAIN: config.domain,
    AUTO_LAUNCH_PROJECT: config.hosting.projectName,
  };

  await step('prelaunch-audit', async () => {
    await run(config.audit?.launchAuditCommand || '', projectDir);
    await run(config.audit?.buildCommand || 'pnpm build', projectDir);
    return { ok: true };
  });

  const cf = new CloudflareProvider();
  const zone = (await step('cloudflare-zone', () => cf.findOrCreateZone(config.domain))) as
    | { id: string; name_servers: string[] }
    | undefined;
  if (!zone && !opts.dryRun) throw new AppError('Missing Cloudflare zone result');

  await step('registrar-ns', () =>
    config.registrar.provider === 'spaceship'
      ? new SpaceshipProvider().setNameservers(config.domain, zone!.name_servers)
      : new NamecheapProvider().setNameservers(config.domain, zone!.name_servers),
  );

  await step('cloudflare-active', async () => {
    for (let i = 0; i < 60; i++) {
      const z = await cf.getZone(zone!.id);
      if (z.status === 'active') return z;
      await sleep(10_000);
    }
    throw new AppError('Cloudflare zone did not become active', 'ZONE_TIMEOUT');
  });

  const workersMeta = (await step('hosting-setup', async () => {
    if (isWorkers) {
      const prepared = await prepareWorkersHosting({
        projectDir,
        workerName: config.hosting.projectName,
        siteName: config.site.name,
        domain: config.domain,
        cf,
      });
      await run(config.hosting.setupCommand || '', projectDir, siteEnv);
      return prepared;
    }
    await run(config.hosting.setupCommand || '', projectDir, siteEnv);
    return { ok: true };
  })) as { databaseName?: string; workerName?: string } | undefined;

  if (isWorkers) {
    await step('hosting-migrate', () =>
      applyD1Migrations(projectDir, workersMeta?.databaseName || `${config.hosting.projectName}-db`),
    );
  }

  await step('hosting-deploy', async () => {
    if (!config.hosting.deployCommand) {
      throw new AppError('hosting.deployCommand is required for end-to-end launch', 'MISSING_DEPLOY_COMMAND');
    }
    await run(config.hosting.deployCommand, projectDir, siteEnv);
    return { ok: true };
  });

  // Secrets require the Worker to exist; set after first deploy and keep stable across retries.
  if (isWorkers) {
    await step('hosting-secrets', () => ensureWorkerSecrets(projectDir));
  }

  await step('hosting-domain', async () => {
    if (isWorkers) {
      return cf.ensureWorkerCustomDomains(
        config.domain,
        zone!.id,
        workersMeta?.workerName || config.hosting.projectName,
      );
    }
    await run(config.hosting.customDomainCommand || '', projectDir, siteEnv);
    return { ok: true };
  });

  if (config.cloudflare?.alwaysHttps !== false) {
    await step('always-https', () => cf.setAlwaysHttps(zone!.id, true));
  }

  if (config.cloudflare?.crawlerHints !== false) {
    await step('crawler-hints', () => cf.setZoneSetting(zone!.id, 'crawler_hints', true));
  }

  // Workers custom domains manage apex/www DNS; Pages still needs an explicit www CNAME.
  if (!isWorkers) {
    await step('www-dns', () => cf.upsertDns(zone!.id, 'CNAME', `www.${config.domain}`, config.domain, true));
  }

  if (config.cloudflare?.redirectWwwToApex !== false) {
    await step('www-redirect', () => cf.ensureWwwRedirect(zone!.id, config.domain));
  }

  if (config.email?.enabled !== false) {
    await step('email-routing-enable', () => cf.enableEmailRouting(zone!.id));
    for (const alias of config.email?.aliases || ['support']) {
      const address = `${alias}@${config.domain}`;
      await step(`email-${alias}`, async () => {
        const destination = requiredEnv(config.email?.destinationEnv || 'SUPPORT_EMAIL_DESTINATION');
        const rules = await cf.listEmailRules(zone!.id);
        if (rules.result.some((r) => r.matchers.some((m) => m.field === 'to' && m.value === address))) {
          return { status: 'exists', address };
        }
        return cf.createEmailRule(zone!.id, address, destination);
      });
    }
  }

  const google = new GoogleProvider();
  if (config.analytics?.ga4) {
    const ga = (await step('ga4', () => google.createGa4Property(config.domain))) as
      | { measurementId: string }
      | undefined;
    await step('ga4-inject', async () => {
      if (config.analytics?.injectCommand) {
        await run(config.analytics.injectCommand, projectDir, {
          ...siteEnv,
          AUTO_LAUNCH_GA_ID: ga!.measurementId,
        });
      }
      if (isWorkers) {
        await upsertGa4Config(
          projectDir,
          workersMeta?.databaseName || `${config.hosting.projectName}-db`,
          ga!.measurementId,
        );
      } else if (!config.analytics?.injectCommand) {
        throw new AppError(
          'analytics.injectCommand is required when analytics.ga4=true for non-workers hosting',
          'MISSING_GA_INJECT_COMMAND',
        );
      }
      return { measurementId: ga!.measurementId };
    });
    // Only redeploy when injection may bake the ID into the build artifact.
    if (!isWorkers) {
      await step('ga4-redeploy', async () => {
        await run(config.hosting.deployCommand!, projectDir, {
          ...siteEnv,
          AUTO_LAUNCH_GA_ID: ga!.measurementId,
        });
        return { ok: true };
      });
    }
  }

  if (config.analytics?.plausible) {
    const plausible = (await step('plausible', () => provisionPlausibleSite(config.domain))) as
      | { domain: string; scriptSrc: string; trackerId: string | null; mode: 'sites-api' | 'legacy' }
      | undefined;
    await step('plausible-inject', async () => {
      if (isWorkers) {
        await upsertPlausibleConfig(
          projectDir,
          workersMeta?.databaseName || `${config.hosting.projectName}-db`,
          plausible!.domain,
          plausible!.scriptSrc,
        );
      }
      return plausible;
    });
  }

  if (config.search?.gsc) {
    const search = config.search;
    const token = (await step('gsc-token', () => google.getVerificationToken(config.domain))) as string | undefined;
    await step('gsc-dns', () => cf.upsertDns(zone!.id, 'TXT', config.domain, token!, false));
    await step('gsc-verify', () => google.verifyDomain(config.domain));
    await step('gsc-property', () => google.addSearchConsoleSite(config.domain));
    await step('gsc-sitemap', () =>
      google.submitSitemap(config.domain, `https://${config.domain}${search.sitemapPath || '/sitemap.xml'}`),
    );
  }

  await step('production-audit', () => productionAudit(config.domain));
  if (!opts.dryRun) printManualFollowUps(config, state);
  return state;
}
