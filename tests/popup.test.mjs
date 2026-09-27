import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../extension/popup.mjs',import.meta.url),'utf8');
async function popup({connected=true,recognized=false,background=true}={}){
  const elements=new Map();
  const document={querySelector(id){if(!elements.has(id))elements.set(id,{style:{},addEventListener(){}});return elements.get(id);}};
  const chrome={runtime:{getManifest:()=>({version:'0.2.1'}),sendMessage:async()=>{
    if(!background)throw Error('background offline');return {ok:true,library:{enabled:true,posts:[]}};
  }},tabs:{query:async()=>[{id:1,url:'https://www.threads.com/@private_account/post/PRIVATE'}],sendMessage:async(id,message)=>{
    if(!connected)throw Error('receiver missing');
    if(message.type==='threads-atlas-diagnostics')return {ok:true,diagnostics:{page:'post',autoEnabled:true,postLinks:4,timestampLinks:2,saveButtons:0,currentPostRecognized:recognized,eligibleVisit:true,savedThisVisit:false,lastFailure:''}};
    return {ok:false,error:'目前無法確認主貼文範圍'};
  }}};
  await vm.runInNewContext('(async()=>{'+source+'})()',{document,chrome,URL});
  return elements;
}
test('diagnostics distinguish missing content script from unrecognized post without exposing account or URL',async()=>{
  const missing=await popup({connected:false});
  assert.match(missing.get('#diagnostics').value,/頁面連線: 未連接/);
  const unrecognized=await popup();
  assert.match(unrecognized.get('#diagnostics').value,/頁面連線: 正常/);
  assert.match(unrecognized.get('#diagnostics').value,/主貼文辨識: false/);
  assert.doesNotMatch(unrecognized.get('#diagnostics').value,/private_account|PRIVATE|https:/);
});
test('background failure is visible even when initialization cannot reach the page',async()=>{
  const elements=await popup({background:false});assert.match(elements.get('#diagnostics').value,/背景服務: 失敗/);
  assert.equal(elements.get('#enabled').disabled,true);
});
