(() => {
  'use strict';
  if (window !== window.top) return;
  const HOSTS = new Set(['www.threads.com', 'threads.com', 'www.threads.net', 'threads.net']);
  const MAX_TEXT = 12000;
  const EDITABLE = 'textarea,input,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
  const {isReplyControl} = globalThis.ThreadsAtlasDOM;
  let enabled = false;
  let route = null;
  let visitId = '';
  let savedVisit = '';
  let pendingVisit = '';
  let observeTimer = 0;
  let settleTimer = 0;
  let toastHost = null;
  let lastFailure = '';
  let initialized = false;
  let navigationIntentAt = 0;
  let eligibleVisit = false;
  let inspectUntil = 0;
  let scanTimer = 0;
  const cardButtons = new Map();
  const manuallySaved = new Set();
  const cardVisits = new Map();

  function canonical(value) {
    try {
      const u = new URL(value, location.origin);
      if (u.protocol !== 'https:' || !HOSTS.has(u.hostname) || u.port || u.username || u.password) return null;
      const m = u.pathname.match(/^\/@([A-Za-z0-9._]{1,64})\/post\/([A-Za-z0-9_-]{1,128})\/?$/);
      return m ? {id: m[2], author: m[1], url: `https://www.threads.com/@${m[1]}/post/${m[2]}`} : null;
    } catch { return null; }
  }

  const send = (action, payload = {}) => chrome.runtime.sendMessage({channel: 'threads-atlas-extension', action, payload});
  function displayed(element) {
    if (!(element instanceof Element) || !element.isConnected || element.closest('[hidden],[aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }

  function textOf(element, range = null) {
    // Read only rendered text nodes. Never inspect React state, network payloads or private endpoints.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const chunks = [];
    let textNode;
    while ((textNode = walker.nextNode())) {
      if (range && !range.intersectsNode(textNode)) continue;
      const parent = textNode.parentElement;
      if (!parent || !displayed(parent) || parent.closest(`button,[role="button"],time,script,style,${EDITABLE},[role="toolbar"]`)) continue;
      const anchor = parent.closest('a');
      if (anchor && (/^\/@[^/]+\/?$/.test(new URL(anchor.href, location.origin).pathname) || canonical(anchor.href))) continue;
      let value = textNode.textContent;
      if (range) value = value.slice(range.startContainer === textNode ? range.startOffset : 0, range.endContainer === textNode ? range.endOffset : undefined);
      value = value.trim();
      if (!value || /^\d+\s*\/\s*\d+$/.test(value)) continue;
      chunks.push(value);
    }
    return chunks.join(' ').replace(/[ \t]+/g, ' ').trim();
  }

  function textBlocks(root) {
    const candidates = [...root.querySelectorAll('[dir="auto"]')].filter(element => {
      if (!displayed(element) || element.closest(`a,button,[role="button"],time,${EDITABLE}`)) return false;
      const ancestor = element.parentElement?.closest('[dir="auto"]');
      return !ancestor || !root.contains(ancestor);
    });
    return candidates.map(element => textOf(element)).filter(Boolean);
  }

  function uniquePostIds(root) {
    return new Set([...root.querySelectorAll('a[href]')].map(a => canonical(a.href)?.id).filter(Boolean));
  }

  function cardFromLink(link) {
    const current = canonical(link.href);
    if (!current || !link.querySelector('time[datetime]') || !displayed(link)) return null;
    let ancestor = link.parentElement;
    for (let depth = 0; ancestor && depth < 16; depth++, ancestor = ancestor.parentElement) {
      if (ancestor === document.body || ancestor === document.documentElement) break;
      const ids = uniquePostIds(ancestor);
      if (ids.size > 1 || (ids.size === 1 && !ids.has(current.id))) break;
      if (ancestor.querySelectorAll('time[datetime]').length !== 1) continue;
      const blocks = textBlocks(ancestor);
      if (!blocks.length || blocks.join('\n').length < 1) continue;
      const reply = [...ancestor.querySelectorAll('button,[role="button"],svg')].some(isReplyControl);
      if (!reply && !ancestor.matches('article,[role="article"]')) continue;
      const rawDate = link.querySelector('time').getAttribute('datetime');
      return {root: ancestor, current, text: blocks.join('\n').slice(0, MAX_TEXT),
        publishedAt: Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null};
    }
    return null;
  }

  function mainCard(current) {
    const results = [...document.querySelectorAll('a[href]')]
      .filter(a => canonical(a.href)?.id === current.id && a.querySelector('time[datetime]'))
      .map(cardFromLink).filter(Boolean);
    if (!results.length || new Set(results.map(r => r.text)).size !== 1) return null;
    return results[0];
  }

  function scheduleButtons() {
    if (!scanTimer) scanTimer = setTimeout(() => {scanTimer = 0; decorateCards();}, 500);
  }

  function decorateCards() {
    for (const [root, entry] of cardButtons) {
      if (!root.isConnected || !entry.host.isConnected) {entry.host.remove(); cardButtons.delete(root);}
    }
    const links = [...document.querySelectorAll('a[href]')].filter(a => a.querySelector('time[datetime]'));
    let examined = 0;
    for (const link of links) {
      const rect = link.getBoundingClientRect();
      if (rect.bottom < -500 || rect.top > innerHeight + 500 || ++examined > 60) continue;
      const card = cardFromLink(link);
      if (!card) continue;
      const existing = cardButtons.get(card.root);
      if (existing?.id === card.current.id) continue;
      if (existing) {existing.host.remove(); cardButtons.delete(card.root);}
      const host = document.createElement('span');
      host.dataset.threadsAtlas = 'save';
      host.style.cssText = 'position:absolute;top:8px;right:44px;z-index:4;line-height:normal;';
      if (getComputedStyle(card.root).position === 'static') card.root.style.position = 'relative';
      const shadow = host.attachShadow({mode: 'closed'});
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = manuallySaved.has(card.current.id) ? '✓ 已收藏' : '☆ 存入星圖';
      button.title = '將這篇貼文存入你的本機星圖';
      button.setAttribute('aria-label', '存入星圖：@' + card.current.author);
      button.style.cssText = 'font:12px/1.4 system-ui;color:#c5bbff;background:#242030;border:1px solid #665687;border-radius:14px;padding:5px 9px;cursor:pointer;white-space:nowrap;';
      button.addEventListener('click', async event => {
        event.preventDefault(); event.stopPropagation();
        if (!event.isTrusted || button.disabled) return;
        const fresh = cardFromLink(link);
        if (!fresh || fresh.current.id !== card.current.id) {toast('貼文已變更，請重新點選此篇的存入星圖。'); scheduleButtons(); return;}
        button.disabled = true; button.textContent = '儲存中…';
        try {
          let id = route?.id === fresh.current.id ? visitId : cardVisits.get(fresh.current.id);
          if (!id) {id = crypto.randomUUID(); cardVisits.set(fresh.current.id, id);}
          const response = await send('captureVisiblePost', {post: {...fresh.current, text: fresh.text, publishedAt: fresh.publishedAt}, visitId: id, manual: true});
          if (!response?.ok) throw Error(response?.error || '本機儲存失敗');
          manuallySaved.add(fresh.current.id);
          if (route?.id === fresh.current.id) savedVisit = visitId;
          button.textContent = '✓ 已收藏';
          toast('已手動存入星圖', response.undoToken);
        } catch (error) {button.textContent = '重試存入'; toast('無法收錄：' + (error.message || '請重新整理 Threads'));}
        finally {button.disabled = false;}
      });
      shadow.append(button); card.root.append(host);
      cardButtons.set(card.root, {host, id: card.current.id});
    }
  }

  function extract({preferSelection = false} = {}) {
    const current = canonical(location.href);
    if (!current) throw new Error('請先點開一篇 Threads 貼文或留言頁；動態牆上的滑動不會收錄。');
    const card = mainCard(current);
    if (!card) throw new Error('目前無法確認主貼文範圍，已略過，避免把留言當原文。請重新整理詳情頁後重試。');
    let text = card.text;
    let selectionUsed = false;
    const selection = getSelection();
    if (preferSelection && selection && !selection.isCollapsed && selection.rangeCount && selection.toString().trim()) {
      const start = selection.anchorNode?.parentElement;
      const end = selection.focusNode?.parentElement;
      if (!start || !end || !card.root.contains(start) || !card.root.contains(end)
          || start.closest(EDITABLE) || end.closest(EDITABLE)) {
        throw new Error('選取內容不在這篇主貼文中。請只選取主貼文，或取消選取後儲存。');
      }
      // Selection endpoints alone are not sufficient: a range can cross an editable area.
      // Filter every selected text node with the same visible/non-editable rules as auto capture.
      text = textOf(card.root, selection.getRangeAt(0)).slice(0, MAX_TEXT);
      selectionUsed = true;
    }
    if (!text) throw new Error('這篇貼文沒有可收錄的文字；圖片與影片不會自動轉成文字。');
    return {...current, text, publishedAt: card.publishedAt, selectionUsed};
  }

  function toast(message, undoToken = null) {
    toastHost?.remove();
    toastHost = document.createElement('div');
    toastHost.dataset.threadsAtlas = 'toast';
    toastHost.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:360px;';
    const shadow = toastHost.attachShadow({mode: 'closed'});
    const box = document.createElement('div');
    box.style.cssText = 'background:#171a28;color:#f4f2ff;border:1px solid #575076;border-radius:14px;padding:14px 16px;font:13px/1.6 system-ui;box-shadow:0 8px 35px #0005;display:flex;align-items:center;gap:14px;';
    box.setAttribute('role', 'status');
    const label = document.createElement('span');
    label.textContent = message;
    box.append(label);
    if (undoToken) {
      const undo = document.createElement('button');
      undo.textContent = '復原';
      undo.style.cssText = 'background:#373046;border:0;border-radius:6px;padding:6px 10px;color:#fff;white-space:nowrap;cursor:pointer;';
      undo.onclick = async () => {
        undo.disabled = true;
        try { const response = await send('undoCapture', {token: undoToken}); toast(response.ok ? '已復原這次收錄' : response.error); }
        catch { toast('插件已更新，請重新整理頁面。'); }
      };
      box.append(undo);
    }
    shadow.append(box);
    document.documentElement.append(toastHost);
    const host = toastHost;
    setTimeout(() => host.remove(), undoToken ? 15000 : 6000);
  }

  async function captureAutomatic() {
    if (!enabled || !route || !eligibleVisit || Date.now() > inspectUntil || savedVisit === visitId || pendingVisit === visitId || document.visibilityState !== 'visible') return;
    const currentVisit = visitId;
    const currentId = route.id;
    let post;
    try { post = extract(); } catch (error) { lastFailure = error.message; return; }
    if (post.id !== currentId) return;
    pendingVisit = currentVisit;
    try {
      const response = await send('capture', {post, visitId: currentVisit, manual: false});
      if (response?.ok) {
        if (visitId === currentVisit) savedVisit = currentVisit;
        lastFailure = '';
        if (!response.duplicate && visitId === currentVisit) toast(response.added ? '已加入星圖 · 最近關注' : '已更新這篇的閱讀紀錄', response.undoToken);
      } else {
        lastFailure = response?.error || '本機收錄失敗。';
        if (visitId === currentVisit) { savedVisit = currentVisit; toast(`無法收錄：${lastFailure}`); }
      }
    } catch { enabled = false; lastFailure = '插件已更新，請重新整理 Threads。'; }
    finally { if (pendingVisit === currentVisit) pendingVisit = ''; }
  }

  function checkRoute() {
    const current = canonical(location.href);
    if (!initialized || (current?.id || null) !== (route?.id || null)) {
      eligibleVisit = !initialized || Date.now() - navigationIntentAt < 5000;
      initialized = true;
      route = current;
      visitId = crypto.randomUUID();
      savedVisit = '';
      lastFailure = '';
      inspectUntil = Date.now() + 20000;
      clearTimeout(settleTimer);
      // Wait for SPA route content to replace the prior feed before inspecting the main post.
      settleTimer = setTimeout(captureAutomatic, 900);
    }
  }

  const observer = new MutationObserver(records => {
    if (records.every(r => r.target.closest?.('[data-threads-atlas]') ||
      ([...r.addedNodes, ...r.removedNodes].length && [...r.addedNodes, ...r.removedNodes].every(n => n.nodeType === 1 && n.hasAttribute('data-threads-atlas'))))) return;
    scheduleButtons();
    checkRoute();
    if (!enabled || !route || !eligibleVisit || Date.now() > inspectUntil || savedVisit === visitId || observeTimer) return;
    observeTimer = setTimeout(() => { observeTimer = 0; captureAutomatic(); }, 700);
  });
  observer.observe(document.documentElement, {childList: true, subtree: true});
  setInterval(checkRoute, 650);
  window.addEventListener('scroll', scheduleButtons, {passive: true, capture: true});
  scheduleButtons();
  document.addEventListener('click', event => {
    if (!event.isTrusted || event.target?.closest?.('[data-threads-atlas]')) return;
    const element = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (element?.closest(EDITABLE)) return;
    const link = element?.closest('a[href]');
    const button = element?.closest('button,[role="button"]');
    let clickedPost = !!canonical(link?.href) || isReplyControl(button);
    // The post body is sometimes a clickable div rather than an anchor. A trusted click
    // in one unambiguous timestamped card is an intent; collection still requires a new detail URL.
    for (let ancestor = element, depth = 0; !clickedPost && ancestor && depth < 12; ancestor = ancestor.parentElement, depth += 1) {
      if (ancestor === document.body || ancestor === document.documentElement) break;
      if (ancestor.querySelectorAll('time[datetime]').length === 1 && uniquePostIds(ancestor).size === 1) clickedPost = true;
    }
    if (clickedPost) navigationIntentAt = Date.now();
  }, true);
  window.addEventListener('popstate', event => { if (event.isTrusted) navigationIntentAt = Date.now(); checkRoute(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkRoute();
      // A post opened in a background tab is first inspected when the user actually visits it.
      if (route && eligibleVisit && savedVisit !== visitId) inspectUntil = Date.now() + 20000;
      captureAutomatic();
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'threads-atlas-changed') {
      const wasEnabled = enabled;
      enabled = message.enabled === true;
      if (enabled && !wasEnabled) { checkRoute(); eligibleVisit = true; inspectUntil = Date.now() + 20000; captureAutomatic(); }
      return;
    }
    if (sender.url !== chrome.runtime.getURL('popup.html')) return;
    if (message?.type === 'threads-atlas-preview') {
      try { respond({ok: true, post: extract({preferSelection: true}), lastFailure}); }
      catch (error) { respond({ok: false, error: error.message, lastFailure}); }
    } else if (message?.type === 'threads-atlas-save') {
      let post;
      try { post = extract({preferSelection: true}); }
      catch (error) { respond({ok: false, error: error.message}); return; }
      if (post.id !== message.expectedId || post.text !== message.expectedText) { respond({ok: false, error: '頁面內容已變更，請重新開啟插件確認。'}); return; }
      const manualVisit = visitId || crypto.randomUUID();
      send('capture', {post, visitId: manualVisit, manual: true}).then(response => {
        if (response?.ok) { savedVisit = visitId; toast('已明確收藏到星圖', response.undoToken); }
        respond(response);
      }, () => respond({ok: false, error: '插件已更新，請重新整理 Threads。'}));
      return true;
    }
  });

  send('getSettings').then(response => { enabled = response?.enabled === true; checkRoute(); }, () => {});
})();
