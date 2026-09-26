import {validate,filterPosts,makeGraph,monthBins,report} from './core.mjs?v=3';
import {normalizeLibrary,personalDataset} from './personal.mjs';
import {ExtensionClient} from './extension-client.mjs';
import {HoverVoices} from './hover-voices.mjs?v=3';
const $=s=>document.querySelector(s);
const colors={relationship:'#aaa0ff',emotion:'#73d7bf',boundary:'#edb881'};
let data,sampleData,selected=null,query='',period='all',listMode=false,graph,activePosts=[],graphView;
let sourceMode=new URLSearchParams(location.search).get('library')==='personal'?'personal':'sample',libraryMode='all',connected=false,imported=false,lastDeleted=null,syncTimer,sourceEpoch=0,connectionVersion=0;
let library={schemaVersion:1,enabled:false,revision:0,posts:[]},pluginLibrary=library;
let saved=[];try{const v=JSON.parse(localStorage.getItem('threads-atlas-tags')||'[]');saved=Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,20):[];}catch{}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function notify(text){$('#status').textContent=text;}
function topic(id){return data.topics.find(t=>t.id===id);}
function date(s){return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));}
function sourceCard(p){
  const c=el('article',undefined,'source-card');
  c.append(el('time',(sourceMode==='personal'?'收錄於 ':'')+date(p.timestamp)),el('span',sourceMode==='personal'?(p.manual?'★ 手動收藏':'自動收錄'):(p.kind==='reply'?'公開回覆':'公開貼文'),'source-kind'),el('p',p.text||p.originalText||p.summary));
  if(sourceMode==='personal'){
    const original=p.originalPublishedAt?'原文發佈 '+date(p.originalPublishedAt):'原文發佈時間未取得';
    c.append(el('small',`@${p.author} · ${original} · 開啟 ${p.openCount} 次`,'tiny'));
    if(p.tags.length)c.append(el('p','自訂標籤：'+p.tags.join('、'),'tiny'));
    if(p.note)c.append(el('p',p.note,'personal-note'));
    if(p.classification)c.append(el('small','分類方式：本機關鍵字／自訂標籤，非人工核對。','tiny'));
  }
  const a=el('a','查看 Threads 原文 ↗');a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';c.append(a);
  if(sourceMode==='personal'){
    const actions=el('div',undefined,'source-actions'),star=el('button',p.manual?'取消收藏':'★ 收藏'),remove=el('button','刪除');
    star.setAttribute('aria-label',(p.manual?'取消收藏 ':'收藏 ')+p.id);remove.setAttribute('aria-label','刪除 '+p.id);
    star.onclick=()=>changePost('markManual',{id:p.id,manual:!p.manual});remove.onclick=()=>changePost('deletePost',{id:p.id});
    actions.append(star,remove);c.append(actions);
  }return c;
}
function section(title,n){const s=el('section',undefined,'detail-section');const h=el('h3',title);if(n!==undefined)h.append(el('span',String(n)));s.append(h);return s;}
function select(id){selected=id;render();}
function renderNav(){
  const nav=$('#topics');nav.replaceChildren();const all=el('button','全部話題','topic-btn'+(!selected?' selected':''));all.onclick=()=>select(null);nav.append(all);
  const counts=new Map(graph.allNodes.map(t=>[t.id,t.count]));
  const topics=data.topics.filter(t=>t.seed).sort((a,b)=>sourceMode==='personal'?(counts.get(b.id)||0)-(counts.get(a.id)||0):0);
  const shown=topics.slice(0,80);if(selected&&!shown.some(t=>t.id===selected)){const t=topics.find(t=>t.id===selected);if(t)shown[shown.length-1]=t;}
  for(const t of shown){const b=el('button',undefined,'topic-btn'+(selected===t.id?' selected':''));b.setAttribute('aria-pressed',String(selected===t.id));const dot=el('i',undefined,'dot');dot.style.background=colors[t.group];b.append(dot,el('span',t.label),el('em',String(counts.get(t.id)||0)));b.onclick=()=>select(t.id);nav.append(b);}
  if(topics.length>80)nav.append(el('p','顯示收錄最多的 80 個話題；可用搜尋尋找其餘話題。','tiny'));
}
function renderTags(){const box=$('#tags');box.replaceChildren();for(const tag of saved){const b=el('button','# '+tag);b.onclick=()=>{$('#search').value=tag;query=tag;selected=null;render();};const remove=el('button','×');remove.setAttribute('aria-label','移除標籤 '+tag);remove.onclick=()=>{saved=saved.filter(x=>x!==tag);persist();};box.append(b,remove);}}
function persist(){try{localStorage.setItem('threads-atlas-tags',JSON.stringify(saved));}catch{notify('瀏覽器無法儲存，標籤只保留於本次使用。');}renderTags();}
function paintGraph(){graphView?.setGraph(graph,selected);$('#graph-empty').hidden=graph.nodes.length>0;$('#graph-empty').textContent=sourceMode==='personal'&&!library.posts.length?'你的星圖還是一片空白。安裝插件、開啟自動收錄，再點開一篇 Threads 貼文，第一個話題就會在這裡出現。':'這個篩選沒有收錄貼文，試試其他話題或期間。';}
function showEdge(e){const box=$('#detail');box.replaceChildren(el('div','RELATIONSHIP EVIDENCE','eyebrow'),el('h2',topic(e.source).label+' ↔ '+topic(e.target).label),el('p',sourceMode==='personal'?'這些收錄貼文同時符合兩個話題的本機關鍵字規則或自訂標籤。這是分類交集，不代表你贊同其內容或兩個話題有因果關係。':'這些貼文同時被編輯歸入兩個話題。這是樣本分類的交集，不代表因果或字面詞彙必然同時出現。','description'));const back=el('button','返回話題');back.onclick=renderDetail;box.append(back);for(const id of e.postIds)box.append(sourceCard(data.posts.find(p=>p.id===id)));}
function renderDetail(){const box=$('#detail');box.replaceChildren();const t=topic(selected);const head=el('div',undefined,'detail-top');head.append(el('div','TOPIC EXPLORER','eyebrow'),el('span',t?.seed?'主題入口':'延伸探索','tiny'));box.append(head,el('h2',t?.label||(sourceMode==='personal'?(library.posts.length?'我的閱讀足跡':'從一篇貼文開始'):'全部話題')),el('p',t?.description||(sourceMode==='personal'?'這裡是你在 Threads 閱讀時留下的足跡。自動收錄代表曾點開，不代表喜歡或認同。':'從真實公開貼文出發，探索話題交集。選擇節點，查看它與其他議題的連結。'),'description'),el('span',`${activePosts.length} 則收錄樣本`,'count-label'));
if(t){const related=section('這個話題，也連到');const links=graph.edges.filter(e=>e.source===selected||e.target===selected).sort((a,b)=>b.postIds.length-a.postIds.length);for(const e of links){const other=topic(e.source===selected?e.target:e.source);const b=el('button',other.label+' · '+e.postIds.length,'related');b.onclick=()=>select(other.id);related.append(b);const evidence=el('button','↗','related evidence');evidence.setAttribute('aria-label','查看'+t.label+'與'+other.label+'的關聯依據');evidence.onclick=()=>showEdge(e);related.append(evidence);}if(!links.length)related.append(el('p','目前篩選沒有足夠的關聯樣本。','tiny'));box.append(related);}
const sources=section('代表貼文',activePosts.length);for(const p of activePosts.slice(0,3))sources.append(sourceCard(p));if(!activePosts.length)sources.append(el('p','此範圍尚無收錄資料。請切換期間或清除搜尋。','description'));if(activePosts.length>3){const more=el('button','查看全部 '+activePosts.length+' 則');more.onclick=()=>{listMode=true;render();$('#post-list').scrollIntoView({behavior:'smooth',block:'center'});};sources.append(more);}box.append(sources);
if(t&&activePosts.length&&sourceMode==='sample'){const ideas=section('可以怎麼聊？','創作提案');const angles=t.angles||['從一則具體情境出發：雙方在意的事情相同嗎？','將樣本中的不同觀點並列，邀請讀者分享經驗。','把抽象概念改寫成一段日常對話，討論彼此的期待。'];angles.slice(0,3).forEach((text,i)=>{const item=el('div',undefined,'angle');const p=el('p',text);p.append(el('small','依樣本延伸 · 發布前請自行判斷'));item.append(el('b','0'+(i+1)),p);ideas.append(item);});box.append(ideas);}box.append(el('p',sourceMode==='personal'?'本機保留的是收錄當時的文字，原文後續可能修改或刪除。':'顯示原文短摘錄，完整內容請查看來源。貼文敘述未經獨立事實查核。','tiny'));}
function renderTimeline(){const timeline=$('#timeline');timeline.replaceChildren();const bins=monthBins(activePosts);if(!bins.length){timeline.append(el('p','沒有符合條件的時間資料。','tiny'));return;}const max=Math.max(...bins.map(b=>b[1]));for(const [month,count]of bins){const g=el('div',undefined,'bar-group'),bar=el('div',undefined,'bar');bar.style.height=(count/max*55)+'px';g.title=`${month}：${count} 則收錄貼文`;g.append(el('small',String(count)),bar,el('small',month.slice(2)));timeline.append(g);}}
let voiceScope;
function render(){if(!data)return;const scope=JSON.stringify([sourceMode,query,period,listMode,imported]);if(scope!==voiceScope){graphView?.setHover(null);voices.hide();voiceScope=scope;}else voices.refresh();updateModeText();const base=filterPosts(data,{query,period});activePosts=filterPosts(data,{query,period,selected});graph=makeGraph(data,base,{nodeLimit:80,selected});$('#post-count').textContent=base.length;$('#node-count').textContent=graph.allNodes.length;$('#edge-count').textContent=graph.edges.length;$('#topic-total').textContent=graph.allNodes.length;$('#fourth-count').textContent=sourceMode==='personal'?base.filter(p=>p.manual).length:'—';renderNav();paintGraph();renderDetail();renderTimeline();$('#graph-stage').hidden=listMode;$('#post-list').hidden=!listMode;$('#graph-tab').classList.toggle('active',!listMode);$('#list-tab').classList.toggle('active',listMode);$('#graph-tab').setAttribute('aria-pressed',String(!listMode));$('#list-tab').setAttribute('aria-pressed',String(listMode));$('#post-list').replaceChildren(...activePosts.map(sourceCard));if(!activePosts.length)$('#post-list').append(el('p','此篩選沒有收錄貼文。','description'));}
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#search').oninput=e=>{query=e.target.value;render();};$('#period').onchange=e=>{period=e.target.value;render();};$('#zoom-in').onclick=()=>graphView?.zoom(1.2);$('#zoom-out').onclick=()=>graphView?.zoom(1/1.2);$('#reset').onclick=()=>{graphView?.reset();query='';period='all';selected=null;$('#search').value='';$('#period').value='all';render();notify('已重設篩選與視角。');};$('#graph-tab').onclick=()=>{listMode=false;render();};$('#list-tab').onclick=()=>{listMode=true;render();};
$('#tag-form').onsubmit=e=>{e.preventDefault();const value=$('#tag-input').value.trim();if(value&&!saved.includes(value)&&saved.length<20){saved.push(value);persist();$('#tag-input').value='';}};
$('#method-btn').onclick=()=>{
  const personal=sourceMode==='personal',dialog=$('#method');
  dialog.querySelector('h2').textContent=personal?'你的資料，留在你的瀏覽器。':'讓每個連結，都有依據。';
  dialog.querySelector('p').textContent=personal?'插件在你開啟自動收錄後，保存所開啟貼文的已載入文字與連結。個人資料不會加入公開示範或傳到雲端。':'這是公開 Threads 貼文的人工核對樣本，用來體驗話題探索；不代表隨機抽樣、完整收錄或台灣整體輿情。';
  const notes=personal?['自動收錄代表曾點開，並不代表喜歡、認同或已讀完。','主題來自本機關鍵字規則與自訂標籤，可能分類不準；不是 AI 語意理解。','連線代表同一篇收錄同時符合兩個分類，位置與距离只是圖形佈局。','時間篩選與月份長條依收錄時間；原文發佈時間另列，未取得時不補造。','資料預設保存在 Chrome 插件內。解除安裝會清除，請定期匯出備份。','匯入備份僅供本次頁面預覽；不會合併到插件。最多支援 1,000 篇，圖與側欄最多顯示 80 個話題，可搜尋其餘話題。']:['公開示範呈現原文短摘錄與來源連結，另保留分析摘要；不發布帳號登入資訊。','話題分類為編輯判讀；連線不代表因果。','來源可能是主貼文或回覆；個人敘述未經獨立事實查核。','顏色代表主題群組，不代表情緒正負或成長率。','缺乏一致的連續採集資料，因此不顯示熱度成長率。','發文切角是創作提案，不是原作者的話。'];
  dialog.querySelector('ul').replaceChildren(...notes.map(n=>el('li',n)));$('#method-meta').textContent=personal?'網站與插件需在同一個 Chrome 個人檔案使用。':`公開示範 ${sampleData?.posts.length||0} 則。`;dialog.showModal();};$('#close-method').onclick=()=>$('#method').close();$('#export').onclick=()=>{if(!data)return;const title=topic(selected)?.label||'全部話題';const base=sourceMode==='personal'?personalReport(activePosts,title):report(data,activePosts,title);const ideas=sourceMode==='personal'?[]:(topic(selected)?.angles||[]);download(base+(ideas.length?'\n\n## 發文切角（創作提案）\n'+ideas.map(x=>'- '+x).join('\n'):''),'text/markdown;charset=utf-8','threads-atlas-report.md');notify('已匯出目前篩選的報告與原文連結。');};
