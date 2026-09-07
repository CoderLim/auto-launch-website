import test from 'node:test';
import assert from 'node:assert/strict';
import { collectManualFollowUps, formatManualFollowUps } from '../dist/services/followups.js';

test('collectManualFollowUps includes Plausible when using legacy mode', () => {
  delete process.env.PLAUSIBLE_API_TOKEN;
  const items = collectManualFollowUps(
    {
      domain: 'example.com',
      site: { name: 'Example' },
      repository: { owner: 'x', name: 'y' },
      hosting: { provider: 'cloudflare', type: 'workers', projectName: 'y' },
      registrar: { provider: 'spaceship' },
      analytics: { plausible: true },
    },
    {
      version: 1,
      domain: 'example.com',
      steps: {
        'plausible-inject': {
          ok: true,
          at: '2026-01-01T00:00:00.000Z',
          detail: { mode: 'legacy', domain: 'example.com' },
        },
      },
    },
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'plausible-site');
  assert.match(formatManualFollowUps(items), /example\.com/);
  assert.match(formatManualFollowUps(items), /Manual follow-ups/);
});

test('collectManualFollowUps skips Plausible when Sites API was used', () => {
  process.env.PLAUSIBLE_API_TOKEN = 'token';
  const items = collectManualFollowUps(
    {
      domain: 'example.com',
      site: { name: 'Example' },
      repository: { owner: 'x', name: 'y' },
      hosting: { provider: 'cloudflare', type: 'workers', projectName: 'y' },
      registrar: { provider: 'spaceship' },
      analytics: { plausible: true },
    },
    {
      version: 1,
      domain: 'example.com',
      steps: {
        'plausible-inject': {
          ok: true,
          at: '2026-01-01T00:00:00.000Z',
          detail: { mode: 'sites-api', domain: 'example.com' },
        },
      },
    },
  );
  assert.deepEqual(items, []);
  delete process.env.PLAUSIBLE_API_TOKEN;
});

test('collectManualFollowUps includes payment when payments.enabled', () => {
  const items = collectManualFollowUps(
    {
      domain: 'example.com',
      site: { name: 'Example' },
      repository: { owner: 'x', name: 'y' },
      hosting: { provider: 'cloudflare', type: 'workers', projectName: 'y' },
      registrar: { provider: 'spaceship' },
      payments: { enabled: true },
    },
    { version: 1, domain: 'example.com', steps: {} },
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'payment-provider');
  assert.match(formatManualFollowUps(items), /No payment provider configured/);
  assert.match(formatManualFollowUps(items), /https:\/\/example\.com\/admin/);
});

test('collectManualFollowUps skips payment when payments.enabled is false', () => {
  const items = collectManualFollowUps(
    {
      domain: 'example.com',
      site: { name: 'Example' },
      repository: { owner: 'x', name: 'y' },
      hosting: { provider: 'cloudflare', type: 'workers', projectName: 'y' },
      registrar: { provider: 'spaceship' },
      payments: { enabled: false },
    },
    { version: 1, domain: 'example.com', steps: {} },
  );
  assert.deepEqual(items, []);
});
