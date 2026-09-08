export type HreflangLink = { lang: string; href: string };

export function normalizeHref(href: string): string {
  try {
    const url = new URL(href);
    url.hash = '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.origin}${path}${url.search}`;
  } catch {
    return href.replace(/\/+$/, '') || href;
  }
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1]?.trim();
}

export function parseHreflangLinks(html: string): HreflangLink[] {
  const links: HreflangLink[] = [];
  // HTML <link> and sitemap <xhtml:link> (or any namespaced *:link).
  const re = /<(?:[\w.-]+:)?link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html.replace(/\0/g, '')))) {
    const tag = match[0];
    const rel = attr(tag, 'rel');
    if (!rel || !/\balternate\b/i.test(rel)) continue;
    const lang = attr(tag, 'hreflang') || attr(tag, 'hrefLang');
    const href = attr(tag, 'href');
    if (lang && href) links.push({ lang: lang.toLowerCase(), href });
  }
  return links;
}

export function parseJsonLdUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const source = html.replace(/\0/g, '');
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    try {
      const body = match[1];
      if (!body) continue;
      const data = JSON.parse(body.trim()) as unknown;
      collectUrls(data, urls);
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return urls;
}

function collectUrls(node: unknown, out: string[]) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectUrls(item, out);
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.url === 'string') out.push(record.url);
  for (const value of Object.values(record)) collectUrls(value, out);
}

export function isLocaleHome(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/' || /^\/[a-z]{2}$/i.test(path);
}

export function groupHreflang(links: HreflangLink[]): Map<string, Set<string>> {
  const byLang = new Map<string, Set<string>>();
  for (const link of links) {
    const hrefs = byLang.get(link.lang) ?? new Set<string>();
    hrefs.add(normalizeHref(link.href));
    byLang.set(link.lang, hrefs);
  }
  return byLang;
}

export function auditPageHreflang(pageUrl: string, html: string): string[] {
  const issues: string[] = [];
  const page = new URL(pageUrl);
  const origin = page.origin;
  const pageNorm = normalizeHref(pageUrl);
  const homeEn = normalizeHref(`${origin}/`);
  const homeZh = normalizeHref(`${origin}/zh`);
  const byLang = groupHreflang(parseHreflangLinks(html));
  const inner = !isLocaleHome(page.pathname);

  for (const [lang, hrefs] of byLang) {
    if (hrefs.size > 1) {
      issues.push(
        `${pageUrl}: more than one URL for hreflang=${lang}: ${[...hrefs].join(', ')}`,
      );
    }
  }

  if (inner) {
    const en = byLang.get('en');
    const zh = byLang.get('zh');
    if (en?.has(homeEn) && [...en].some((href) => href !== homeEn)) {
      issues.push(
        `${pageUrl}: inner page mixes homepage hreflang=en (${homeEn}) with another en URL — likely root layout leaking /`,
      );
    }
    if (zh?.has(homeZh) && [...zh].some((href) => href !== homeZh)) {
      issues.push(
        `${pageUrl}: inner page mixes homepage hreflang=zh (${homeZh}) with another zh URL — likely root layout leaking /zh`,
      );
    }
    if (en?.has(homeEn) && !en.has(pageNorm) && !page.pathname.startsWith('/zh')) {
      issues.push(`${pageUrl}: hreflang=en points at homepage instead of this page`);
    }
    if (zh?.has(homeZh) && page.pathname.startsWith('/zh') && !zh.has(pageNorm)) {
      issues.push(`${pageUrl}: hreflang=zh points at /zh homepage instead of this page`);
    }
  }

  const htmlLang = html.match(/<html\b[^>]*\blang=["']([^"']+)/i)?.[1]?.toLowerCase() ?? '';
  const onZhPage = htmlLang === 'zh' || page.pathname === '/zh' || page.pathname.startsWith('/zh/');
  if (onZhPage) {
    for (const raw of parseJsonLdUrls(html)) {
      try {
        const jsonUrl = new URL(raw, origin);
        if (jsonUrl.origin === origin && !jsonUrl.pathname.startsWith('/zh')) {
          issues.push(`${pageUrl}: JSON-LD url is not the zh URL: ${raw}`);
        }
      } catch {
        // ignore relative junk
      }
    }
  }

  return issues;
}

export function auditReciprocalHreflang(
  pages: Array<{ url: string; links: HreflangLink[] }>,
): string[] {
  const issues: string[] = [];
  const byUrl = new Map(
    pages.map((page) => [normalizeHref(page.url), page] as const),
  );

  for (const page of pages) {
    for (const link of page.links) {
      if (link.lang === 'x-default') continue;
      const target = byUrl.get(normalizeHref(link.href));
      if (!target) continue;
      const returns = target.links.some(
        (alt) => normalizeHref(alt.href) === normalizeHref(page.url),
      );
      if (!returns) {
        issues.push(
          `${page.url}: hreflang=${link.lang} → ${link.href} has no return tag`,
        );
      }
    }
  }

  return issues;
}

export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1]?.trim())
    .filter((loc): loc is string => Boolean(loc));
}

/**
 * Google's recommended pattern: one <url>/<loc> per localized URL, each carrying
 * the full reciprocal xhtml:link hreflang cluster. Fail if sitemap only lists the
 * base-locale loc while declaring other locales via xhtml:link (ShipAny old bug).
 */
export function auditSitemapLocaleEntries(xml: string): string[] {
  const issues: string[] = [];
  const locs = new Set(sitemapLocs(xml).map(normalizeHref));
  const urlBlocks = [...xml.matchAll(/<url\b[^>]*>[\s\S]*?<\/url>/gi)].map(
    (match) => match[0],
  );

  for (const block of urlBlocks) {
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1]?.trim();
    if (!loc) continue;
    const links = parseHreflangLinks(block);
    for (const link of links) {
      if (link.lang === 'x-default') continue;
      const href = normalizeHref(link.href);
      if (!locs.has(href)) {
        issues.push(
          `sitemap: hreflang=${link.lang} → ${link.href} is declared under <loc>${loc} but has no own <loc> entry — emit one sitemap URL per locale`,
        );
      }
    }
  }

  return [...new Set(issues)];
}
