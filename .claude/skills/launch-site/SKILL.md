---
name: launch-site
description: "Run auto-launch-website launch for a site.config.json: Cloudflare, Spaceship NS, Workers deploy, email, GA4, Plausible, GSC. Use when the user says launch, 上线, 发布, or wants automated DNS/deploy/analytics after /newsite and /quick-start."
argument-hint: "[path to site.config.json, default ~/Projects/<repo>/site.config.json]"
user-invocable: true
---

# launch-site — $ARGUMENTS

End-to-end launch via the `auto-launch-website` CLI. **Human quality gate is upstream** (`/newsite` + `/quick-start`); this skill runs the automated publish pipeline.

## Prerequisites

1. Site repo exists under `~/Projects/<repository.name>` with a valid `site.config.json`.
2. `~/Projects/auto-launch-website/.env` is filled (Cloudflare, Spaceship, Google, `SUPPORT_EMAIL_DESTINATION`, `PLAUSIBLE_SCRIPT_SRC`, etc.).
3. `pnpm build` already done in auto-launch-website (or run it once if `dist/` is missing).

## Resolve config path

| Input | Config path |
|-------|-------------|
| `$ARGUMENTS` is a `.json` path | use as-is |
| `$ARGUMENTS` names a repo slug | `~/Projects/<slug>/site.config.json` |
| empty | infer from cwd if inside a site repo, else ask |

## Run launch

```bash
cd ~/Projects/auto-launch-website
set -a && source .env && set +a
node dist/cli.js launch --config "<absolute-path-to-site.config.json>"
```

- Idempotent per domain: completed steps are skipped via `.auto-launch-state/<domain>.json` in auto-launch-website cwd. A matching legacy `.auto-launch-state.json` is migrated on the next completed step.
- On failure: read the error, fix the blocker, re-run (do not wipe state unless replaying a specific step).
- Dry run first only when the user asks: `node dist/cli.js launch --config ... --dry-run`

## What launch automates (Workers / ShipAny)

- Cloudflare zone + Spaceship nameservers
- D1 create, `wrangler.jsonc`, migrations, secrets, deploy, custom domains
- Email routing (`support@domain`)
- GA4 property + D1 `google_analytics_id`
- Plausible D1 (`plausible_domain` + shared `PLAUSIBLE_SCRIPT_SRC`)
- GSC verify + sitemap submit
- Production audit

## Manual follow-ups (printed at end)

- **Plausible self-hosted:** add the domain in `PLAUSIBLE_DASHBOARD_URL` (default https://app.pageview.app) — script + data-domain are already injected.

## Status

```bash
cd ~/Projects/auto-launch-website
node dist/cli.js status --config "<path>"
```

Re-shows pending manual follow-ups and step state.

## Do not

- Use this instead of `/newsite` for scaffolding a new repo.
- Commit `.env`, `.auto-launch-state.json`, or `.auto-launch-state/`.
