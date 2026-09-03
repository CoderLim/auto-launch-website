import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleHreflangUrls } from '../dist/services/audit.js';
import {
  auditPageHreflang,
  auditReciprocalHreflang,
  parseHreflangLinks,
  parseJsonLdUrls,
  sitemapLocs,
} from '../dist/services/hreflang.js';

const leakHtml = `
<html lang="en">
<link rel="alternate" hrefLang="en" href="https://example.com/"/>
<link rel="alternate" hrefLang="zh" href="https://example.com/zh"/>
<link rel="alternate" hrefLang="en" href="https://example.com/remove-watermark-from-video"/>
<link rel="alternate" hrefLang="zh" href="https://example.com/zh/remove-watermark-from-video"/>
<script type="application/ld+json">{"@type":"WebApplication","url":"https://example.com/remove-watermark-from-video"}</script>
</html>`;

const cleanInner = `
<html lang="en">
<link rel="alternate" hrefLang="en" href="https://example.com/remove-watermark-from-video"/>
<link rel="alternate" hrefLang="zh" href="https://example.com/zh/remove-watermark-from-video"/>
<link rel="alternate" hrefLang="x-default" href="https://example.com/remove-watermark-from-video"/>
</html>`;

const cleanZh = `
<html lang="zh">
<link rel="alternate" hrefLang="en" href="https://example.com/remove-watermark-from-video"/>
<link rel="alternate" hrefLang="zh" href="https://example.com/zh/remove-watermark-from-video"/>
<script type="application/ld+json">{"@type":"WebApplication","url":"https://example.com/zh/remove-watermark-from-video"}</script>
</html>`;

test('detects leaked homepage hreflang on an inner page', () => {
  const issues = auditPageHreflang(
    'https://example.com/remove-watermark-from-video',
    leakHtml,
  );
  assert.ok(issues.some((issue) => issue.includes('more than one URL for hreflang=en')));
  assert.ok(issues.some((issue) => issue.includes('root layout leaking /')));
});

test('detects English JSON-LD url on a zh page', () => {
  const issues = auditPageHreflang(
    'https://example.com/zh/remove-watermark-from-video',
    leakHtml.replace('lang="en"', 'lang="zh"'),
  );
  assert.ok(issues.some((issue) => issue.includes('JSON-LD url is not the zh URL')));
});

test('accepts reciprocal self-pointing inner pages', () => {
  assert.deepEqual(
    auditPageHreflang('https://example.com/remove-watermark-from-video', cleanInner),
    [],
  );
  assert.deepEqual(
    auditPageHreflang('https://example.com/zh/remove-watermark-from-video', cleanZh),
    [],
  );
  assert.deepEqual(
    auditReciprocalHreflang([
      { url: 'https://example.com/remove-watermark-from-video', links: parseHreflangLinks(cleanInner) },
      { url: 'https://example.com/zh/remove-watermark-from-video', links: parseHreflangLinks(cleanZh) },
    ]),
    [],
  );
});

test('flags missing return tags between fetched pairs', () => {
  const homeOnly = `
    <link rel="alternate" hrefLang="en" href="https://example.com/"/>
    <link rel="alternate" hrefLang="zh" href="https://example.com/zh"/>
  `;
  const inner = `
    <link rel="alternate" hrefLang="en" href="https://example.com/tool"/>
    <link rel="alternate" hrefLang="zh" href="https://example.com/zh"/>
  `;
  const issues = auditReciprocalHreflang([
    { url: 'https://example.com/tool', links: parseHreflangLinks(inner) },
    { url: 'https://example.com/zh', links: parseHreflangLinks(homeOnly) },
  ]);
  assert.ok(issues.some((issue) => issue.includes('no return tag')));
});

test('samples home plus inner en/zh pairs from sitemap', () => {
  const locs = sitemapLocs(`
    <urlset>
      <loc>https://example.com/</loc>
      <loc>https://example.com/blog</loc>
      <loc>https://example.com/pricing</loc>
      <loc>https://example.com/zh/blog</loc>
    </urlset>
  `);
  const sample = sampleHreflangUrls('example.com', locs);
  assert.ok(sample.includes('https://example.com/'));
  assert.ok(sample.includes('https://example.com/zh'));
  assert.ok(sample.includes('https://example.com/blog'));
  assert.ok(sample.includes('https://example.com/zh/blog'));
});

test('parses JSON-LD urls including nested graphs', () => {
  const urls = parseJsonLdUrls(
    `<script type="application/ld+json">{"@graph":[{"url":"https://example.com/zh/x"}]}</script>`,
  );
  assert.deepEqual(urls, ['https://example.com/zh/x']);
});
