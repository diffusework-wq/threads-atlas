// Pure local adapter: this module never sends private posts over the network.
const MAX_POSTS = 1000;
const HOSTS = new Set(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net']);
const RULE_VERSION = 'local-keyword-rules-v1';
const RULES = [
  ['aa', 'AA 男', 'boundary', ['AA', 'AA制', '分帳', '各付各的']],
  ['unread', '不讀不回', 'emotion', ['不讀不回', '已讀不回', '回訊息', '回覆訊息']],
  ['love', '感情', 'relationship', ['感情', '戀愛', '戀人', '伴侶', '男友', '女友', '情侶']],
  ['marriage', '婚姻問題', 'relationship', ['婚姻', '結婚', '離婚', '夫妻', '婚姻問題']],
  ['affair', '出軌', 'boundary', ['出軌', '劈腿', '外遇']],
  ['friendship', '純友誼', 'relationship', ['純友誼', '純友情', '異性朋友', '男女之間的友誼']],
  ['support', '接住情緒', 'emotion', ['接住情緒', '情緒支持', '傾聽', '陪伴']],
  ['breakup', '要不要分手', 'relationship', ['要不要分手', '分手', '復合']],
  ['value', '情緒價值', 'emotion', ['情緒價值', '情绪价值']],
  ['technology', '科技', 'boundary', ['科技', '技術', '程式', '軟體', '開源', 'javascript', 'python', 'github', 'API']],
  ['ai', '人工智慧', 'boundary', ['人工智慧', '人工智能', '生成式', '大語言模型', 'AI', 'ChatGPT', 'Claude', 'LLM']],
  ['design', '設計', 'boundary', ['設計', '排版', '字體', '配色', '視覺', 'Figma', 'UI', 'UX']],
  ['marketing', '行銷', 'relationship', ['行銷', '營銷', '廣告', '品牌', '內容創作', '創作者', 'SEO']],
  ['learning', '學習', 'boundary', ['學習', '讀書', '課程', '補習', '高中生', '考試', '教學']],
  ['work', '工作與職涯', 'relationship', ['工作', '職場', '職涯', '面試', '履歷', '求職', '創業']],
  ['travel', '旅行', 'relationship', ['旅行', '旅遊', '景點', '行程', '出國', '住宿']],
  ['food', '飲食', 'relationship', ['美食', '料理', '餐廳', '咖啡', '食譜', '甜點']],
  ['health', '生活與健康', 'emotion', ['運動', '睡眠', '健康', '健身', '散步', '休息']],
].map(([id, label, group, terms]) => ({id, label, group, terms}));
const RULE_BY_LABEL = new Map(RULES.map(rule => [rule.label.toLowerCase(), rule]));

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function boundedString(value, limit, label) {
  if (typeof value !== 'string' || value.length > limit) throw Error(`${label}必須是最多 ${limit} 字元的文字`);
  // Keep markup as inert text. The UI must continue to render all imported text with textContent.
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').normalize('NFC').trim();
}

function iso(value, label) {
  if (typeof value !== 'string' || value.length > 128) throw Error(`${label}必須是含時區的 ISO 日期`);
  // Backups can contain Python microseconds or nanoseconds. JavaScript preserves
  // milliseconds; accept the extra precision and canonicalize it consistently.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!m) throw Error(`${label}必須是含時區的 ISO 日期`);
  const [, year, month, day, hour, minute, second] = m.map((part, index) => index > 0 && index < 7 ? Number(part) : part);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const offsetHour = Number(m[9] || 0), offsetMinute = Number(m[10] || 0);
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59
      || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)
      || !Number.isFinite(Date.parse(value))) throw Error(`${label}不是有效日期`);
  return new Date(value).toISOString();
}

