# auto-launch-website

Deterministic launch automation for indie/SEO websites. The development phase stays human-in-the-loop; the launch phase uses official APIs and idempotent state instead of browser clicking.

## Scope of this MVP

Implemented:

- Create a GitHub repository from a GitHub Template repository.
- Pre-launch shell audit/build hook.
- Create/reuse a Cloudflare Zone and wait until active.
- Update Namecheap nameservers.
- Enable Always Use HTTPS.
- Create proxied `www` CNAME and a `www -> apex` Redirect Rule.
- Enable Cloudflare Email Routing and create aliases such as `support@domain`.
- Create GA4 property + web stream.
- Create GSC domain verification TXT, verify ownership, add Search Console property and submit sitemap.
- Persist step state to `.auto-launch-state.json` for safe retries.
- Production checks for apex HTTPS, www redirect, sitemap and robots.txt.
- Dry run and status commands.

Not implemented in this MVP:

- Purchasing domains.
- Spaceship registrar changes (adapter intentionally fails explicitly instead of pretending success).
- Cloudflare Pages/Workers deployment is implemented through deterministic template hooks (`setupCommand`, `deployCommand`, `customDomainCommand`). Standardize these commands in your template for zero-touch launches.
- GA injection is implemented through `analytics.injectCommand`; it receives `AUTO_LAUNCH_GA_ID`, followed by an automatic redeploy.
- YAML config. MVP uses JSON to avoid a runtime dependency.

## Quick start

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

`newsite` defaults to the `git@github.com:shipany-ai/shipany-tanstack.git` template. When `repository.name` is omitted, it is derived from `site.name` (for example, `Bills Must Be Paid` becomes `bills-must-be-paid`). After creating or finding the GitHub repository, the command clones it to `~/Projects/<repository.name>`.

## Required credentials

See `.env.example`. Use least-privilege tokens. The Google refresh token needs Analytics Admin, Search Console and Site Verification scopes. The Cloudflare token needs Zone, DNS, Rules, SSL settings and Email Routing permissions.

## Retry / idempotency

Each completed step is written to `.auto-launch-state.json`. Re-running `launch` skips completed steps. Remove only the specific step from the state file when you intentionally want to replay it.

## Template contract

For end-to-end automation, each standard site template should define working `hosting.deployCommand`, `hosting.customDomainCommand`, and `analytics.injectCommand` values. The CLI intentionally fails if these required actions are missing instead of reporting a false-success launch.
