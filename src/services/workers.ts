import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CloudflareProvider } from '../providers/cloudflare.js';
import { requiredEnv } from '../utils/errors.js';
import { run, runWithStdin, runCapture } from './shell.js';

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function replaceJsoncField(text: string, key: string, value: string) {
  const re = new RegExp(`("${key}"\\s*:\\s*")([^"]*)(")`);
  if (re.test(text)) return text.replace(re, `$1${value}$3`);
  return text;
}

export async function materializeWranglerConfig(opts: {
  projectDir: string;
  workerName: string;
  siteName: string;
  domain: string;
  databaseName: string;
  databaseId: string;
}) {
  const target = join(opts.projectDir, 'wrangler.jsonc');
  const example = join(opts.projectDir, 'wrangler.example.jsonc');
  if (!(await exists(target))) {
    if (!(await exists(example))) throw new Error('wrangler.example.jsonc not found');
    await writeFile(target, await readFile(example, 'utf8'));
  }
  let text = await readFile(target, 'utf8');
  text = replaceJsoncField(text, 'name', opts.workerName);
  text = replaceJsoncField(text, 'database_name', opts.databaseName);
  text = replaceJsoncField(text, 'database_id', opts.databaseId);
  text = replaceJsoncField(text, 'VITE_APP_URL', `https://${opts.domain}`);
  text = replaceJsoncField(text, 'VITE_APP_NAME', opts.siteName);
  if (!/"account_id"\s*:/.test(text)) {
    text = text.replace(
      /"name"\s*:\s*"[^"]*"/,
      (m) => `${m},\n  "account_id": "${requiredEnv('CLOUDFLARE_ACCOUNT_ID')}"`,
    );
  } else {
    text = replaceJsoncField(text, 'account_id', requiredEnv('CLOUDFLARE_ACCOUNT_ID'));
  }
  if (!/"compatibility_date"\s*:/.test(text)) {
    text = text.replace(
      /"compatibility_flags"/,
      `"compatibility_date": "${new Date().toISOString().slice(0, 10)}",\n  "compatibility_flags"`,
    );
  }
  // Custom domains manage DNS; drop zone routes if present to avoid dual binding.
  text = text.replace(/,?\s*"routes"\s*:\s*\[[\s\S]*?\],?/, '');
  await writeFile(target, text);
  return target;
}

export async function ensureProductionEnv(projectDir: string, domain: string, siteName: string) {
  const path = join(projectDir, '.env.production');
  let text = (await exists(path)) ? await readFile(path, 'utf8') : '';
  const set = (key: string, value: string) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${key}=${value}`);
    else text = `${text.trimEnd()}${text ? '\n' : ''}${key}=${value}\n`;
  };
  set('VITE_APP_URL', `https://${domain}`);
  set('VITE_APP_NAME', siteName);
  await writeFile(path, text.endsWith('\n') ? text : `${text}\n`);
  return path;
}

export async function prepareWorkersHosting(opts: {
  projectDir: string;
  workerName: string;
  siteName: string;
  domain: string;
  cf: CloudflareProvider;
}) {
  const databaseName = `${opts.workerName}-db`;
  const d1 = await opts.cf.findOrCreateD1(databaseName);
  await materializeWranglerConfig({
    projectDir: opts.projectDir,
    workerName: opts.workerName,
    siteName: opts.siteName,
    domain: opts.domain,
    databaseName,
    databaseId: d1.uuid,
  });
  await ensureProductionEnv(opts.projectDir, opts.domain, opts.siteName);
  return { databaseId: d1.uuid, databaseName, workerName: opts.workerName };
}

export async function ensureWorkerSecrets(projectDir: string) {
  const listed = await runCapture('npx wrangler secret list', projectDir, { CI: 'true' });
  let names: string[] = [];
  try {
    names = (JSON.parse(listed.stdout) as Array<{ name: string }>).map((x) => x.name);
  } catch {
    names = [];
  }
  const put = async (name: string) => {
    if (names.includes(name)) return { name, status: 'exists' as const };
    const value = randomBytes(32).toString('base64');
    await runWithStdin(`npx wrangler secret put ${name}`, value, projectDir, { CI: 'true' });
    return { name, status: 'created' as const };
  };
  return {
    secrets: [await put('AUTH_SECRET'), await put('CONFIG_ENCRYPTION_KEY')],
  };
}

export async function ensureD1Migrations(projectDir: string) {
  const drizzleDir = join(projectDir, 'drizzle');
  if (!(await exists(drizzleDir))) {
    // ShipAny gitignores drizzle/; generate from schema before first remote apply.
    await run('pnpm db:generate', projectDir, { CI: 'true' });
  }
}

export async function applyD1Migrations(projectDir: string, databaseName: string) {
  await ensureD1Migrations(projectDir);
  await run(`npx wrangler d1 migrations apply "${databaseName}" --remote`, projectDir, { CI: 'true' });
  return { databaseName, applied: true };
}

export async function upsertConfigValues(
  projectDir: string,
  databaseName: string,
  entries: Record<string, string>,
) {
  const esc = (value: string) => value.replace(/'/g, "''");
  const values = Object.entries(entries)
    .map(([name, value]) => `('${esc(name)}', '${esc(value)}')`)
    .join(', ');
  const sql = `INSERT INTO config (name, value) VALUES ${values} ON CONFLICT(name) DO UPDATE SET value=excluded.value;`;
  await run(
    `npx wrangler d1 execute "${databaseName}" --remote --command=${JSON.stringify(sql)}`,
    projectDir,
    { CI: 'true' },
  );
  return entries;
}

export async function upsertGa4Config(projectDir: string, databaseName: string, measurementId: string) {
  await upsertConfigValues(projectDir, databaseName, { google_analytics_id: measurementId });
  return { measurementId, databaseName };
}

export async function upsertPlausibleConfig(
  projectDir: string,
  databaseName: string,
  domain: string,
  scriptSrc: string,
) {
  await upsertConfigValues(projectDir, databaseName, {
    plausible_domain: domain,
    plausible_src: scriptSrc,
  });
  return { domain, scriptSrc, databaseName };
}
