import test from 'node:test';
import assert from 'node:assert/strict';
import {GraphPhysics} from '../site/physics.mjs';
import {readFileSync} from 'node:fs';
import {makeGraph} from '../site/core.mjs';
const graph={nodes:[{id:'a'},{id:'b'}],edges:[{source:'a',target:'b',postIds:['p']}]};
test('a dragged node pulls its connected neighbor and remains pinned',()=>{
  const s=new GraphPhysics();s.setGraph(graph);Object.assign(s.nodes.get('a'),{x:300,y:0,z:0,pinned:true});Object.assign(s.nodes.get('b'),{x:0,y:0,z:0});
  for(let i=0;i<60;i++)s.advance(1/60);
  assert.equal(s.nodes.get('a').x,300);assert.ok(s.nodes.get('b').x>80);
});
test('release settles the real dense graph without numerical instability',()=>{
  const data=JSON.parse(readFileSync(new URL('../site/data/snapshot.json',import.meta.url)));const s=new GraphPhysics();s.setGraph(makeGraph(data,data.posts));
  const p=s.nodes.get('value');p.x=500;p.pinned=true;for(let i=0;i<60;i++)s.advance(1/60);p.pinned=false;
  for(let i=0;i<1800;i++)s.advance(1/60);
  for(const n of s.nodes.values())for(const k of ['x','y','z','vx','vy','vz'])assert.ok(Number.isFinite(n[k]));
  assert.ok(Math.hypot(p.vx,p.vy,p.vz)<1);assert.ok(Math.hypot(p.x,p.y,p.z)<300);
});
test('long background intervals are capped and empty filters clear graph',()=>{
  const a=new GraphPhysics(),b=new GraphPhysics();a.setGraph(graph);b.setGraph(graph);a.advance(1000);b.advance(.05);assert.deepEqual(a.nodes,b.nodes);
  a.setGraph({nodes:[],edges:graph.edges});a.advance(.02);assert.equal(a.nodes.size,0);assert.equal(a.edges.length,0);
});
