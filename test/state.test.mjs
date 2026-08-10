import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../dist/services/state.js';

test('keeps launch state isolated for each domain', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auto-launch-state-'));
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const store = new StateStore();
    const first = await store.load('first.example');
    await store.mark(first, 'ga4', {measurementId:'G-FIRST'});
    const second = await store.load('second.example');
    await store.mark(second, 'ga4', {measurementId:'G-SECOND'});

    const reloadedFirst = await store.load('first.example');
    assert.ok(reloadedFirst.steps.ga4, 'first domain state should still exist');
    assert.equal(reloadedFirst.steps.ga4.detail.measurementId, 'G-FIRST');
  } finally {
    process.chdir(previousCwd);
    await rm(dir, {recursive:true, force:true});
  }
});

test('loads a matching legacy state file before migration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auto-launch-state-'));
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    await writeFile('.auto-launch-state.json', JSON.stringify({version:1,domain:'legacy.example',steps:{ga4:{ok:true,at:'2026-08-10T00:00:00.000Z',detail:{measurementId:'G-LEGACY'}}}}));
    const state = await new StateStore().load('legacy.example');
    assert.equal(state.steps.ga4.detail.measurementId, 'G-LEGACY');
  } finally {
    process.chdir(previousCwd);
    await rm(dir, {recursive:true, force:true});
  }
});

test('treats domain casing as the same launch state identity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auto-launch-state-'));
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const store = new StateStore();
    const state = await store.load('Example.COM');
    await store.mark(state, 'ga4', {measurementId:'G-CASE'});
    const reloaded = await store.load('example.com');
    assert.ok(reloaded.steps.ga4, 'domain casing must not discard completed steps');
    assert.equal(reloaded.steps.ga4.detail.measurementId, 'G-CASE');
  } finally {
    process.chdir(previousCwd);
    await rm(dir, {recursive:true, force:true});
  }
});
