import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HoverVoices,voiceExcerpt,voiceQueue} from '../site/hover-voices.mjs';

function setup(t,{reduced=false,posts=[{originalText:'第一則原文'},{originalText:'第二則原文'}]}={}){
  t.mock.timers.enable({apis:['setTimeout']});
  const events={},animations=[];
  const element=()=>({style:{},classList:{add(){},remove(){}},append(){},setAttribute(){},offsetWidth:300,offsetHeight:80,
    animate(frames,options){const animation={frames,options,cancel(){},pause(){}};animations.push(animation);return animation;}});
  const doc={hidden:false,createElement:element,addEventListener(type,fn){events[type]=fn;}};
  t.mock.property(globalThis,'document',doc);
  t.mock.property(globalThis,'matchMedia',()=>({matches:reduced,addEventListener(){}}));
  const voices=new HoverVoices({...element(),clientWidth:900,clientHeight:700},{getTopic:()=>({label:'接住情緒'}),getPosts:()=>posts});
  return {voices,posts,doc,events,animations};
}
// Browser globals do not exist in Node; restore them after the suite exits.
globalThis.document=undefined;globalThis.matchMedia=undefined;

test('original text is never reconstructed from an editorial summary',()=>{
  assert.equal(voiceExcerpt({summary:'作者表達疲累'}).text,'');
  assert.equal(voiceExcerpt({kind:'personal',text:'我很累。',summary:'作者很累'}).text,'我很累。');
  const text='🫶原文\n'.repeat(200),queue=voiceQueue([{kind:'personal',text}]);
  assert.equal(queue.map(v=>v.text).join(''),text);
  assert.ok(queue.every(v=>Array.from(v.text).length<=160));
});
test('same topic keeps cycling through repeated graph redraws and library refreshes',t=>{
  const {voices}=setup(t);voices.hover('support',{x:400,y:300});
  for(let i=1;i<=8;i++){
    voices.hover('support',{x:401,y:301});voices.refresh();
    t.mock.timers.tick(4420);
    assert.equal(voices.body.textContent,i%2?'第二則原文':'第一則原文');
    assert.equal(voices.panel.hidden,false);
  }
});
test('single post also repeats and drifts from lower right upward',t=>{
  const {voices,animations}=setup(t,{posts:[{originalText:'唯一原文'}]});
  voices.hover('support',{x:400,y:300});t.mock.timers.tick(4420);t.mock.timers.tick(4420);
  assert.equal(animations.length,3);
  assert.equal(animations[0].frames[0].transform,'translate(28px,40px)');
  assert.equal(animations[0].frames.at(-1).opacity,0);
});
test('reduced motion suppresses animation but continues rotating opinions',t=>{
  const {voices,animations}=setup(t,{reduced:true});voices.hover('support',{x:400,y:300});
  t.mock.timers.tick(4420);assert.equal(voices.body.textContent,'第二則原文');assert.equal(animations.length,0);
});
test('leaving or deleting all matching posts stops the loop',t=>{
  const {voices,posts,animations}=setup(t);voices.hover('support',{x:400,y:300});voices.hover(null);
  t.mock.timers.tick(400);t.mock.timers.tick(20000);assert.equal(voices.panel.hidden,true);assert.equal(animations.length,1);
  voices.hover('support',{x:400,y:300});posts.length=0;voices.refresh();assert.equal(voices.panel.hidden,true);
});
test('hidden documents suspend and resume the loop',t=>{
  const {voices,doc,events,animations}=setup(t);voices.hover('support',{x:400,y:300});
  doc.hidden=true;events.visibilitychange();t.mock.timers.tick(20000);assert.equal(animations.length,1);
  doc.hidden=false;events.visibilitychange();t.mock.timers.tick(4420);assert.equal(voices.body.textContent,'第二則原文');
});
test('every public sample has a separately sourced literal excerpt',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../site/data/snapshot.json',import.meta.url),'utf8'));
  for(const p of data.posts){assert.ok(p.originalText);assert.notEqual(p.originalText,p.summary);assert.equal(p.originalTextKind,'verbatim_excerpt');}
  assert.equal(data.posts.find(p=>p.id==='DdtiocBH4os').originalText,'當你累了，沒人接住你的情緒，是件多麼難過的事。人生好難！');
});
