// Foreground icon badge only. Permission is requested exclusively by the
// explicit enable button; no push subscription or server is involved.
export class BadgeController {
  constructor({navigator=globalThis.navigator,notification=globalThis.Notification,installed=()=>false,enabled=false,onChange=()=>{},save=()=>{}}={}){
    Object.assign(this,{navigator,notification,installed,enabled,onChange,save});
    this.desired=null;this.applied=null;this.pending=null;this.requesting=false;this.error=false;
  }
  get status(){
    if(!this.installed())return 'install';
    if(typeof this.navigator?.setAppBadge!=='function'||typeof this.navigator?.clearAppBadge!=='function'||!this.notification?.requestPermission)return 'unsupported';
    if(this.requesting)return 'requesting';
    if(this.notification.permission==='denied')return 'denied';
    if(this.error)return 'error';
    return this.enabled&&this.notification.permission==='granted'?'enabled':'disabled';
  }
  async enable(count){
    if(this.requesting||['install','unsupported'].includes(this.status))return false;
    this.requesting=true;this.error=false;this.onChange();
    try{
      // Do not await anything before this call: iOS requires the click gesture.
      const permission=this.notification.permission==='granted'?'granted':await this.notification.requestPermission();
      if(permission!=='granted')return false;
      this.enabled=true;this.save(true);this.applied=null;
    }catch{this.error=true;return false}
    finally{this.requesting=false;this.onChange()}
    await this.sync(count);return !this.error;
  }
  disable(){
    this.enabled=false;this.save(false);this.error=false;this.onChange();
    if(typeof this.navigator?.clearAppBadge!=='function')return Promise.resolve();
    return this.queue(0);
  }
  sync(count){
    if(!this.enabled||!this.installed()||this.notification?.permission!=='granted')return Promise.resolve();
    if(typeof this.navigator?.setAppBadge!=='function'||typeof this.navigator?.clearAppBadge!=='function')return Promise.resolve();
    if(!Number.isInteger(count)||count<0)return Promise.resolve();
    return this.queue(count);
  }
  queue(count){
    if(this.error&&this.desired===count)return Promise.resolve();
    this.desired=count;
    if(this.pending)return this.pending;
    if(this.applied===count)return Promise.resolve();
    // Coalesce changes and serialize platform calls: an older delayed write
    // must not restore a stale count after completion or disabling.
    this.pending=Promise.resolve().then(async()=>{
      while(this.desired!==this.applied){
        const target=this.desired;
        try{
          if(target===0)await this.navigator.clearAppBadge();else await this.navigator.setAppBadge(target);
          this.applied=target;this.error=false;
        }catch{this.error=true;if(this.desired===target)break}
      }
    }).finally(()=>{this.pending=null;this.onChange()});
    return this.pending;
  }
}
