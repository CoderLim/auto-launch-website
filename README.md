# auto-launch-website

Deterministic launch automation for indie/SEO websites. The development phase stays human-in-the-loop; the launch phase uses official APIs and idempotent state instead of browser clicking.

## Scope of this MVP

Implemented:

- Create a GitHub repository from a GitHub Template repository.
- Pre-launch shell audit/build hook.
- Create/reuse a Cloudflare Zone and wait until active.
- Update registrar nameservers (Namecheap or Spaceship).
- For Workers (`hosting.type=workers`): create D1, materialize `wrangler.jsonc` + `.env.production`, apply D1 migrations, deploy, set `AUTH_SECRET` / `CONFIG_ENCRYPTION_KEY`, attach Workers custom domains (apex + www).
- Enable Always Use HTTPS and a `www -> apex` Redirect Rule (Pages also gets a proxied www CNAME).
- Enable Cloudflare Email Routing and create aliases such as `support@domain`.
- Deploy via `hosting.deployCommand` (ShipAny: `pnpm cf:deploy`).
- Create GA4 property + web stream; for Workers, upsert `google_analytics_id` into D1 config (optional `analytics.injectCommand` still runs).
- Plausible: set `PLAUSIBLE_SCRIPT_SRC` (shared self-hosted script); launch writes `plausible_domain` per site into D1. Optional Enterprise `PLAUSIBLE_API_TOKEN` auto-provisions via Sites API.
- Create GSC domain verification TXT, verify ownership, add Search Console property and submit sitemap.
- Persist step state to `.auto-launch-state/<domain>.json` for safe retries across multiple sites.
- Production checks for apex HTTPS, www redirect, sitemap, robots.txt, and a sampled hreflang/JSON-LD audit (DoH + curl, with retries for edge cert provisioning). See `.claude/skills/launch-site/hreflang.md`.
- Dry run and status commands.

Not implemented in this MVP:

- Purchasing domains.
- YAML config. MVP uses JSON to avoid a runtime dependency.
- ShipAny admin user seeding (still done in `/quick-start` / deploy skill when needed).

## Quick start

**Interactive new site (recommended):** in Claude Code, run `/newsite` (see [`.claude/skills/newsite/SKILL.md`](.claude/skills/newsite/SKILL.md)). It uses AskUserQuestion for site name, domain, email (default `support@{domain}`), and feature description; creates the GitHub repo with `gh`; clones `shipany-tanstack` into `~/Projects/<repo>`; writes `site.config.json`; then hands off to the cloned project's `/quick-start` skill.

**Launch automation (CLI):**

```bash
cp examples/site.config.json site.config.json
cp .env.example .env
# export/load environment variables using your normal secret manager
npm run build
node dist/cli.js launch --config site.config.json --dry-run
node dist/cli.js launch --config site.config.json
```

## Commands

```bash
auto-launch-website newsite --config site.config.json
auto-launch-website launch --config site.config.json
auto-launch-website launch --config site.config.json --dry-run
auto-launch-website status --config site.config.json
```

CLI `newsite` is the non-interactive / automation path (config file in, JSON out). Prefer the `/newsite` skill for human-driven setup. The CLI defaults to cloning `git@github.com:shipany-ai/shipany-tanstack.git` as a normal Git source (not a GitHub template). When `repository.name` is omitted, it is derived from `site.name` (for example, `Bills Must Be Paid` becomes `bills-must-be-paid`). For a new site it creates an empty GitHub repository, clones the source into `~/Projects/<repository.name>`, retargets `origin`, and pushes. If the GitHub repository already exists, it just clones that repository locally.

## Required credentials

See `.env.example`. Copy to `.env` in this repo root (auto-loaded by the CLI). Use least-privilege tokens. Spaceship needs `domains:write`. The Google refresh token needs Analytics Admin, Search Console and Site Verification scopes. The Cloudflare token needs Zone/DNS/Email Routing plus Account Workers Scripts, D1, and Account Settings Read. Plausible: default self-hosted script via `PLAUSIBLE_SCRIPT_SRC` / `PLAUSIBLE_DASHBOARD_URL` in `.env`. Launch sets `plausible_domain` per site; add the domain in your Plausible dashboard after publish (reminder at end of launch). Optional Enterprise [Sites API](https://plausible.io/docs/sites-api) token for full auto-provisioning.

## Retry / idempotency

Each completed step is written to `.auto-launch-state/<domain>.json`. Re-running `launch` skips completed steps without overwriting another site's state. Existing matching `.auto-launch-state.json` files are read as a legacy fallback and migrate on the next completed step. Remove only the specific step from the domain state file when you intentionally want to replay it.

## Template contract

For ShipAny Workers launches, set `hosting.type` to `workers` and `hosting.deployCommand` to `pnpm cf:deploy`. The CLI creates D1, fills `wrangler.jsonc`, applies migrations, attaches custom domains, and writes GA into D1 — you do not need a working `customDomainCommand`. Optional `setupCommand` / `analytics.injectCommand` still run when provided. Pages launches still rely on the shell hooks.
