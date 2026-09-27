const $ = selector => document.querySelector(selector);
const send = (action, payload = {}) => chrome.runtime.sendMessage({channel: 'threads-atlas-extension', action, payload});
let library;
let tab;
let preview;
const diagnosticLines=['話題星圖 '+chrome.runtime.getManifest().version];
function diagnostic(key,value){diagnosticLines.push(key+': '+value);$('#diagnostics').value=diagnosticLines.join('\n');}
function status(message, error = false) { $('#status').textContent = message; $('#status').style.color = error ? '#efacb5' : '#b6ddcb'; }
function renderLibrary(next) {
  library = next;
  $('#enabled').checked = library.enabled;
  $('#state').textContent = library.enabled ? '自動收錄中' : '自動收錄已暫停';
  $('#count').textContent = library.posts.length.toLocaleString();
}
async function refresh() {
  const response = await send('getLibrary');
  if (!response?.ok) throw new Error(response?.error || '無法載入本機收藏。');
  renderLibrary(response.library);
}
$('#enabled').addEventListener('change', async event => {
  const desired = event.target.checked;
  event.target.disabled = true;
  try {
    const response = await send('setEnabled', {enabled: desired});
    if (!response.ok) throw new Error(response.error);
    renderLibrary(response.library);
    status(desired ? '已開啟；接著打開一篇 Threads 貼文試試。' : '已暫停自動收錄，已有收藏會保留。');
  } catch (error) { event.target.checked = library?.enabled || false; status(error.message, true); }
  finally { event.target.disabled = false; }
});
$('#open').addEventListener('click', () => chrome.tabs.create({url: 'https://diffusework-wq.github.io/threads-atlas/?library=personal'}));
$('#save').addEventListener('click', async () => {
  if (!tab?.id || !preview) return;
  $('#save').disabled = true;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {type: 'threads-atlas-save', expectedId: preview.id, expectedText: preview.text});
    if (!response?.ok) throw new Error(response?.error || '未能儲存。');
    await refresh();
    status('已加入明確收藏。');
  } catch (error) { status(error.message, true); $('#save').disabled = false; }
});
$('#export').addEventListener('click', async () => {
  try {
    await refresh();
    const url = URL.createObjectURL(new Blob([JSON.stringify(library, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = url; a.download = `threads-atlas-personal-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    status('已匯出本機收藏備份。');
  } catch (error) { status(error.message, true); }
});
try {
  await refresh();
  diagnostic('背景服務','正常');diagnostic('自動收錄',library.enabled?'開啟':'關閉');
  [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  let onThreads=false;
  try{onThreads=['www.threads.com','threads.com','www.threads.net','threads.net'].includes(new URL(tab?.url).hostname);}catch{}
  diagnostic('目前分頁',onThreads?'Threads':'非 Threads，請先切到貼文分頁');
  try{
    const info=await chrome.tabs.sendMessage(tab.id,{type:'threads-atlas-diagnostics'});
    if(info?.ok){
      diagnostic('頁面連線','正常');
      const d=info.diagnostics;
      for(const [key,label] of Object.entries({page:'頁面類型',postLinks:'貼文連結數',timestampLinks:'時間連結數',saveButtons:'已加入收藏按鈕數',currentPostRecognized:'主貼文辨識',autoEnabled:'頁面自動收錄',eligibleVisit:'開啟動作符合收錄',savedThisVisit:'本次已收錄',lastFailure:'收錄訊息'}))diagnostic(label,d[key]??'不適用');
    }else diagnostic('頁面連線','舊版或未回傳診斷；請重新整理 Threads');
  }catch{diagnostic('頁面連線','未連接。可能未重新整理、未授予網站存取權限，或頁面腳本未啟動。');}
  let response;
  try { response = tab?.id ? await chrome.tabs.sendMessage(tab.id, {type: 'threads-atlas-preview'}) : null; }
  catch { response = null; }
  if (response?.ok) {
    preview = response.post;
    $('#preview-info').textContent = `@${preview.author} · ${preview.selectionUsed ? '使用你選取的主貼文文字' : '已辨識主貼文'}`;
    $('#preview').textContent = preview.text;
    $('#preview').hidden = false;
    $('#save').disabled = false;
    if (response.lastFailure) status(response.lastFailure, true);
  } else {
    $('#preview-info').textContent = response?.error || (onThreads?'插件尚未連到此 Threads 分頁。請查看下方「連線診斷」。':'請先切到 Threads 貼文詳情分頁，再開啟插件。');
  }
} catch (error) { diagnostic('背景服務','失敗；請到擴充功能管理頁查看錯誤');status(error.message, true); $('#enabled').disabled = true; }
