import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {canonicalPost, capturePost, isStarPage, normalizeLibrary, MAX_POSTS, MAX_TEXT} from '../extension/library.mjs';

const URL = 'https://www.threads.com/@example/post/ABC_123';
const date = '2026-09-26T10:00:00.000Z';
const post = {url: URL, text: '這是主貼文\n關於溝通與情緒價值。', publishedAt: null};

test('extension accepts only canonical Threads permalinks and exact local website origins', () => {
  assert.deepEqual(canonicalPost('https://threads.net/@example/post/ABC_123/?x=1#z'), {url: URL, id: 'ABC_123', author: 'example'});
  for (const input of ['https://threads.com.evil.test/@example/post/ABC_123', 'http://www.threads.com/@example/post/ABC_123', 'https://user:secret@www.threads.com/@example/post/ABC_123', 'https://www.threads.com:456/@example/post/ABC_123', 'https://www.threads.com/@example', 'javascript:alert(1)', 'https://www.threads.com/@example/post/ABC_123/replies']) assert.equal(canonicalPost(input), null);
  assert.equal(isStarPage('http://localhost:8765/?library=personal'), true);
  assert.equal(isStarPage('http://127.0.0.1:8765/index.html'), true);
  assert.equal(isStarPage('https://diffusework-wq.github.io/threads-atlas/?library=personal'), true);
  for (const address of ['https://diffusework-wq.github.io/other/', 'https://other.github.io/threads-atlas/', 'https://diffusework-wq.github.io/threads-atlas/other.html']) assert.equal(isStarPage(address), false);
  for (const input of ['http://localhost:8766/', 'https://localhost:8765/', 'http://localhost:8765/other.html', 'http://127.0.0.1.evil.test:8765/']) assert.equal(isStarPage(input), false);
});

test('extension defaults off, retains explicit collections and cannot invent source dates', () => {
  const empty = normalizeLibrary();
  assert.equal(empty.enabled, false);
  assert.throws(() => capturePost(empty, post), /暫停/);
  const first = capturePost(empty, post, {manual: true, now: date});
  assert.equal(first.posts[0].manual, true);
  assert.equal(first.posts[0].publishedAt, null);
  first.posts[0].note = '我的筆記';
  first.posts[0].tags = ['情緒'];
  const again = capturePost({...first, enabled: true}, {...post, text: '短文'}, {now: date});
  assert.equal(again.posts.length, 1);
  assert.equal(again.posts[0].openCount, 2);
  assert.equal(again.posts[0].text, post.text);
  assert.equal(again.posts[0].manual, true);
  assert.equal(again.posts[0].note, '我的筆記');
  assert.deepEqual(again.posts[0].tags, ['情緒']);
});

test('extension bounds content and never silently evicts a full collection', () => {
  const input = {...post, text: 'a'.repeat(MAX_TEXT + 30), publishedAt: 'not a date', author: 'forged-author', savedAt: date, tags: Array.from({length: 50}, (_,i) => `標籤${i}`)};
  const normalized = normalizeLibrary({posts: [input, input, {...post, url: 'https://evil.test/'}]});
  assert.equal(normalized.posts.length, 1);
  assert.equal(normalized.posts[0].text.length, MAX_TEXT);
  assert.equal(normalized.posts[0].author, 'example');
  assert.equal(normalized.posts[0].publishedAt, null);
  assert.equal(normalized.posts[0].tags.length, 30);
  const full = normalizeLibrary({enabled: true, posts: Array.from({length: MAX_POSTS}, (_, i) => ({...post, url: `https://www.threads.com/@example/post/POST${i}`}))});
  assert.throws(() => capturePost(full, post), /1,000/);
  assert.equal(full.posts.length, MAX_POSTS);
});

