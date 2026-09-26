import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validate,filterPosts,makeGraph,growth,monthBins,validSource,report} from '../site/core.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../site/data/snapshot.json',import.meta.url),'utf8'));
test('snapshot contains real-source provenance and all nine requested topics',()=>{validate(data);assert.equal(data.topics.filter(t=>t.seed).length,9);for(const t of data.topics.filter(t=>t.seed))assert.ok(data.posts.some(p=>p.topics.includes(t.id)),t.label);for(const p of data.posts){assert.ok(Date.parse(p.timestamp)<=Date.parse(data.capturedAt));assert.ok(p.summary.length>0);assert.ok(p.verifiedAt);}});
test('all edges are reproducible from unique source posts',()=>{const g=makeGraph(data,data.posts);for(const e of g.edges){assert.equal(new Set(e.postIds).size,e.postIds.length);for(const id of e.postIds){const p=data.posts.find(p=>p.id===id);assert.ok(p.topics.includes(e.source)&&p.topics.includes(e.target));}}});
test('unsafe links and duplicate posts are rejected',()=>{assert.equal(validSource('https://threads.com.attacker.test/@x/post/1'),false);assert.equal(validSource('javascript:alert(1)'),false);assert.equal(validSource('https://threads.com/@x/post/1?access_token=secret'),false);assert.throws(()=>validate({...data,posts:[data.posts[0],data.posts[0]]}));});
test('time filter is anchored to snapshot, not visitor clock',()=>{const p={...data.posts[0],timestamp:'2026-09-25T12:00:00Z'};const d={...data,capturedAt:'2026-09-26T12:00:00Z',posts:[p,{...p,id:'old',timestamp:'2026-09-24T12:00:00Z'}]};assert.equal(filterPosts(d,{period:'1'}).length,1);assert.equal(filterPosts(d,{query:'no-such-word'}).length,0);});
test('missing baselines never become invented growth',()=>{assert.equal(growth(50,0,true),null);assert.equal(growth(50,10,false),null);assert.equal(growth(20,10,true),100);});
test('monthly bins use Taiwan calendar and report keeps source links',()=>{assert.deepEqual(monthBins([{timestamp:'2026-08-31T17:00:00Z'}]),[['2026-09',1]]);assert.ok(report(data,[data.posts[0]],'test').includes(data.posts[0].url));});

test('capped graphs keep complete counts, strongest nodes, selected topics and exact source evidence',()=>{
  const topics=['a','b','c','rare'].map(id=>({id,label:id}));
  const posts=[['a','b','c'],['a','b','c'],['a','b'],['a','rare']].map((tags,i)=>({id:'p'+i,topics:tags}));
  const d={topics,posts};
  const full=makeGraph(d,posts);
  assert.deepEqual(full.nodes,full.allNodes);
  assert.deepEqual(full.nodes.map(n=>[n.id,n.count]),[['a',4],['b',3],['c',2],['rare',1]]);
  const top=makeGraph(d,posts,{nodeLimit:2});
  assert.deepEqual(top.nodes.map(n=>n.id),['a','b']);
  assert.deepEqual(top.allNodes,full.allNodes);
  assert.deepEqual(top.edges,[{source:'a',target:'b',postIds:['p0','p1','p2']}]);
  const selected=makeGraph(d,posts,{nodeLimit:2,selected:'rare'});
  assert.deepEqual(selected.nodes.map(n=>n.id),['a','rare']);
  assert.deepEqual(selected.edges,[{source:'a',target:'rare',postIds:['p3']}]);
  assert.deepEqual(selected.allNodes,full.allNodes);
  assert.deepEqual(makeGraph(d,posts,{nodeLimit:2,selected:'missing'}).nodes,top.nodes);
  assert.deepEqual(makeGraph(d,posts,{nodeLimit:0,selected:'rare'}).nodes,[]);
  assert.deepEqual(makeGraph(d,posts,{nodeLimit:0}).edges,[]);
  for(const nodeLimit of [-1,NaN,1.5]) assert.throws(()=>makeGraph(d,posts,{nodeLimit}));
});

test('large private graphs cap before pairing without losing searchable topics or posts',()=>{
  const topics=Array.from({length:30000},(_,i)=>({id:'tag'+i,label:'標籤-'+i}));
  const posts=Array.from({length:1000},(_,i)=>({id:'p'+i,summary:'收錄文字',timestamp:data.capturedAt,
    topics:Array.from({length:30},(_,j)=>'tag'+(i*30+j))}));
  const d={capturedAt:data.capturedAt,topics,posts};
  const capped=makeGraph(d,posts,{nodeLimit:80});
  assert.equal(capped.allNodes.length,30000);
  assert.equal(capped.nodes.length,80);
  assert.equal(capped.edges.length,1060); // Two full 30-node groups and one 20-node group.
  assert.ok(capped.allNodes.every(node=>node.count===1));
  const visible=new Set(capped.nodes.map(node=>node.id));
  for(const edge of capped.edges) {
    assert.ok(visible.has(edge.source)&&visible.has(edge.target));
    assert.equal(edge.postIds.length,1);
    const p=posts[Number(edge.postIds[0].slice(1))];
    assert.ok(p.topics.includes(edge.source)&&p.topics.includes(edge.target));
  }
  // A topic omitted from the initial view still finds its source; graph capping
  // must never destructively truncate the private library or topic vocabulary.
  const found=filterPosts(d,{query:'標籤-29999'});
  assert.deepEqual(found.map(p=>p.id),['p999']);
  const selected=makeGraph(d,posts,{nodeLimit:80,selected:'tag29999'});
  assert.equal(selected.nodes.length,80);
  assert.ok(selected.nodes.some(node=>node.id==='tag29999'));
  const filtered=makeGraph(d,found,{nodeLimit:80,selected:'tag29999'});
  assert.equal(filtered.nodes.length,30);
  assert.equal(filtered.edges.length,435);
  assert.equal(posts.length,1000);
  assert.equal(topics.length,30000);
});
