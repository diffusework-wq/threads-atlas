(() => {
  'use strict';
  const origins = new Set(['http://127.0.0.1:8765', 'http://localhost:8765']);
  const allowed = (origins.has(location.origin) && ['/', '/index.html'].includes(location.pathname)) || (location.origin === 'https://diffusework-wq.github.io' && ['/threads-atlas/', '/threads-atlas/index.html'].includes(location.pathname));
  if (!allowed || window !== window.top) return;
  const actions = new Set(['getLibrary', 'setEnabled', 'deletePost', 'markManual', 'restorePost']);
  const post = value => window.postMessage({channel: 'threads-atlas-local', ...value}, location.origin);
  let inFlight = 0;
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const request = event.data;
    if (!request || request.channel !== 'threads-atlas-local' || request.direction !== 'request') return;
    if (typeof request.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(request.requestId) || !actions.has(request.action)) return;
    if (inFlight >= 8) { post({direction: 'response', requestId: request.requestId, ok: false, error: '操作過於頻繁，請稍後重試。'}); return; }
    inFlight += 1;
    try {
      const response = await chrome.runtime.sendMessage({channel: 'threads-atlas-extension', action: request.action, payload: request.payload || {}});
      post({...response, direction: 'response', requestId: request.requestId});
    } catch {
      post({direction: 'response', requestId: request.requestId, ok: false, error: '插件已重新載入，請重新整理星圖頁面。'});
    } finally { inFlight -= 1; }
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'threads-atlas-changed') post({direction: 'changed'});
  });
  post({direction: 'changed'});
})();