let instance = 0;
async function worker() {
  const data = {};
  const session = {};
  const access = [];
  let listener;
  function storage(values) {
    return {
      async setAccessLevel(level) {access.push(level);},
      async get(keys) {
        if (typeof keys === 'string') keys = [keys];
        return structuredClone(Object.fromEntries(keys.filter(key => key in values).map(key => [key, values[key]])));
      },
      async set(next) {Object.assign(values, structuredClone(next));},
      async remove(key) {delete values[key];}
    };
  }
  globalThis.chrome = {
    storage: {local: storage(data), session: storage(session)},
    runtime: {id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path}`, onMessage: {addListener(fn) {listener = fn;}}},
    tabs: {async get() {return {id: 3, url: URL};}, async query() {return [{id: 9}];}, async sendMessage() {return undefined;}}
  };
  await import(`../extension/background.mjs?test=${++instance}`);
  const star = {id: 'test-extension', tab: {id: 9}, frameId: 0, url: 'http://127.0.0.1:8765/'};
  const threads = {id: 'test-extension', tab: {id: 3}, frameId: 0, url: URL};
  const popup = {id: 'test-extension', url: 'chrome-extension://test-extension/popup.html'};
  function send(action, payload = {}, sender = star) {
    return new Promise(resolve => listener({channel: 'threads-atlas-extension', action, payload}, sender, resolve));
  }
  return {data, session, access, send, star, threads, popup};
}

test('worker rejects unrelated origins, frames and content scripts reading the private library', async () => {
  const w = await worker();
  assert.deepEqual(w.access, [{accessLevel: 'TRUSTED_CONTEXTS'}]);
  const result = await w.send('getLibrary');
  assert.equal(result.ok, true);
  assert.equal(result.library.enabled, false);
  for (const sender of [{...w.star, id: 'other-extension'}, {...w.star, frameId: 2}, {...w.star, url: 'http://localhost:8766/'}, {...w.star, url: 'https://evil.test/'}, w.threads]) assert.equal((await w.send('getLibrary', {}, sender)).ok, false);
  assert.equal((await w.send('capture', {post, visitId: 'a-first-visit'}, w.star)).ok, false);
  assert.equal((await w.send('setEnabled', {enabled: true}, w.threads)).ok, false);
  assert.equal((await w.send('getLibrary', {}, w.popup)).ok, true);
});

test('worker deduplicates SPA events and serializes concurrent real visits without lost updates', async () => {
  const w = await worker();
  await w.send('setEnabled', {enabled: true});
  const first = await w.send('capture', {post, visitId: 'visit-0000001', manual: false}, w.threads);
  assert.equal(first.ok, true);
  assert.equal(first.library, undefined, 'Threads content script receives only capture result, never full private library');
  const duplicate = await w.send('capture', {post, visitId: 'visit-0000001'}, w.threads);
  assert.equal(duplicate.duplicate, true);
  assert.equal((await w.send('getLibrary')).library.posts[0].openCount, 1);
  const marked = await w.send('capture', {post, visitId: 'visit-0000001', manual: true}, w.threads);
  assert.equal(marked.ok, true);
  assert.equal((await w.send('getLibrary')).library.posts[0].openCount, 1, 'manual bookmark after auto capture is not an additional reading');
  assert.equal((await w.send('getLibrary')).library.posts[0].manual, true);
  await Promise.all(Array.from({length: 10}, (_, i) => w.send('capture', {post, visitId: `visit-new-${String(i).padStart(4, '0')}`}, w.threads)));
  const result = await w.send('getLibrary');
  assert.equal(result.library.posts.length, 1);
  assert.equal(result.library.posts[0].openCount, 11);
  assert.equal((await w.send('capture', {post: {...post, url: 'https://www.threads.com/@other/post/OTHER'}, visitId: 'visit-bad-123'}, w.threads)).ok, false);
  assert.equal((await w.send('capture', {post: {...post, url: 'https://www.threads.com/@spoofed/post/ABC_123'}, visitId: 'visit-spoofed'}, w.threads)).ok, false);
  await w.send('setEnabled', {enabled: false});
  assert.equal((await w.send('capture', {post, visitId: 'visit-paused'}, w.threads)).ok, false);
  assert.equal((await w.send('capture', {post, visitId: 'visit-manual', manual: true}, w.threads)).ok, true);
});

test('worker undo is scoped to its source tab and restores prior state; deleted rows restore only from trash', async () => {
  const w = await worker();
  await w.send('setEnabled', {enabled: true});
  const first = await w.send('capture', {post, visitId: 'visit-first-000'}, w.threads);
  assert.equal((await w.send('undoCapture', {token: first.undoToken}, {...w.threads, tab: {id: 44}})).ok, false);
  assert.equal((await w.send('undoCapture', {token: first.undoToken}, w.threads)).ok, true);
  assert.equal((await w.send('getLibrary')).library.posts.length, 0);
  await w.send('capture', {post, visitId: 'visit-second-000'}, w.threads);
  await w.send('markManual', {id: 'ABC_123', manual: true});
  const next = await w.send('capture', {post, visitId: 'visit-third-000'}, w.threads);
  await w.send('undoCapture', {token: next.undoToken}, w.threads);
  assert.equal((await w.send('getLibrary')).library.posts[0].openCount, 1);
  assert.equal((await w.send('getLibrary')).library.posts[0].manual, true);
  const removed = await w.send('deletePost', {id: 'ABC_123'});
  assert.equal(removed.library.posts.length, 0);
  assert.equal((await w.send('restorePost', {id: 'unknown', post})).ok, false);
  const restored = await w.send('restorePost', {id: 'ABC_123'});
  assert.equal(restored.library.posts.length, 1);
  assert.equal(restored.library.posts[0].manual, true);
});

test('a notification failure does not misreport a successfully persisted capture', async () => {
  const w = await worker();
  globalThis.chrome.tabs.query = async () => {throw new Error('tab unavailable');};
  assert.equal((await w.send('setEnabled', {enabled: true})).ok, true);
  assert.equal((await w.send('capture', {post, visitId: 'visit-query-failure'}, w.threads)).ok, true);
  assert.equal((await w.send('getLibrary')).library.posts.length, 1);
});

test('bridge never sends private data unsolicited and ignores foreign windows, origins and non-whitelisted actions', async () => {
  const script = await readFile(new globalThis.URL('../extension/bridge.js', import.meta.url), 'utf8');
  function bridge(origin = 'http://127.0.0.1:8765', pathname = '/') {
    const posted = [];
    const sent = [];
    let pageListener;
    let extensionListener;
    const window = {
      postMessage(value, targetOrigin) {posted.push({value, targetOrigin});},
      addEventListener(type, fn) {if (type === 'message') pageListener = fn;}
    };
    window.top = window;
    const chrome = {runtime: {
      async sendMessage(message) {sent.push(message); return {ok: true, library: {schemaVersion: 1, enabled: false, revision: 1, posts: []}};},
      onMessage: {addListener(fn) {extensionListener = fn;}}
    }};
    vm.runInNewContext(script, {window, location: {origin, pathname}, chrome});
    return {window, posted, sent, pageListener, extensionListener};
  }
  for (const [origin, path] of [['http://localhost:8766', '/'], ['http://127.0.0.1:8765', '/other'], ['https://example.test', '/']]) assert.equal(bridge(origin, path).pageListener, undefined);
  assert.equal(typeof bridge('https://diffusework-wq.github.io', '/threads-atlas/').pageListener, 'function');
  assert.equal(bridge('https://diffusework-wq.github.io', '/other/').pageListener, undefined);
  const b = bridge();
  assert.equal(b.posted.length, 1);
  assert.equal(b.posted[0].value.direction, 'changed');
  assert.equal(b.posted[0].value.library, undefined);
  const request = {channel: 'threads-atlas-local', direction: 'request', requestId: 'request-12345678', action: 'getLibrary', payload: {}};
  await b.pageListener({source: {}, origin: 'http://127.0.0.1:8765', data: request});
  await b.pageListener({source: b.window, origin: 'https://evil.test', data: request});
  await b.pageListener({source: b.window, origin: 'http://127.0.0.1:8765', data: {...request, action: 'capture'}});
  assert.equal(b.sent.length, 0);
  await b.pageListener({source: b.window, origin: 'http://127.0.0.1:8765', data: request});
  assert.equal(b.sent.length, 1);
  assert.equal(b.posted.at(-1).value.requestId, request.requestId);
  assert.equal(b.posted.at(-1).value.ok, true);
  assert.equal(b.posted.at(-1).targetOrigin, 'http://127.0.0.1:8765');
  b.extensionListener({type: 'threads-atlas-changed'});
  assert.equal(b.posted.at(-1).value.direction, 'changed');
  assert.equal(b.posted.at(-1).value.library, undefined);
});

test('collector recognizes real Threads SVG title-only Reply labels as well as aria-label variants', async () => {
  const script = await readFile(new globalThis.URL('../extension/dom-helpers.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(script, context);
  const {isReplyControl} = context.ThreadsAtlasDOM;
  function element(name, attributes = {}, children = [], textContent = '') {
    return {
      localName: name, textContent,
      getAttribute(key) {return attributes[key] ?? null;},
      querySelectorAll() {return children;}
    };
  }
  // Observed DOM: div[role=button] > svg[role=img][title=Reply] > title with text Reply.
  const title = element('title', {}, [], 'Reply');
  const svg = element('svg', {role: 'img', title: 'Reply'}, [title]);
  const button = element('div', {role: 'button'}, [svg, title], 'Reply12.9K');
  assert.equal(isReplyControl(button), true);
  assert.equal(isReplyControl(svg), true);
  assert.equal(isReplyControl(element('div', {role: 'button'}, [element('svg', {'aria-label': 'Reply'})])), true);
  assert.equal(isReplyControl(element('button', {'aria-label': '回覆'})), true);
  assert.equal(isReplyControl(element('div', {role: 'button'}, [element('svg', {title: 'Like'})], 'Reply in ordinary text')), false);
  assert.equal(isReplyControl(element('span', {}, [], 'Reply')), false);
  assert.equal(isReplyControl(null), false);
});


test('SPA capture uses the current Chrome tab URL, and feed saves require explicit manual action', async () => {
  const w = await worker();
  await w.send('setEnabled', {enabled: true});
  const stale = {...w.threads, url: 'https://www.threads.com/'};
  assert.equal((await w.send('capture', {post, visitId: 'spa-visit-000'}, stale)).ok, true);
  globalThis.chrome.tabs.get = async () => ({id: 3, url: 'https://www.threads.com/'});
  assert.equal((await w.send('capture', {post, visitId: 'feed-auto-000'}, stale)).ok, false);
  assert.equal((await w.send('captureVisiblePost', {post, visitId: 'feed-false-00', manual: false}, stale)).ok, false);
  await w.send('setEnabled', {enabled: false});
  assert.equal((await w.send('captureVisiblePost', {post, visitId: 'feed-manual-0', manual: true}, stale)).ok, true);
  assert.equal((await w.send('getLibrary')).library.posts[0].manual, true);
  assert.equal((await w.send('captureVisiblePost', {post, visitId: 'website-test', manual: true}, w.star)).ok, false);
  globalThis.chrome.tabs.get = async () => ({id: 3, url: 'https://example.com/'});
  assert.equal((await w.send('captureVisiblePost', {post, visitId: 'left-threads', manual: true}, stale)).ok, false);
});


test('saving a card on the feed does not invent a detail-page opening', async () => {
  const w = await worker();
  globalThis.chrome.tabs.get = async () => ({id: 3, url: 'https://www.threads.com/'});
  const result = await w.send('captureVisiblePost', {post, visitId: 'feed-only-save', manual: true}, {...w.threads, url: 'https://www.threads.com/'});
  assert.equal(result.ok, true);
  const saved = (await w.send('getLibrary')).library.posts[0];
  assert.equal(saved.openCount, 0);
  assert.equal(saved.manual, true);
});
