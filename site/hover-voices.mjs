export function voiceExcerpt(post) {
  const personal=post.kind==='personal';
  const text=(personal?post.text:post.summary)||'';
  let author=post.author;
  if(!author){try{author=new URL(post.url).pathname.split('/')[1]?.replace(/^@/,'');}catch{}}
  return {author:author?'@'+author:'來源作者',text:text.length>240?text.slice(0,240)+'…':text,
    kind:personal?'收錄文字摘錄 · 未核對':post.kind==='reply'?'回覆觀點 · 編輯摘要':'貼文觀點 · 編輯摘要'};
}

export class HoverVoices {
  constructor(stage,{getTopic,getPosts}){
    this.stage=stage;this.getTopic=getTopic;this.getPosts=getPosts;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
    this.panel=document.createElement('aside');this.panel.className='hover-voices';this.panel.hidden=true;
    this.body=document.createElement('p');this.body.className='voice-text';this.panel.append(this.body);stage.append(this.panel);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){this.dismissed=this.id;this.hide();}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(this.timer);this.animation?.pause();}else if(this.id){this.render();}});
    this.reduced.addEventListener('change',()=>{if(this.id)this.render();});
  }
  hover(id,anchor){
    if(!id){this.dismissed=null;this.hideSoon();return;}
    if(this.dismissed===id)return;this.dismissed=null;
    clearTimeout(this.hideTimer);this.hideTimer=null;this.panel.classList.remove('is-leaving');
    this.anchor=anchor;
    if(this.id!==id){
      this.posts=this.getPosts(id);if(!this.posts.length){this.hide();return;}
      this.id=id;this.index=0;this.panel.hidden=false;this.render();
    }
    this.place();
  }
  place(){
    if(!this.anchor||this.panel.hidden)return;
    const {x,y}=this.anchor,w=this.stage.clientWidth,h=this.stage.clientHeight;
    const pw=this.panel.offsetWidth,ph=this.panel.offsetHeight;
    this.panel.style.left=Math.max(18,Math.min(w-pw-42,x+34))+'px';
    this.panel.style.top=Math.max(85,Math.min(h-ph-95,y-ph-22))+'px';
  }
  hideSoon(){if(!this.id||this.hideTimer)return;this.panel.classList.add('is-leaving');this.hideTimer=setTimeout(()=>this.hide(),400);}
  hide(){clearTimeout(this.hideTimer);clearTimeout(this.timer);this.animation?.cancel();this.hideTimer=null;this.id=null;this.panel.hidden=true;}
  render(){
    clearTimeout(this.timer);this.animation?.cancel();
    const v=voiceExcerpt(this.posts[this.index]);
    this.body.textContent=v.text;
    this.panel.setAttribute('aria-label',(this.getTopic(this.id)?.label||'話題')+' · '+v.kind);
    this.place();
    if(this.reduced.matches||document.hidden)return;
    const duration=Math.max(6000,Math.min(12000,v.text.length*48));
    this.animation=this.body.animate([
      {opacity:0,transform:'translate(28px,40px)',offset:0},
      {opacity:.92,transform:'translate(17px,17px)',offset:.17},
      {opacity:.92,transform:'translate(0,-8px)',offset:.73},
      {opacity:0,transform:'translate(-10px,-36px)',offset:1}
    ],{duration,easing:'linear',fill:'forwards'});
    this.timer=setTimeout(()=>{if(!this.id)return;this.index=(this.index+1)%this.posts.length;this.render();},duration+220);
  }
}