function canonicalPost(value) {
  if (typeof value !== 'string' || value.length > 2048) throw Error('原文連結格式無效');
  let url;
  try { url = new URL(value); } catch { throw Error('原文連結格式無效'); }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) || url.username || url.password || url.port)
    throw Error('只接受不含帳密的 HTTPS Threads 貼文連結');
  const match = /^\/@([A-Za-z0-9._]{1,30})\/post\/([A-Za-z0-9_-]{1,128})\/?$/.exec(url.pathname);
  if (!match) throw Error('連結必須指向 Threads 的單一貼文');
  return {id: match[2], url: `https://www.threads.com/@${match[1].toLowerCase()}/post/${match[2]}`};
}

function tags(value) {
  if (!Array.isArray(value) || value.length > 30) throw Error('每篇貼文最多可有 30 個標籤');
  const unique = new Map();
  for (const tag of value) {
    const label = boundedString(tag, 64, '標籤').replace(/^#+\s*/, '');
    if (!label) continue;
    // encodeURIComponent below must never receive a lone UTF-16 surrogate.
    try { encodeURIComponent(label); } catch { throw Error('標籤含有無效文字'); }
    if (!unique.has(label.toLowerCase())) unique.set(label.toLowerCase(), label);
  }
  return [...unique.values()];
}

/** Validate and copy an extension export. Invalid imports fail atomically rather than partly importing. */
export function normalizeLibrary(value) {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.enabled !== 'boolean'
      || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.posts))
    throw Error('個人資料格式無效：需要 schemaVersion 1、enabled、revision 與 posts');
  if (value.posts.length > MAX_POSTS) throw Error(`最多可匯入 ${MAX_POSTS} 篇貼文`);
  const unique = new Map();
  for (const [index, raw] of value.posts.entries()) {
    if (!object(raw)) throw Error(`第 ${index + 1} 篇貼文格式無效`);
    const source = canonicalPost(raw.url);
    if (raw.id !== source.id) throw Error(`第 ${index + 1} 篇貼文的 ID 與原文連結不一致`);
    if (typeof raw.manual !== 'boolean' || !Number.isSafeInteger(raw.openCount) || raw.openCount < 0 || raw.openCount > 1000000)
      throw Error(`第 ${index + 1} 篇貼文的收藏或開啟次數無效`);
    const savedAt = iso(raw.savedAt, '收錄時間');
    const lastOpenedAt = iso(raw.lastOpenedAt, '最後開啟時間');
    if (Date.parse(lastOpenedAt) < Date.parse(savedAt)) throw Error('最後開啟時間不能早於收錄時間');
    const post = {
      ...source,
      text: boundedString(raw.text, 12000, '貼文內容'),
      author: boundedString(raw.author, 100, '作者'),
      publishedAt: raw.publishedAt === null ? null : iso(raw.publishedAt, '原始發文時間'),
      savedAt, lastOpenedAt,
      openCount: raw.openCount, manual: raw.manual,
      tags: tags(raw.tags), note: boundedString(raw.note, 2000, '筆記'),
    };
    const previous = unique.get(post.id);
    if (!previous) { unique.set(post.id, post); continue; }
    const latest = Date.parse(post.lastOpenedAt) >= Date.parse(previous.lastOpenedAt) ? post : previous;
    const older = latest === post ? previous : post;
    // Repeated imports must not inflate the read count. Merge the strongest known evidence only.
    unique.set(post.id, {
      ...latest,
      text: latest.text || older.text,
      publishedAt: latest.publishedAt || older.publishedAt,
      savedAt: Date.parse(post.savedAt) < Date.parse(previous.savedAt) ? post.savedAt : previous.savedAt,
      openCount: Math.max(post.openCount, previous.openCount),
      manual: post.manual || previous.manual,
      tags: tags([...new Set([...previous.tags, ...post.tags])]),
      note: latest.note || older.note,
    });
  }
  return {schemaVersion: 1, enabled: value.enabled, revision: value.revision,
    posts: [...unique.values()].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt) || a.id.localeCompare(b.id))};
}

