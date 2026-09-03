# Hreflang production check (ShipAny)

Caught on videotextremover.org after Ahrefs: inner pages declared two URLs per language, and some `hreflang=zh` targets were English pages. The root cause is in the **ShipAny TanStack template**, not a one-off page bug.

## Template bug

`src/routes/__root.tsx` `head()` emits homepage alternates on **every** route:

```ts
...locales.map((loc) => ({
  rel: 'alternate',
  hrefLang: loc,
  href: localizeUrl(`${appUrl}/`, { locale: loc }).href,
}))
```

That first appeared in the TanStack Start migration (`__root.tsx` v1). Later landing pages added their own self-pointing en/zh + `x-default`. Together they produce:

1. **More than one page for same language in hreflang** — inner HTML has `hreflang=en` → `/` **and** `hreflang=en` → this page (same for `zh`).
2. **Missing reciprocal hreflang (no return-tag)** — homepage only points at `/` ↔ `/zh`, so inner-page pairs do not close.
3. **Declared zh URL is not a Chinese page** — `hreflang=zh` must land on a real zh document (`html lang="zh"`, zh copy). Hardcoded English copy on `/zh/...` fails this even if the URL 200s.
4. **JSON-LD `url` stays English on zh pages** — `buildAppJsonLd({ url: PATH })` concatenates apex + locale-free path, so `/zh/remove-watermark-from-video` still ships `"url": "https://example.com/remove-watermark-from-video"`.

A later “fix” that only stops client hydration from emitting localhost URLs does **not** fix this. Do not keep homepage hreflang in the root layout.

## What good HTML looks like

- **Home only:** `en` → `/`, `zh` → `/zh`, `x-default` → `/`.
- **Inner page only:** `en` → that path, `zh` → `/zh` + that path, `x-default` → English URL. No `/` or `/zh` homepage pair.
- Each language appears **once**. Pairs are reciprocal. zh JSON-LD / `og:url` use `/zh/...`.

## How to check (live)

```bash
# Sample home + one inner EN + matching ZH
for u in \
  "https://<domain>/" \
  "https://<domain>/remove-watermark-from-video" \
  "https://<domain>/zh/remove-watermark-from-video"; do
  echo "=== $u ==="
  curl -sL "$u" | rg -o '<link[^>]*rel=["'\'']alternate["'\''][^>]*>|<html[^>]*>' -i
done
```

Fail if an inner page still lists homepage `/` and `/zh`, if the same `hreflang` has two hrefs, if `/zh/...` title/body is English, or if JSON-LD `url` on a zh page lacks `/zh`.

`production-audit` runs a subset of this (home + sitemap sample). If it fails, fix the site then re-run launch.

## How to fix in the site repo

1. Remove global homepage `alternate` links from `__root.tsx`. Root `head()` keeps icons / charset only.
2. Each public route (or a helper like `localeHeadLinks(path, locale)`) emits **its own** canonical + en/zh + `x-default`.
3. Localize JSON-LD / `og:url` with `localizeUrl` (or `localePageUrl`) using the active locale.
4. Either ship a real zh page for every `hreflang=zh` URL, or do not declare that language.

Do **not** “fix” Ahrefs by deleting zh from inner pages that already have Chinese copy.
