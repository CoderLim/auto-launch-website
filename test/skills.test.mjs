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

test('launch-site skill documents ShipAny hreflang audit', async () => {
  const skill = await readFile('.claude/skills/launch-site/SKILL.md', 'utf8');
  const note = await readFile('.claude/skills/launch-site/hreflang.md', 'utf8');
  assert.match(skill, /hreflang/);
  assert.match(skill, /hreflang\.md/);
  assert.match(note, /__root\.tsx/);
  assert.match(note, /localeHeadLinks|do not keep homepage hreflang in the root layout/i);
  assert.equal(skill.split(/\r?\n/).some(line => /[ \t]+$/.test(line)), false);
  assert.equal(note.split(/\r?\n/).some(line => /[ \t]+$/.test(line)), false);
});
