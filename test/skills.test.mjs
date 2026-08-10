import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('newsite skill validates origin and retries publication safely', async () => {
  const text = await readFile('.claude/skills/newsite/SKILL.md', 'utf8');
  assert.match(text, /remote get-url origin/);
  assert.match(text, /existing valid local repository.*push -u origin HEAD/is);
  assert.doesNotMatch(text, /Skip clone\/push/);
  assert.doesNotMatch(text, /--confirm/);
  assert.equal(text.split(/\r?\n/).some(line => /[ \t]+$/.test(line)), false);
});