function containsTerm(text, term) {
  const lower = term.toLowerCase();
  if (/^[a-z0-9]+$/i.test(lower)) {
    // English initialisms are words: "AI" must not match "Taiwan" or "mail".
    return new RegExp(`(?:^|[^a-z0-9])${lower}(?=$|[^a-z0-9])`, 'i').test(text);
  }
  return text.includes(lower);
}

function topic(rule, explicit = false) {
  return {id: rule.id, label: rule.label, group: rule.group, seed: true,
    description: explicit ? '由你提供的標籤形成的話題。連線表示同一篇收錄貼文具有多個分類。'
      : `由手動標籤或本機對「${rule.terms.join('、')}」等貼文字詞的比對分類，尚未人工確認；不代表你的立場。`,
    angles: [`挑一篇「${rule.label}」的收錄文章，記下你想繼續追問的問題。`,
      '比較兩則相關貼文的觀點，保留原文脈絡與你的筆記。',
      '把自己的經驗與原文分開寫，整理下一篇創作的線索。']};
}

/** Turn private captures into the same graph shape as the public sample, without claiming population trends. */
export function personalDataset(value, {mode = 'all', now = new Date()} = {}) {
  if (!['all', 'manual'].includes(mode)) throw Error('個人資料模式必須是 all 或 manual');
  const library = normalizeLibrary(value);
  let capturedAt;
  try {
    if (typeof now === 'string') capturedAt = iso(now, '資料整理時間');
    else if (now instanceof Date || typeof now === 'number') capturedAt = new Date(now).toISOString();
    else throw Error('invalid time');
  } catch { throw Error('資料整理時間無效'); }
  const topics = new Map();
  const posts = library.posts.filter(post => mode === 'all' || post.manual).map(post => {
    const postTopics = new Set(), matches = [];
    for (const label of post.tags) {
      const known = RULE_BY_LABEL.get(label.toLowerCase());
      const item = known || {id: `tag:${encodeURIComponent(label.toLowerCase())}`, label, group: 'boundary', terms: []};
      if (!topics.has(item.id)) topics.set(item.id, topic(item, !known));
      postTopics.add(item.id);
      matches.push({topicId: item.id, source: 'tag', terms: [label]});
    }
    const text = post.text.toLowerCase();
    for (const rule of RULES) {
      const terms = rule.terms.filter(term => containsTerm(text, term));
      if (!terms.length) continue;
      if (!topics.has(rule.id)) topics.set(rule.id, topic(rule));
      postTopics.add(rule.id);
      matches.push({topicId: rule.id, source: 'text', terms});
    }
    if (!postTopics.size) {
      const id = 'uncategorized';
      postTopics.add(id);
      if (!topics.has(id)) topics.set(id, {id, label: '待分類', group: 'boundary', seed: true,
        description: '沒有符合目前的本機關鍵字，也沒有手動標籤。你可以加上自己的分類。', angles: []});
      matches.push({topicId: id, source: 'fallback', terms: []});
    }
    return {...post, timestamp: post.savedAt, originalPublishedAt: post.publishedAt, kind: 'personal',
      summary: post.text ? `貼文摘錄（自動擷取，未人工核對）：${post.text.slice(0, 560)}${post.text.length > 560 ? '…' : ''}`
        : '尚未取得貼文文字，僅保存原文連結。',
      topics: [...postTopics],
      classification: {method: RULE_VERSION, reviewed: false, matches},
    };
  });
  return {version: 1, capturedAt, scope: 'personal', mode: mode === 'manual' ? 'personal_manual' : 'personal_attention',
    topics: [...topics.values()], posts,
    note: '這是此瀏覽器的個人收錄資料，不代表 Threads 或台灣全量趨勢。自動收錄只表示開啟過，不代表喜歡或認同。時間圖使用收錄時間，原文發文時間未知時保持空白。分類由本機關鍵字與手動標籤產生；連線表示同一篇貼文的共同分類，尚未人工核對。'};
}
