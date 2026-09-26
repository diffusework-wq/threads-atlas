// Fixed-step springs: interaction injects energy, friction lets the graph settle.
export class GraphPhysics {
  constructor(){this.nodes=new Map();this.edges=[];this.accumulator=0;}
  setGraph(graph){
    const previous=this.nodes;
    this.nodes=new Map(graph.nodes.map((n,i)=>{
      const y=1-2*(i+.5)/graph.nodes.length,a=i*2.399963,r=Math.sqrt(1-y*y)*150;
      return [n.id,previous.get(n.id)||{x:Math.cos(a)*r,y:y*150,z:Math.sin(a)*r,vx:0,vy:0,vz:0,pinned:false}];
    }));
    this.edges=graph.edges.filter(e=>this.nodes.has(e.source)&&this.nodes.has(e.target));
  }
  advance(seconds){
    this.accumulator+=Math.min(Math.max(seconds,0),.05);
    while(this.accumulator>=1/120){this.step(1/120);this.accumulator-=1/120;}
  }
  step(dt){
    const entries=[...this.nodes.entries()],forces=new Map(entries.map(([id,p])=>[id,{x:-p.x*.32,y:-p.y*.32,z:-p.z*.32}]));
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
      const [aid,a]=entries[i],[bid,b]=entries[j];let dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;
      if(dx*dx+dy*dy+dz*dz<.01)dx=.1;
      const d=Math.max(12,Math.hypot(dx,dy,dz)),f=260000/(d*d*d);
      for(const [axis,v]of [['x',dx],['y',dy],['z',dz]]){forces.get(aid)[axis]+=v*f;forces.get(bid)[axis]-=v*f;}
    }
    for(const e of this.edges){
      const a=this.nodes.get(e.source),b=this.nodes.get(e.target),d=Math.max(.1,Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z));
      const strength=1.8+Math.min(5,e.postIds.length)*.22,rest=110-Math.min(5,e.postIds.length)*4;
      for(const axis of ['x','y','z']){const f=(b[axis]-a[axis])/d*(d-rest)*strength;forces.get(e.source)[axis]+=f;forces.get(e.target)[axis]-=f;}
    }
    for(const [id,p]of entries){if(p.pinned){p.vx=p.vy=p.vz=0;continue;}for(const axis of ['x','y','z']){const v='v'+axis;p[v]=(p[v]+forces.get(id)[axis]*dt)*Math.exp(-2.15*dt);p[axis]+=p[v]*dt;}}
  }
}
