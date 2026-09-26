export function validSource(value) { try { const u = new URL(value); return u.protocol === 'https:' && ['www.threads.com','threads.com','www.threads.net','threads.net'].includes(u.hostname) && /^\/@[^/]+\/post\/[^/]+\/?$/.test(u.pathname) && !u.search && !u.hash; } catch { return false; } }
export function validate(data) {
  if (!data || !Array.isArray(data.posts) || !Array.isArray(data.topics) || !Number.isFinite(Date.parse(data.capturedAt))) throw Error('資料格式或快照日期無效');
  const ids = new Set(data.topics.map(t=>t.id));
  if(ids.size!==data.topics.length) throw Error('話題 ID 重複');
  const seen = new Set();
  for(const p of data.posts) { if(!validSource(p.url)||!p.id||seen.has(p.id)||!Number.isFinite(Date.parse(p.timestamp))||!Array.isArray(p.topics)||p.topics.some(t=>!ids.has(t))||typeof p.summary!=='string') throw Error('貼文來源、日期或分類無效'); seen.add(p.id); }
  return data;
}
export function filterPosts(data, {query='',period='all',selected=null}={}) {
  const anchor=Date.parse(data.capturedAt), q=query.trim().toLocaleLowerCase(), labels=new Map(data.topics.map(t=>[t.id,t.label]));
  return data.posts.filter(p=> {
    const time=Date.parse(p.timestamp);
    return (period==='all'||(time<=anchor&&time>=anchor-Number(period)*86400000)) && (!selected||p.topics.includes(selected)) && (!q||[p.summary,...p.topics.map(id=>labels.get(id)||'')].join(' ').toLocaleLowerCase().includes(q));
  });
}
export function makeGraph(data,posts,{nodeLimit=Infinity,selected=null}={}) {
  if(nodeLimit!==Infinity&&(!Number.isSafeInteger(nodeLimit)||nodeLimit<0)) throw Error('節點上限必須是非負整數');
  const counts=new Map(data.topics.map(t=>[t.id,0])), pairs=new Map();
  const rows=posts.map(post=>({post,tags:[...new Set(post.topics)].sort()}));
  for(const {tags} of rows) for(const id of tags) counts.set(id,(counts.get(id)||0)+1);
  const allNodes=data.topics.map(t=>({...t,count:counts.get(t.id)||0})).filter(t=>t.count>0);
  let nodes=allNodes;
  if(allNodes.length>nodeLimit) {
    // Stable ties follow the dataset order. Preserve the selected topic so it
    // stays explorable even when its count is below the displayed top topics.
    nodes=[...allNodes].sort((a,b)=>b.count-a.count).slice(0,nodeLimit);
    if(nodeLimit>0&&selected&&!nodes.some(node=>node.id===selected)) {
      const current=allNodes.find(node=>node.id===selected);
      if(current) nodes[nodes.length-1]=current;
    }
  }
  const visible=new Set(nodes.map(node=>node.id));
  for(const {post,tags} of rows) {
    // Limit before forming pairs: private imports may contain 30,000 distinct
    // tags, but an 80-node view should not allocate all 435,000 possible edges.
    const shown=tags.filter(id=>visible.has(id));
    for(let i=0;i<shown.length;i++) for(let j=i+1;j<shown.length;j++) {
      const key=shown[i]+'|'+shown[j];
      if(!pairs.has(key)) pairs.set(key,{source:shown[i],target:shown[j],postIds:[]});
      pairs.get(key).postIds.push(post.id);
    }
  }
  return {nodes,edges:[...pairs.values()],allNodes};
}
export function monthBins(posts) {const bins=new Map();for(const p of posts){const key=new Date(Date.parse(p.timestamp)+8*3600000).toISOString().slice(0,7);bins.set(key,(bins.get(key)||0)+1);}return [...bins].sort(([a],[b])=>a.localeCompare(b));}
export function growth(current,previous,comparable=false) {return !comparable||previous<=0?null:(current-previous)/previous*100;}
export function report(data,posts,title) {return ['# 話題星圖｜'+title,'','快照：'+data.capturedAt,'範圍：人工核對的公開貼文樣本；不代表台灣或 Threads 全量。','分類：編輯判讀；連線為同一樣本的共同分類。','成長率：資料不足，未計算。','','## 來源摘要',...posts.map(p=>'\n- '+p.summary+'\n  - 發文：'+p.timestamp+'\n  - 原文：'+p.url)].join('\n');}
