export const MAX_POSTS = 1000;
export const MAX_TEXT = 12000;
export const STAR_ORIGINS = new Set(['http://127.0.0.1:8765', 'http://localhost:8765']);
const THREAD_HOSTS = new Set(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net']);

export function canonicalPost(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !THREAD_HOSTS.has(url.hostname) || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/@([A-Za-z0-9._]{1,64})\/post\/([A-Za-z0-9_-]{1,128})\/?$/);
    return match ? {id: match[2], author: match[1], url: `https://www.threads.com/@${match[1]}/post/${match[2]}`} : null;
  } catch { return null; }
}

export function isThreadsPage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.port && THREAD_HOSTS.has(u.hostname); }
  catch { return false; }
}

export function isStarPage(value) {
  try { const u = new URL(value); return (STAR_ORIGINS.has(u.origin) && (u.pathname === '/' || u.pathname === '/index.html')) || (u.origin === 'https://diffusework-wq.github.io' && ['/threads-atlas/', '/threads-atlas/index.html'].includes(u.pathname)); }
  catch { return false; }
}

const dateOrNull = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export function normalizePost(value, now = new Date().toISOString()) {
  if (!value || typeof value !== 'object') return null;
  const canonical = canonicalPost(value.url);
  const text = typeof value.text === 'string' ? value.text.replace(/\u0000/g, '').trim().slice(0, MAX_TEXT) : '';
  if (!canonical || !text) return null;
  return {
    ...canonical, text, publishedAt: dateOrNull(value.publishedAt),
    savedAt: dateOrNull(value.savedAt) || now,
    lastOpenedAt: dateOrNull(value.lastOpenedAt) || now,
    openCount: Number.isSafeInteger(value.openCount) && value.openCount >= 0 ? Math.min(value.openCount, 1000000) : 1,
    manual: value.manual === true,
    tags: Array.isArray(value.tags) ? [...new Set(value.tags.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 64)).filter(Boolean))].slice(0, 30) : [],
    note: typeof value.note === 'string' ? value.note.slice(0, 2000) : ''
  };
}

export function normalizeLibrary(value, now = new Date().toISOString()) {
  const seen = new Set();
  const posts = [];
  for (const raw of (Array.isArray(value?.posts) ? value.posts : [])) {
    const post = normalizePost(raw, now);
    if (!post || seen.has(post.id)) continue;
    posts.push(post); seen.add(post.id);
    if (posts.length === MAX_POSTS) break;
  }
  return {schemaVersion: 1, enabled: value?.enabled === true, revision: Number.isSafeInteger(value?.revision) && value.revision >= 0 ? value.revision : 0, posts};
}

export function capturePost(library, input, {manual = false, opened = true, now = new Date().toISOString()} = {}) {
  if (!manual && !library.enabled) throw new Error('自動收錄已暫停。');
  const incoming = normalizePost({...input, manual, savedAt: now, lastOpenedAt: now, openCount: opened ? 1 : 0, tags: [], note: ''}, now);
  if (!incoming) throw new Error('沒有可確認的貼文文字與原文連結，請選取主貼文文字後手動儲存。');
  const index = library.posts.findIndex(p => p.id === incoming.id);
  const posts = [...library.posts];
  if (index >= 0) {
    const old = posts[index];
    // A new observation never removes a user's explicit bookmark, note or tags.
    posts[index] = {...old, url: incoming.url, author: incoming.author,
      text: incoming.text.length >= old.text.length ? incoming.text : old.text,
      publishedAt: incoming.publishedAt || old.publishedAt, lastOpenedAt: now,
      openCount: Math.min(old.openCount + (opened ? 1 : 0), 1000000), manual: old.manual || manual};
  } else {
    if (posts.length >= MAX_POSTS) throw new Error('已達本機試用版 1,000 篇上限。請先匯出備份並刪除部分貼文。');
    posts.unshift(incoming);
  }
  return {...library, revision: library.revision + 1, posts};
}
