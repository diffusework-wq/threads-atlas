import {canonicalPost, capturePost, isStarPage, isThreadsPage, normalizeLibrary, MAX_POSTS} from './library.mjs';

const KEY = 'threadsAtlasLibrary';
const TRASH = 'threadsAtlasTrash';
const RECEIPTS = 'threadsAtlasVisits';
let queue = Promise.resolve();
const ready = chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
const pageActions = new Set(['getLibrary', 'setEnabled', 'deletePost', 'markManual', 'restorePost']);
const popupURL = chrome.runtime.getURL('popup.html');

function sourceOf(sender) {
  if (sender.id !== chrome.runtime.id) throw new Error('不允許的來源。');
  if (!sender.tab && sender.url === popupURL) return 'popup';
  if (!sender.tab || sender.frameId !== 0) throw new Error('只接受主頁面的操作。');
  if (isStarPage(sender.url)) return 'star';
  if (isThreadsPage(sender.url)) return 'threads';
  throw new Error('此頁面不在本機星圖的允許範圍內。');
}

async function broadcast(library) {
  let tabs;
  try { tabs = await chrome.tabs.query({url: ['https://diffusework-wq.github.io/threads-atlas/*', 'http://127.0.0.1/*', 'http://localhost/*', 'https://www.threads.com/*', 'https://threads.com/*', 'https://www.threads.net/*', 'https://threads.net/*']}); }
  catch { return; } // A closed/unavailable tab must not turn an already-saved record into a reported failure.
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, {type: 'threads-atlas-changed', revision: library.revision, enabled: library.enabled})));
}

async function handle(message, sender) {
  await ready;
  const source = sourceOf(sender);
  if (!message || message.channel !== 'threads-atlas-extension' || typeof message.action !== 'string') throw new Error('無效的操作。');
  const action = message.action;
  const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
  if (source === 'star' && !pageActions.has(action)) throw new Error('網站不能新增任意貼文。');
  if (source === 'threads' && !['getSettings', 'capture', 'captureVisiblePost', 'undoCapture'].includes(action)) throw new Error('Threads 頁面不能讀取私人收藏庫。');
  const stored = await chrome.storage.local.get([KEY, TRASH, RECEIPTS]);
  let library = normalizeLibrary(stored[KEY]);
  let trash = Array.isArray(stored[TRASH]) ? stored[TRASH].slice(-30) : [];
  let visits = Array.isArray(stored[RECEIPTS]) ? stored[RECEIPTS].slice(-300) : [];
  const previousRevision = library.revision;

  if (action === 'getSettings') return {ok: true, enabled: library.enabled};
  if (action === 'getLibrary' && source !== 'threads') return {ok: true, library};
  if (action === 'setEnabled' && source !== 'threads') {
    if (typeof payload.enabled !== 'boolean') throw new Error('收錄設定必須為開啟或關閉。');
    library = {...library, enabled: payload.enabled, revision: library.revision + 1};
  } else if (['capture', 'captureVisiblePost'].includes(action) && source === 'threads') {
    const post = canonicalPost(payload.post?.url);
    // sender.url belongs to the injected document and can retain its pre-SPA URL.
    // Query Chrome for the current tab URL rather than trusting a page-supplied URL.
    const tab = await chrome.tabs.get(sender.tab.id);
    if (!isThreadsPage(tab.url)) throw new Error('來源分頁已離開 Threads，請重新開啟貼文。');
    const current = canonicalPost(tab.url);
    const explicitCard = action === 'captureVisiblePost' && payload.manual === true;
    if (!post || (!explicitCard && (!current || current.url !== post.url))) throw new Error('請先開啟該篇主貼文詳情，再進行收錄。');
    if (typeof payload.visitId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(payload.visitId)) throw new Error('缺少有效的閱讀事件。');
    const old = library.posts.find(p => p.id === post.id) || null;
    const visitKey = `${sender.tab.id}:${post.id}:${payload.visitId}`;
    const duplicate = visits.includes(visitKey);
    if (duplicate && !(payload.manual === true && !old?.manual)) return {ok: true, duplicate: true, id: post.id};
    library = capturePost(library, payload.post, {manual: payload.manual === true, opened: current?.url === post.url});
    if (duplicate && old) {
      // Bookmarking a post after it was auto-recorded is still one reading event.
      library.posts = library.posts.map(p => p.id === post.id ? {...p, openCount: old.openCount, lastOpenedAt: old.lastOpenedAt} : p);
    }
    visits = [...visits.filter(key => key !== visitKey), visitKey].slice(-300);
    // The token lets only this tab undo its own latest capture; previous data is retained.
    const undoToken = crypto.randomUUID();
    const captureUndo = {token: undoToken, tabId: sender.tab.id, postId: post.id, previous: old, revision: library.revision, expires: Date.now() + 30000};
    await chrome.storage.session.set({[`undo:${sender.tab.id}`]: captureUndo});
    await chrome.storage.local.set({[KEY]: library, [TRASH]: trash, [RECEIPTS]: visits});
    await broadcast(library);
    return {ok: true, id: post.id, undoToken, added: !old};
  } else if (action === 'undoCapture' && source === 'threads') {
    const key = `undo:${sender.tab.id}`;
    const undo = (await chrome.storage.session.get(key))[key];
    if (!undo || undo.token !== payload.token || undo.expires < Date.now()) throw new Error('復原期限已過，請到星圖刪除。');
    if (library.revision !== undo.revision) throw new Error('收藏庫已更新，請到星圖確認後刪除。');
    library.posts = library.posts.filter(p => p.id !== undo.postId);
    if (undo.previous) library.posts.unshift(undo.previous);
    library.revision += 1;
    await chrome.storage.session.remove(key);
  } else if (action === 'deletePost' && source !== 'threads') {
    const post = library.posts.find(p => p.id === payload.id);
    if (!post) throw new Error('找不到這篇收藏。');
    trash = [...trash.filter(p => p.id !== post.id), post].slice(-30);
    library = {...library, posts: library.posts.filter(p => p.id !== post.id), revision: library.revision + 1};
  } else if (action === 'restorePost' && source !== 'threads') {
    const post = trash.find(p => p.id === payload.id);
    if (!post) throw new Error('這篇貼文已不在可復原清單中。');
    if (library.posts.length >= MAX_POSTS) throw new Error('收藏庫已滿，無法復原。');
    if (library.posts.some(p => p.id === post.id)) throw new Error('這篇貼文已存在。');
    library = normalizeLibrary({...library, posts: [post, ...library.posts], revision: library.revision + 1});
    trash = trash.filter(p => p.id !== post.id);
  } else if (action === 'markManual' && source !== 'threads') {
    if (typeof payload.manual !== 'boolean' || !library.posts.some(p => p.id === payload.id)) throw new Error('無效的收藏標記。');
    library = {...library, posts: library.posts.map(p => p.id === payload.id ? {...p, manual: payload.manual} : p), revision: library.revision + 1};
  } else if (!['setEnabled', 'undoCapture'].includes(action)) {
    throw new Error('不支援的操作。');
  }
  if (library.revision !== previousRevision) {
    await chrome.storage.local.set({[KEY]: library, [TRASH]: trash, [RECEIPTS]: visits});
    await broadcast(library);
  }
  return source === 'threads' ? {ok: true} : {ok: true, library};
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const task = queue.then(() => handle(message, sender));
  queue = task.catch(() => {});
  task.then(respond, error => respond({ok: false, error: /quota/i.test(error?.message || '')
    ? 'Chrome 本機儲存空間已滿。請先匯出備份，再刪除部分收藏。'
    : error?.message || '本機收藏失敗。'}));
  return true;
});
