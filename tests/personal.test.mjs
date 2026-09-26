import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLibrary, personalDataset} from '../site/personal.mjs';
import {validate, makeGraph, filterPosts, monthBins} from '../site/core.mjs';

const savedAt = '2026-09-26T08:00:00Z';
const now = '2026-09-26T10:00:00Z';
function post(overrides = {}) {
  return {id: 'ABC_123', url: 'https://www.threads.com/@example/post/ABC_123', text: 'AI 設計的學習筆記',
    author: 'example', publishedAt: null, savedAt, lastOpenedAt: savedAt, openCount: 1, manual: false, tags: [], note: '', ...overrides};
}
function library(posts = [post()], overrides = {}) { return {schemaVersion: 1, enabled: false, revision: 0, posts, ...overrides}; }

test('untrusted imports reject wrong schemas, dangerous URLs, unexpected fields and oversized data', () => {
  for (const value of [null, [], {}, library([], {schemaVersion: 2}), library([], {enabled: 'true'}), library([], {revision: -1})])
    assert.throws(() => normalizeLibrary(value));
  for (const url of ['javascript:alert(1)', 'http://threads.com/@x/post/ABC_123', 'https://threads.com.attacker.test/@x/post/ABC_123',
    'https://attacker@threads.com/@x/post/ABC_123', 'https://threads.com:8443/@x/post/ABC_123', 'https://threads.com/@x',
    'https://threads.com/@x/post/%41BC_123', 'https://threads.com/@x/post/ABC_123/extra'])
    assert.throws(() => normalizeLibrary(library([post({url})])), url);
  assert.throws(() => normalizeLibrary(library([post({id: 'wrong'})])));
  assert.throws(() => normalizeLibrary(library([post({text: 'a'.repeat(12001)})])));
  assert.throws(() => normalizeLibrary(library(Array.from({length: 1001}, () => post()))));
  assert.throws(() => normalizeLibrary(library([post({tags: [null]})])));
  assert.throws(() => normalizeLibrary(library([post({tags: ['\ud800']})])));
  assert.throws(() => normalizeLibrary(library([post({openCount: -1})])));
  const clean = normalizeLibrary(library([post({access_token: 'secret'})], {apiKey: 'secret'}));
  assert.equal(clean.apiKey, undefined);
  assert.equal(clean.posts[0].access_token, undefined);
});

test('URLs are canonicalized and post-code duplicates merge without inventing repeated reads', () => {
  const source = library([
    post({url: 'https://threads.net/@EXAMPLE/post/ABC_123/?xmt=secret#reply', tags: ['設計'], manual: true}),
    post({url: 'https://threads.com/@example/post/ABC_123', savedAt: '2026-09-26T09:00:00Z', lastOpenedAt: '2026-09-26T09:00:00Z', openCount: 3, tags: ['學習'], note: '自己的筆記'}),
  ]);
  const result = normalizeLibrary(source);
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].url, 'https://www.threads.com/@example/post/ABC_123');
  assert.equal(result.posts[0].savedAt, '2026-09-26T08:00:00.000Z');
  assert.equal(result.posts[0].lastOpenedAt, '2026-09-26T09:00:00.000Z');
  assert.equal(result.posts[0].openCount, 3);
  assert.equal(result.posts[0].manual, true);
  assert.deepEqual(result.posts[0].tags, ['設計', '學習']);
  assert.equal(result.posts[0].note, '自己的筆記');
  assert.equal(source.posts[0].savedAt, savedAt, 'normalization must not mutate the source');
});

test('unknown publication time stays null; collection charts and filtering use only savedAt', () => {
  const data = personalDataset(library([
    post(),
    post({id: 'older', url: 'https://www.threads.com/@example/post/older', publishedAt: '2021-06-01T09:30:00+08:00'}),
  ]), {now});
  validate(data);
  assert.equal(data.posts[0].originalPublishedAt, null);
  assert.equal(data.posts[1].originalPublishedAt, '2021-06-01T01:30:00.000Z');
  assert.equal(data.posts[0].timestamp, '2026-09-26T08:00:00.000Z');
  assert.equal(filterPosts(data, {period: '1'}).length, 2);
  assert.deepEqual(monthBins(data.posts), [['2026-09', 2]]);
  for (const bad of ['not-a-date', '2026-09-26', '2026-02-30T00:00:00Z', '2026-09-26T24:00:00Z', '2026-09-26T00:00:00+14:01'])
    assert.throws(() => normalizeLibrary(library([post({savedAt: bad})])), bad);
  assert.throws(() => normalizeLibrary(library([post({publishedAt: undefined})])));
  assert.throws(() => normalizeLibrary(library([post({lastOpenedAt: '2026-09-25T08:00:00Z'})])));
});

