# Post-login redirect (ShipAny)

Caught on personremover.org: header **Log in / Sign up** links went to bare `/sign-in` and `/sign-up`. After auth, `resolveAfterAuthUrl` fell back to `/settings`, so users who signed in from the homepage or a tool page landed in the settings dashboard instead of the page they came from.

## Product rule

**After sign-in / sign-up, return the user to the page they were on before auth.** Do not send them to `/settings` (or any dashboard) unless that was the explicit destination.

| Situation | Destination |
|-----------|-------------|
| Came from `/`, `/pricing`, a tool page, etc. with `?callbackUrl=` | That path (same-origin only) |
| No callback / invalid / auth-page callback | `/` (home), **not** `/settings` |
| Guarded route (e.g. `AppLayout`) already passes `callbackUrl` | Keep that path |
| Pricing / checkout flows that pass billing callback | Keep those explicit targets |

## Template bug (ShipAny TanStack)

1. **Entry links omit `callbackUrl`** — marketing chrome (`MagicHeader`, `SiteHeader`, CTAs) links to `/sign-in` / `/sign-up` with no query.
2. **Default fallback is `/settings`** — `resolveAfterAuthUrl` / sign-in / sign-up use `fallback: '/settings'` when nothing safe is in the query.
3. **One-off dialogs hardcode home** — e.g. `SignInGuideDialog` with `callbackURL="/"` instead of the current path.

Open-redirect guards stay: only same-origin internal paths via `safeInternalPath`; never bounce back into auth routes.

## How to fix in the site repo

1. **Fallback → home**
   - `src/lib/redirect.ts`: `resolveAfterAuthUrl` default `fallback = '/'`
   - `src/routes/(auth)/sign-in.tsx` and `sign-up.tsx`: pass `fallback: '/'`

2. **Every public auth entry carries the current page**
   ```ts
   import { currentPathWithQuery } from '@/lib/redirect';

   function authHref(path: '/sign-in' | '/sign-up') {
     const callbackUrl = encodeURIComponent(currentPathWithQuery('/'));
     return `${path}?callbackUrl=${callbackUrl}`;
   }
   ```
   Use `authHref('/sign-in')` / `authHref('/sign-up')` in header, mobile menu, and any marketing CTA that opens auth.

3. **Inline / dialog social login** — pass `callbackURL={currentPathWithQuery('/')}` (or the feature’s real return path), not a hardcoded `/` or `/settings`.

4. **Already-signed-in on auth pages** — resolve destination from the live query (`callbackUrl` / `redirect`), same helper, fallback `/`. Do not hardcode `router.push('/settings')`.

## Checklist (newsite / quick-start)

Before calling a ShipAny site done:

- [ ] Header / mobile Log in & Sign up include `?callbackUrl=` from `currentPathWithQuery`
- [ ] `resolveAfterAuthUrl` default fallback is `/`, not `/settings`
- [ ] Sign-in / sign-up / verify-email / social / One Tap / guide dialogs preserve return path
- [ ] Manual smoke: from home → Log in → after auth land on home (not `/settings`)
