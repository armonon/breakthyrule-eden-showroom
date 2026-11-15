import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseEmbeddedTopics, validateArchiveTopics } from './validate-topics.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../../site/data/topics.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(new URL('./topic-baseline.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(catalog);
const script = data => '<script id="archive-topics-data" type="application/json">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>';

test('the complete pre-mishap taxonomy is accepted, with matching embedded data', () => {
  assert.equal(baseline.topicIds.length, 84);
  assert.equal(baseline.groups.length, 13);
  assert.deepEqual(validateArchiveTopics(catalog, parseEmbeddedTopics(script(catalog)), baseline), []);
});
test('reverting to the old seven-topic catalog blocks publication', () => {
  const reverted = copy(); reverted.topics = reverted.topics.slice(0, 7); reverted.groups = [];
  const errors = validateArchiveTopics(reverted, reverted, baseline);
  assert.ok(errors.some(error => error.includes('Verified archive topic is missing: gardening')));
  assert.ok(errors.some(error => error.includes('Verified archive group is missing: dreams-consciousness')));
});
test('losing only group membership is detected even when all topics remain', () => {
  const broken = copy(); broken.groups[0].ids.shift();
  assert.ok(validateArchiveTopics(broken, broken, baseline).some(error => error.includes('lost topic: secret-societies')));
});
test('duplicate IDs and dangling group references cannot hide category entries', () => {
  const broken = copy(); broken.topics.push(structuredClone(broken.topics[0])); broken.groups[0].ids.push('nonexistent-topic');
  const errors = validateArchiveTopics(broken, broken, baseline);
  assert.ok(errors.some(error => error.includes('Duplicate archive topic ID')));
  assert.ok(errors.some(error => error.includes('references missing topic: nonexistent-topic')));
});
test('new topics and groups are allowed without weakening the preserved baseline', () => {
  const expanded = copy(); expanded.topics.push({ id: 'new-research', title: 'New Research', tags: [] });
  expanded.groups.push({ id: 'new-subjects', title: 'New Subjects', ids: ['new-research'] });
  assert.deepEqual(validateArchiveTopics(expanded, expanded, baseline), []);
});
test('stale embedded labels are rejected, while formatting and object key order do not matter', () => {
  const stale = copy(); stale.topics[0].title = 'Old label';
  assert.ok(validateArchiveTopics(catalog, stale, baseline).some(error => error.includes('Embedded archive topics differ')));
  const reordered = Object.fromEntries(Object.entries(catalog).reverse());
  assert.deepEqual(validateArchiveTopics(catalog, reordered, baseline), []);
});
test('embedded data must be one non-executable JSON script and preserve escaped markup', () => {
  assert.throws(() => parseEmbeddedTopics(''), /exactly one/);
  assert.throws(() => parseEmbeddedTopics(script(catalog) + script(catalog)), /exactly one/);
  assert.throws(() => parseEmbeddedTopics('<script id="archive-topics-data">{}</script>'), /application\/json/);
  assert.deepEqual(parseEmbeddedTopics(script({ title: '</script><b>source</b>' })), { title: '</script><b>source</b>' });
});