test('classification is deterministic, transparent and produces graph edges from real shared posts only', () => {
  const raw = library([post({tags: ['自己的專題', '設計'], text: 'AI 設計也需要學習，不代表認同這篇文章。'})]);
  const first = personalDataset(raw, {now}), second = personalDataset(raw, {now});
  assert.deepEqual(first, second);
  validate(first);
  assert.equal(first.scope, 'personal');
  assert.deepEqual(new Set(first.posts[0].topics), new Set(['tag:%E8%87%AA%E5%B7%B1%E7%9A%84%E5%B0%88%E9%A1%8C', 'design', 'ai', 'learning']));
  assert.equal(first.posts[0].classification.method, 'local-keyword-rules-v1');
  assert.ok(first.posts[0].classification.matches.some(match => match.source === 'tag' && match.topicId === 'design'));
  assert.ok(first.posts[0].classification.matches.some(match => match.source === 'text' && match.terms.includes('AI')));
  assert.equal(first.posts[0].classification.reviewed, false);
  assert.match(first.posts[0].summary, /未人工核對/);
  const graph = makeGraph(first, first.posts);
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.edges.length, 6);
  for (const edge of graph.edges) assert.deepEqual(edge.postIds, ['ABC_123']);
  const noFalseAI = personalDataset(library([post({text: 'Taiwan mail inbox'})]), {now});
  assert.deepEqual(noFalseAI.posts[0].topics, ['uncategorized']);
});

test('imports variable ISO fractional precision without changing timezone or inventing publication time', () => {
  for (const [value, expected] of [
    ['2026-09-26T08:00:00.1Z', '2026-09-26T08:00:00.100Z'],
    ['2026-09-26T10:32:15.733329+00:00', '2026-09-26T10:32:15.733Z'],
    ['2026-09-26T18:32:15.733329+08:00', '2026-09-26T10:32:15.733Z'],
    ['2026-09-26T06:02:15.733329123-04:30', '2026-09-26T10:32:15.733Z'],
  ]) {
    const raw = library([post({savedAt: value, lastOpenedAt: value})]);
    const clean = normalizeLibrary(raw);
    const dataset = personalDataset(clean, {now: '2026-09-26T12:00:00.123456789Z'});
    validate(dataset);
    assert.equal(clean.posts[0].savedAt, expected);
    assert.equal(clean.posts[0].lastOpenedAt, expected);
    assert.equal(dataset.posts[0].timestamp, expected);
    assert.equal(dataset.posts[0].originalPublishedAt, null);
    assert.equal(dataset.capturedAt, '2026-09-26T12:00:00.123Z');
    assert.deepEqual(normalizeLibrary(clean), clean, 'canonical timestamps must survive a second import');
  }
  for (const value of ['2026-09-26T08:00:00.Z', '2026-09-26T08:00:00.123456',
    '2026-02-30T08:00:00.123456Z', '2026-09-26T08:00:00.123456+14:01'])
    assert.throws(() => normalizeLibrary(library([post({savedAt: value, lastOpenedAt: value})])), value);
});

test('manual-only mode separates explicit saves from opening and empty libraries have no fake nodes', () => {
  const data = personalDataset(library([post(), post({id: 'manual', url: 'https://threads.com/@example/post/manual', text: '感情與情緒價值', manual: true})]), {mode: 'manual', now});
  assert.equal(data.posts.length, 1);
  assert.equal(data.posts[0].id, 'manual');
  assert.deepEqual(data.posts[0].topics, ['love', 'value']);
  assert.equal(data.topics.some(topic => topic.id === 'design'), false);
  const empty = personalDataset(library([]), {now});
  validate(empty);
  assert.deepEqual(empty.posts, []);
  assert.deepEqual(empty.topics, []);
  assert.throws(() => personalDataset(library(), {mode: 'likes', now}));
  assert.throws(() => personalDataset(library(), {now: null}));
  assert.throws(() => personalDataset(library(), {now: '2026-02-30T00:00:00Z'}));
});

test('markup remains text and does not become an executable DOM value or a source link', () => {
  const text = '<img src=x onerror="alert(1)">';
  const data = personalDataset(library([post({text, note: '<script>secret()</script>', tags: ['<b>標籤</b>']})]), {now});
  assert.equal(data.posts[0].text, text);
  assert.ok(data.posts[0].summary.includes(text));
  assert.equal(data.posts[0].note, '<script>secret()</script>');
  assert.equal(data.topics[0].label, '<b>標籤</b>');
  assert.equal(typeof data.posts[0].classification, 'object');
  assert.equal(data.posts[0].url, 'https://www.threads.com/@example/post/ABC_123');
  assert.ok(data.posts[0].topics[0].startsWith('tag:%3C'));
});
