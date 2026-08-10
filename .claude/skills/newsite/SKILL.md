---
name: newsite
description: "Create a new ShipAny site: collect name/domain/email/features via AskUserQuestion, create a GitHub repo with gh, clone shipany-tanstack into ~/Projects, write site.config.json, then hand off to /quick-start. Use when the user wants a new site, says newsite, or wants to bootstrap from the ShipAny template."
argument-hint: "[optional: site name, domain, email, feature description]"
user-invocable: true
---

# newsite — $ARGUMENTS

Bootstrap a new website from the ShipAny TanStack source repo, then continue with `/quick-start` in the cloned project.

**Do not** use the `auto-launch-website` CLI for this flow. Use `gh` + `git` only.

## Constants

| Key | Value |
|-----|--------|
| Source repo | `git@github.com:shipany-ai/shipany-tanstack.git` |
| Projects root | `~/Projects` |
| Visibility | `public` |

## Phase 1: Collect inputs (AskUserQuestion)

Parse `$ARGUMENTS` and any prior user message for:

- **网站名** (site name)
- **域名** (apex domain, e.g. `example.com`)
- **邮箱** (defaults to `support@{域名}` once domain is known)
- **功能描述** (product / feature description)

For every missing required field, call **AskUserQuestion** (one field at a time, in this order):

1. **网站名** — required. Prompt: `网站名是什么？`
2. **域名** — required. Prompt: `域名是什么？（如 example.com）`
   Validate: matches `^[a-z0-9.-]+\.[a-z]{2,}$` (case-insensitive). Re-ask if invalid.
3. **邮箱** — optional with default. Prompt: `邮箱？` with default / suggestion `support@{域名}`. If the user skips or accepts default, use `support@{域名}`.
4. **功能描述** — required. Prompt: `功能描述是什么？（产品做什么、核心功能）`

Do not proceed until 网站名、域名、功能描述 are set and 邮箱 is resolved (explicit or default).

## Phase 2: Derive values

```text
repository.name = siteName
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase()
```

Validate `repository.name`: must match `^[a-z0-9._-]+$`, and must not be `.` or `..`.

```bash
owner="$(gh api user -q .login)"
localPath="$HOME/Projects/${repository_name}"
origin="git@github.com:${owner}/${repository_name}.git"
source="git@github.com:shipany-ai/shipany-tanstack.git"
```

Show the user a short confirmation summary (name, domain, email, description, owner/repo, localPath) before mutating GitHub or the filesystem. If they cancel, stop.

## Phase 3: Local path safety

```bash
mkdir -p "$HOME/Projects"
```

If `$localPath` exists:

1. It must be a Git repository: `git -C "$localPath" rev-parse --show-toplevel` succeeds.
2. The toplevel realpath must equal the realpath of `$localPath` (reject nested / wrong roots).
3. Read `git -C "$localPath" remote get-url origin`. Its canonical repository must equal either `$origin` or `$source`; reject missing or unrelated origins.

On conflict: **stop before any GitHub mutation**. Tell the user to remove or rename the path.

## Phase 4: Create GitHub repo + clone (gh / git)

```bash
remote_existed=0
if gh repo view "${owner}/${repository_name}" >/dev/null 2>&1; then
  remote_existed=1
else
  gh repo create "${owner}/${repository_name}" --public
fi
```

Then:

| remote existed? | local exists? | Action |
|-----------------|---------------|--------|
| yes | no | `git clone -- "$origin" "$localPath"` |
| no | no | `git clone -- "$source" "$localPath"` then `git -C "$localPath" remote set-url origin "$origin"` then `git -C "$localPath" push -u origin HEAD` |
| any | yes (valid origin/source) | Skip clone, then run the idempotent publish step below |

For every existing valid local repository, always repair the destination remote and retry publication so an interrupted first push cannot be reported as complete:

```bash
git -C "$localPath" remote set-url origin "$origin"
git -C "$localPath" push -u origin HEAD
```

Never use GitHub `--template` / generate-from-template APIs. The source is a normal Git repository.

## Phase 5: Write `site.config.json`

Write `$localPath/site.config.json` (overwrite if present) with this shape — substitute collected / derived values:

```json
{
  "domain": "<域名>",
  "site": {
    "name": "<网站名>",
    "canonicalUrl": "https://<域名>"
  },
  "repository": {
    "owner": "<owner>",
    "name": "<repository.name>",
    "visibility": "public",
    "template": "git@github.com:shipany-ai/shipany-tanstack.git"
  },
  "hosting": {
    "provider": "cloudflare",
    "type": "workers",
    "projectName": "<repository.name>",
    "productionBranch": "main",
    "deployCommand": "pnpm cf:deploy"
  },
  "registrar": {
    "provider": "spaceship"
  },
  "cloudflare": {
    "alwaysHttps": true,
    "redirectWwwToApex": true
  },
  "email": {
    "enabled": true,
    "aliases": ["support"],
    "destinationEnv": "SUPPORT_EMAIL_DESTINATION"
  },
  "analytics": {
    "ga4": true,
    "plausible": true,
    "injectCommand": "node scripts/set-ga-id.mjs \"$AUTO_LAUNCH_GA_ID\""
  },
  "search": {
    "gsc": true,
    "sitemapPath": "/sitemap.xml"
  },
  "audit": {
    "buildCommand": "pnpm build",
    "launchAuditCommand": ""
  }
}
```

Field mapping:

| Config path | Source |
|-------------|--------|
| `domain` | 域名 |
| `site.name` | 网站名 |
| `site.canonicalUrl` | `https://` + 域名 |
| `repository.owner` | `gh api user -q .login` |
| `repository.name` / `hosting.projectName` | derived slug |
| `repository.template` | source SSH URL (constant) |

Notes:
- Launch (`node dist/cli.js launch --config $localPath/site.config.json`) auto-creates D1, fills `wrangler.jsonc`, applies migrations, sets Worker secrets, attaches Workers custom domains, and upserts GA + Plausible into D1. Do not rely on `wrangler domains add` (removed in Wrangler 4).
- Plausible: set `PLAUSIBLE_SCRIPT_SRC` (e.g. self-hosted `https://app.pageview.app/js/script.js`); launch writes `plausible_domain` + `plausible_src` to D1. Without Sites API token, add the domain in your Plausible dashboard after publish (reminder printed at end of launch).
- After writing `site.config.json`, also write `$localPath/scripts/set-ga-id.mjs` if missing (same small script as other ShipAny launch sites) so `analytics.injectCommand` works.
- The collected **邮箱** is for `/quick-start` (admin/support), not a field inside this JSON. Launch-time email routing still uses `SUPPORT_EMAIL_DESTINATION` from the environment.

## Phase 6: Hand off to `/quick-start`

1. Switch the working directory to `$localPath` for all subsequent work.
2. Read and follow `$localPath/.claude/skills/quick-start/SKILL.md`.
3. Invoke `/quick-start` with arguments that include at least:

```text
App name: <网站名>
Domain: https://<域名>
Admin/support email: <邮箱>
App description / Features: <功能描述>
```

4. **Skip re-asking** in quick-start Phase 0 for app name, domain, and description — they are already provided. Still allow quick-start to ask its own remaining questions (database, admin password, etc.).

5. After handoff, do not go back to scaffolding in this repo unless the user asks.

## Completion checklist

Before claiming done:

- [ ] GitHub repo exists at `https://github.com/<owner>/<repository.name>`
- [ ] Local clone at `$localPath` with `origin` pointing at that repo
- [ ] `site.config.json` written
- [ ] `/quick-start` started (or completed) in `$localPath` with the collected arguments
