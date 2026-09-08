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
- Production audit (HTTPS, www→apex, sitemap/robots, **hreflang**)

## Production audit: hreflang

ShipAny’s `__root.tsx` historically emits homepage `hreflang` on **every** page. Inner routes that also emit self-pointing en/zh then fail Ahrefs (“more than one page for same language”, “missing reciprocal / return-tag”). zh JSON-LD `url` often stays the English path.

`production-audit` samples the homepage plus sitemap URLs and fails on:

- sitemap `xhtml:link` hreflang targets that lack their own `<loc>` (must emit **one sitemap URL per locale**)
- the same `hreflang` mapping to two different hrefs (root layout leaking `/` + `/zh` onto an inner page)
- an inner page whose en/zh tags point at the homepage instead of itself
- a fetched pair with no return tag
- JSON-LD `url` on a `/zh/...` page that is not a `/zh` URL

Full pattern, curl recipe, and the site-repo fix: [hreflang.md](./hreflang.md). If audit fails, fix the **site** (do not keep homepage alternates in the root layout; sitemap must list each locale as its own `<loc>`), then re-run launch.

## Manual follow-ups (printed at end)

- **Plausible self-hosted:** add the domain in `PLAUSIBLE_DASHBOARD_URL` (default https://app.pageview.app) — script + data-domain are already injected.
- **Payment (required when the product sells credits / checkout / subscriptions):** launch does **not** seed payment providers. Before claiming launch done, run [payment.md](./payment.md): verify D1/`/admin` has the provider enabled (`waffo_*` + `default_payment_provider`, or Stripe/Creem equivalents), public config exposes it, and a live smoke checkout reaches the provider — not `No payment provider configured`.

Set in `site.config.json` so CLI `launch` / `status` print this reminder:

```json
"payments": { "enabled": true }
```

## Status

```bash
cd ~/Projects/auto-launch-website
node dist/cli.js status --config "<path>"
```

Re-shows pending manual follow-ups and step state.

## Do not

- Use this instead of `/newsite` for scaffolding a new repo.
- Commit `.env`, `.auto-launch-state.json`, or `.auto-launch-state/`.
