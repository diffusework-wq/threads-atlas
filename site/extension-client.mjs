// The bridge is installed by our extension only on explicitly allowed local origins.
const CHANNEL='threads-atlas-local';
export class ExtensionClient {
  constructor(onChanged){
    this.pending=new Map();
    window.addEventListener('message',event=>{
      if(event.source!==window||event.origin!==location.origin)return;
      const m=event.data;if(!m||m.channel!==CHANNEL)return;
      if(m.direction==='changed'){onChanged();return;}
      if(m.direction!=='response'||!this.pending.has(m.requestId))return;
      const {resolve,reject,timer}=this.pending.get(m.requestId);clearTimeout(timer);this.pending.delete(m.requestId);
      if(m.ok===true)resolve(m);else reject(Error(typeof m.error==='string'?m.error:'插件操作失敗'));
    });
  }
  request(action,payload={}){
    const requestId=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(requestId);reject(Error('未連接插件。請在安裝插件的 Chrome 中開啟此網址。'));},2500);
      this.pending.set(requestId,{resolve,reject,timer});
      window.postMessage({channel:CHANNEL,direction:'request',requestId,action,payload},location.origin);
    });
  }
}