$('#save-svg').onclick=()=>{if(!graphView)return;download(graphView.exportSVG(),'image/svg+xml','threads-atlas.svg');notify('已下載目前 3D 視角的關聯圖 SVG。');};
$('#motion-toggle').onclick=()=>{if(!graphView)return;graphView.paused=!graphView.paused;$('#motion-toggle').textContent=graphView.paused?'▶ 繼續動態':'Ⅱ 暫停動態';$('#motion-toggle').setAttribute('aria-pressed',String(graphView.paused));};
function updateModeText(){
  const personal=sourceMode==='personal';
  $('#page-title').textContent=personal?'我的話題星圖':'感情裡的話題宇宙';
  $('#snapshot-caption').textContent=personal?`${library.posts.length} 則個人收錄 · 本機關鍵字分類 · ${imported?'備份預覽':'Chrome 本機資料'}`:`${date(data.capturedAt)} 核對 · 繁體中文公開貼文 · 非即時榜單`;
  $('#personal-tab').classList.toggle('active',personal);$('#sample-tab').classList.toggle('active',!personal);
  $('#personal-tab').setAttribute('aria-pressed',String(personal));$('#sample-tab').setAttribute('aria-pressed',String(!personal));
  $('#post-count-title').textContent=personal?'已收錄的貼文':'核對過的貼文';$('#post-count-note').textContent=personal?'我的閱讀足跡':'真實來源';
  $('#fourth-title').textContent=personal?'手動收藏':'24 小時成長率';$('#fourth-note').textContent=personal?'特別想保留的內容':'尚無連續觀測';
  $('#timeline-title').textContent=personal?'我的收錄時間分布':'收錄貼文的時間分布';$('#timeline-unit').textContent=personal?'依收錄月份':'依發文月份';
  $('#timeline-note').textContent=personal?'依加入資料庫的時間統計，非原文發佈量或全平台熱度。':'僅呈現樣本分布，非全平台聲量或升降趨勢。';
  $('#scope-badge').textContent=personal?'個人資料 · 未公開':'人工選樣 · 非台灣全量統計';
  $('#period').options[1].textContent=personal?'最近 7 天收錄':'快照前 7 天';$('#period').options[2].textContent=personal?'最近 24 小時收錄':'快照前 24 小時';
  $('.graph-legend').style.display=personal?'none':'';
  $('.reading').textContent=personal?'節點越大，相關收錄越多。連線代表同篇內容符合兩個分類；不代表喜好強度或全平台趨勢。':'節點越大，相關樣本越多。連線表示同一貼文被歸入兩個話題，點選後可追溯原文與分類依據。';
}
function connectionText(){
  $('#library-status').textContent=imported?'正在預覽匯入備份；變更只保留本次頁面，不會寫回插件。':connected?`插件已連接 · 自動收錄${library.enabled?'已開啟':'已暫停'} · ${library.posts.length} 則`:'尚未連接插件。請在已安裝插件的 Chrome 中開啟此網站，或先看公開示範。';
  $('#library-status').classList.toggle('connected',connected&&!imported);
  $('#capture-toggle').disabled=!connected||imported;$('#capture-toggle').textContent=library.enabled&&!imported?'Ⅱ 暫停收錄':'開啟自動收錄';$('#capture-toggle').setAttribute('aria-pressed',String(library.enabled&&!imported));
  $('#exit-import').hidden=!imported;$('#backup-library').disabled=!library.posts.length;$('#library-filter').disabled=sourceMode!=='personal';
}
function applyLibrary(){
  if(sourceMode==='personal'){data=personalDataset(library,{mode:libraryMode});if(!data.topics.some(t=>t.id===selected))selected=null;}else data=sampleData;
  connectionText();render();
}
const bridge=new ExtensionClient(()=>{clearTimeout(syncTimer);syncTimer=setTimeout(()=>connectExtension(false),100);});
function acceptPlugin(result){
  const next=normalizeLibrary(result.library);
  // A slow read must not undo a later write or replace an imported preview.
  if(next.revision>=pluginLibrary.revision)pluginLibrary=next;
  connected=true;connectionVersion++;if(!imported)library=pluginLibrary;
}
async function connectExtension(showError=false){
  const version=connectionVersion;
  try{acceptPlugin(await bridge.request('getLibrary'));applyLibrary();}
  catch(error){if(version===connectionVersion){connected=false;connectionText();if(showError)notify(error.message);}}
}
async function changePost(action,payload){
  const epoch=sourceEpoch;
  try{
    if(imported){
      const p=library.posts.find(x=>x.id===payload.id);
      if(action==='deletePost'){if(!p)return;lastDeleted={id:p.id,post:p,imported:true};library={...library,posts:library.posts.filter(x=>x.id!==p.id)};}
      else if(action==='markManual'){library={...library,posts:library.posts.map(p=>p.id===payload.id?{...p,manual:payload.manual}:p)};}
    }else{
      if(!connected)throw Error('請先連接 Chrome 插件。');
      acceptPlugin(await bridge.request(action,payload));
      if(epoch!==sourceEpoch){applyLibrary();return;}
      if(action==='deletePost')lastDeleted={id:payload.id,imported:false};
    }
    applyLibrary();if(action==='deletePost'){$('#undo-delete').hidden=false;notify('已刪除此筆收錄，可按「復原刪除」。');}else notify('已更新收藏。');
  }catch(error){notify(error.message);}
}
function personalReport(posts,title){return ['# 我的話題星圖｜'+title,'','範圍：個人收錄，不代表喜好或 Threads 全平台聲量。','分類：本機關鍵字規則與自訂標籤，未人工核對。',...posts.map(p=>`\n- ${p.summary}\n  - 收錄：${p.timestamp}\n  - 原文發佈：${p.originalPublishedAt||'未取得'}\n  - 原文：${p.url}\n  - 類型：${p.manual?'手動收藏':'自動收錄'}`)].join('\n');}
$('#personal-tab').onclick=()=>{sourceMode='personal';selected=null;applyLibrary();};
$('#sample-tab').onclick=()=>{if(!sampleData)return;sourceMode='sample';selected=null;applyLibrary();};
$('#library-filter').onchange=e=>{libraryMode=e.target.value;selected=null;applyLibrary();};
$('#connect-extension').onclick=()=>connectExtension(true);
$('#capture-toggle').onclick=async()=>{try{const epoch=sourceEpoch;acceptPlugin(await bridge.request('setEnabled',{enabled:!library.enabled}));applyLibrary();if(epoch!==sourceEpoch)return;notify(pluginLibrary.enabled?'自動收錄已開啟。請到 Chrome 的 Threads 網頁點開貼文。':'自動收錄已暫停。');}catch(error){notify(error.message);}};
$('#install-extension').onclick=()=>$('#install-dialog').showModal();$('#close-install').onclick=()=>$('#install-dialog').close();
$('#backup-library').onclick=()=>{download(JSON.stringify(library,null,2),'application/json','threads-atlas-personal-backup.json');notify('已匯出個人備份，請保存在自己的電腦。');};
$('#import-library').onclick=()=>$('#library-file').click();
$('#library-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>16*1024*1024)throw Error('備份檔太大，最多 16 MB。');const next=normalizeLibrary(JSON.parse(await file.text()));library=next;imported=true;sourceEpoch++;sourceMode='personal';selected=null;lastDeleted=null;$('#undo-delete').hidden=true;applyLibrary();notify('已開啟備份預覽；沒有上傳或寫入插件。');}catch(error){notify('匯入失敗：'+error.message);}finally{e.target.value='';}};
$('#exit-import').onclick=()=>{sourceEpoch++;imported=false;library=pluginLibrary;lastDeleted=null;$('#undo-delete').hidden=true;applyLibrary();connectExtension();};
$('#undo-delete').onclick=async()=>{if(!lastDeleted)return;const pending=lastDeleted,epoch=sourceEpoch;try{if(pending.imported&&imported){library={...library,posts:[pending.post,...library.posts.filter(p=>p.id!==pending.id)]};}else if(!pending.imported&&!imported){acceptPlugin(await bridge.request('restorePost',{id:pending.id}));if(epoch!==sourceEpoch){applyLibrary();return;}}else throw Error('請回到刪除時的資料來源再復原。');if(lastDeleted===pending){lastDeleted=null;$('#undo-delete').hidden=true;}applyLibrary();notify('已復原收錄。');}catch(error){notify(error.message);}};
window.addEventListener('focus',()=>connectExtension(false));
const voices=new HoverVoices($('#graph-stage'),{getTopic:topic,getPosts:id=>filterPosts(data,{query,period,selected:id})});
try{const {Graph3D}=await import('./graph3d.mjs?v=3');graphView=new Graph3D($('#graph'),{onSelect:select,onEdge:showEdge,onHover:(id,anchor)=>voices.hover(id,anchor)});$('#motion-toggle').textContent=graphView.paused?'▶ 繼續動態':'Ⅱ 暫停動態';$('#motion-toggle').setAttribute('aria-pressed',String(graphView.paused));}catch(error){$('#graph').append(el('p','這個瀏覽器無法啟用 3D。請使用支援 WebGL2 的瀏覽器，或透過左側話題與貼文清單探索。','graph-fallback'));for(const id of ['motion-toggle','zoom-in','zoom-out','save-svg'])$('#'+id).disabled=true;}
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#search').focus();}});
try{const response=await fetch('./data/snapshot.json?v=3',{cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);sampleData=validate(await response.json());$('#method-meta').textContent=`公開示範共 ${sampleData.posts.length} 則。核對時間：${date(sampleData.capturedAt)}。${sampleData.note||''}`;}catch(error){notify('公開示範暫時無法載入；仍可使用個人收藏。');$('#sample-tab').disabled=true;sourceMode='personal';}
renderTags();applyLibrary();connectExtension();
