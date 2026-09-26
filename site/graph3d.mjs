import * as THREE from 'three';
import {OrbitControls} from './vendor/three/OrbitControls.js';
import {GraphPhysics} from './physics.mjs';
const colors={relationship:'#aaa0ff',emotion:'#73d7bf',boundary:'#edb881'};
export class Graph3D {
  constructor(host,{onSelect,onEdge,onHover=()=>{}}){
    this.onHover=onHover;this.host=host;this.onSelect=onSelect;this.onEdge=onEdge;this.sim=new GraphPhysics();this.items=new Map();this.links=[];
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(45,1,.1,4000);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.domElement.setAttribute('aria-label','3D 話題網路；拖曳空白旋轉，拖曳節點牽動網路');host.append(this.renderer.domElement);
    this.labels=document.createElement('div');this.labels.className='graph-labels';host.append(this.labels);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.075;this.controls.minDistance=130;this.controls.maxDistance=1400;
    this.ray=new THREE.Raycaster();this.ray.params.Line.threshold=2;this.pointer=new THREE.Vector2();this.plane=new THREE.Plane();this.hit=new THREE.Vector3();
    this.geometry=new THREE.SphereGeometry(1,24,16);
    const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#ffffffaa');g.addColorStop(.25,'#ffffff33');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);this.glow=new THREE.CanvasTexture(c);
    this.paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.addEventListener('pointerdown',e=>this.down(e),true);host.addEventListener('pointermove',e=>this.move(e));
    host.addEventListener('pointerleave',()=>this.setHover(null));host.addEventListener('focusin',e=>this.setHover(e.target.closest('[data-node]')?.dataset.node));host.addEventListener('focusout',()=>this.setHover(null));
    host.addEventListener('pointerup',e=>this.up(e));host.addEventListener('pointercancel',()=>this.release());host.addEventListener('lostpointercapture',()=>this.release());
    host.addEventListener('click',e=>{const b=e.target.closest('[data-node]');if(b&&e.detail===0)this.onSelect(b.dataset.node);});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resetCamera();
    this.last=performance.now();this.renderer.setAnimationLoop(t=>{const dt=(t-this.last)/1000;this.last=t;if(document.hidden||!host.clientWidth||host.closest('[hidden]'))return;if(!this.paused)this.sim.advance(dt);this.controls.update();this.draw();});
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.release();this.renderer.setAnimationLoop(null);const p=document.createElement('p');p.className='graph-fallback';p.textContent='3D 顯示中斷，請重新整理；仍可使用左側話題與貼文清單。';host.append(p);});
  }
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.width=w;this.height=h;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  resetCamera(){this.controls.target.set(0,0,0);this.camera.position.set(30,35,Math.max(540,620/Math.max(.7,this.host.clientWidth/this.host.clientHeight)));this.controls.update();}
  reset(){this.release();this.sim=new GraphPhysics();if(this.graph){this.sim.setGraph(this.graph);for(let i=0;i<180;i++)this.sim.step(1/120);}this.resetCamera();}
  zoom(f){this.camera.position.sub(this.controls.target).multiplyScalar(1/f).clampLength(130,1400).add(this.controls.target);this.controls.update();}
  setGraph(graph,selected){
    if(!graph.nodes.some(n=>n.id===this.hovered))this.setHover(null);
    this.release();this.graph=graph;this.selected=selected;
    const signature=JSON.stringify(graph);if(signature!==this.signature){
      this.signature=signature;this.sim.setGraph(graph);
      for(const {mesh,sprite,label}of this.items.values()){this.scene.remove(mesh,sprite);mesh.material.dispose();sprite.material.dispose();label.remove();}this.items.clear();
      for(const line of this.links){this.scene.remove(line);line.geometry.dispose();line.material.dispose();}this.links=[];
      for(const n of graph.nodes){
        const r=4+Math.sqrt(n.count)*1.7,color=colors[n.group];
        const mesh=new THREE.Mesh(this.geometry,new THREE.MeshBasicMaterial({color,transparent:true}));mesh.scale.setScalar(r);mesh.userData.id=n.id;
        const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color,transparent:true,depthWrite:false,opacity:.45}));sprite.scale.setScalar(r*7);
        const label=document.createElement('button');label.className='graph-label';label.textContent=n.label;label.dataset.node=n.id;label.setAttribute('aria-label',`${n.label}，${n.count}則樣本`);this.labels.append(label);this.scene.add(mesh,sprite);this.items.set(n.id,{mesh,sprite,label,n,r});
      }
      for(const e of graph.edges){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#757f9e',transparent:true,opacity:.2}));line.userData.edge=e;this.scene.add(line);this.links.push(line);}
      for(let i=0;i<180;i++)this.sim.step(1/120);
    }
    const neighbors=new Set([selected]);for(const e of graph.edges){if(e.source===selected)neighbors.add(e.target);if(e.target===selected)neighbors.add(e.source);}
    for(const [id,item]of this.items){item.mesh.material.opacity=!selected||neighbors.has(id)?1:.25;item.sprite.material.opacity=id===selected?.8:.28;item.label.classList.toggle('selected',id===selected);item.label.classList.toggle('dim',!!selected&&!neighbors.has(id));item.label.setAttribute('aria-pressed',String(id===selected));}
    for(const line of this.links){const e=line.userData.edge,active=e.source===selected||e.target===selected;line.material.opacity=selected?(active?.55:.10):.25;line.material.color.set(active?colors[graph.nodes.find(n=>n.id===selected).group]:'#757f9e');}
    this.resize();this.draw();
  }
  cast(e){const r=this.host.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);}
  setHover(id){this.hovered=id||null;if(!this.hovered)this.onHover(null);else this.emitHover();}
  emitHover(){const p=this.sim.nodes.get(this.hovered);if(!p)return;const v=this.project(p);this.onHover(this.hovered,{x:(v.x+1)*this.width/2,y:(1-v.y)*this.height/2});}
  down(e){
    this.setHover(null);
    if(this.drag){this.release();return;}if(e.button!==0)return;this.cast(e);
    const id=e.target.closest('[data-node]')?.dataset.node||this.ray.intersectObjects([...this.items.values()].map(x=>x.mesh))[0]?.object.userData.id;
    this.start={x:e.clientX,y:e.clientY,id,edge:!id?this.ray.intersectObjects(this.links)[0]?.object.userData.edge:null};
    if(!id)return;e.stopPropagation();e.preventDefault();this.controls.enabled=false;
    const p=this.sim.nodes.get(id);p.pinned=true;this.drag={id,pointerId:e.pointerId};
    this.plane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()),new THREE.Vector3(p.x,p.y,p.z));
    this.ray.ray.intersectPlane(this.plane,this.hit);this.offset=new THREE.Vector3(p.x,p.y,p.z).sub(this.hit);
    this.host.setPointerCapture(e.pointerId);this.host.classList.add('dragging');
  }
  move(e){if(!this.drag){if(e.buttons||e.pointerType==='touch'){this.setHover(null);return;}this.cast(e);this.setHover(e.target.closest('[data-node]')?.dataset.node||this.ray.intersectObjects([...this.items.values()].map(x=>x.mesh))[0]?.object.userData.id);return;}if(e.pointerId!==this.drag.pointerId)return;this.cast(e);if(this.ray.ray.intersectPlane(this.plane,this.hit)){this.hit.add(this.offset).clampLength(0,650);const p=this.sim.nodes.get(this.drag.id);p.x=this.hit.x;p.y=this.hit.y;p.z=this.hit.z;}}
  up(e){const start=this.start,click=start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<5;this.release();this.start=null;if(click){if(start.id){this.onSelect(start.id);if(e.pointerType!=='touch')this.setHover(start.id);}else if(start.edge)this.onEdge(start.edge);}}
  release(){if(this.drag){const p=this.sim.nodes.get(this.drag.id);if(p)p.pinned=false;const id=this.drag.pointerId;this.drag=null;if(this.host.hasPointerCapture(id))this.host.releasePointerCapture(id);}this.controls.enabled=true;this.host.classList.remove('dragging');}
  project(p){return new THREE.Vector3(p.x,p.y,p.z).project(this.camera);}
  draw(){
    if(!this.width)return;
    for(const [id,item]of this.items){const p=this.sim.nodes.get(id);item.mesh.position.set(p.x,p.y,p.z);item.sprite.position.copy(item.mesh.position);const v=this.project(p);item.label.style.left=((v.x+1)*this.width/2)+'px';item.label.style.top=((-v.y+1)*this.height/2+12)+'px';item.label.hidden=v.z>1||v.z< -1;item.label.style.zIndex=String(Math.round((1-v.z)*10000));}
    for(const line of this.links){const e=line.userData.edge,a=this.sim.nodes.get(e.source),b=this.sim.nodes.get(e.target),attr=line.geometry.attributes.position;attr.setXYZ(0,a.x,a.y,a.z);attr.setXYZ(1,b.x,b.y,b.z);attr.needsUpdate=true;line.geometry.computeBoundingSphere();}
    this.renderer.render(this.scene,this.camera);if(this.hovered)this.emitHover();
  }
  exportSVG(){
    const ns='http://www.w3.org/2000/svg',root=document.createElementNS(ns,'svg');root.setAttribute('xmlns',ns);root.setAttribute('viewBox',`0 0 ${this.width} ${this.height}`);
    const add=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;root.append(e);};
    const xy=id=>{const v=this.project(this.sim.nodes.get(id));return{x:(v.x+1)*this.width/2,y:(1-v.y)*this.height/2};};
    add('rect',{width:'100%',height:'100%',fill:'#0e121b'});
    for(const e of this.graph.edges){const a=xy(e.source),b=xy(e.target);add('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#69758e','stroke-opacity':.4});}
    for(const[id,item]of this.items){const p=xy(id);add('circle',{cx:p.x,cy:p.y,r:6,fill:colors[item.n.group]});add('text',{x:p.x,y:p.y+24,fill:'#e2e6f1','text-anchor':'middle','font-family':'sans-serif','font-size':13},item.n.label);}
    return new XMLSerializer().serializeToString(root);
  }
}
