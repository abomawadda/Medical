/* Browser-confirmed PWA installation. Stored history is never proof of current installation. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.MedicalInstall=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const historyKey='medical_install_confirmed_v1';
  function create({host,navigator:nav,manifestURL,storage,onChange=()=>{},onInstalled=()=>{},probeTimeout=2000}){
    const mode=host.matchMedia?.('(display-mode: standalone)');
    let offer=null,busy=false,confirmed=false,generation=0,disposed=false;
    const standalone=()=>!!mode?.matches || nav.standalone===true;
    const history=()=>{try{return storage?.getItem(historyKey)==='1';}catch{return false;}};
    const remember=()=>{try{storage?.setItem(historyKey,'1');}catch{}};
    const state=()=>({installed:standalone()||confirmed,ready:!!offer,busy});
    const emit=()=>{if(!disposed)onChange(state());};
    const confirm=(notify=false)=>{const first=!confirmed;confirmed=true;offer=null;remember();emit();if(notify&&first&&!disposed)onInstalled();};
    const canonical=value=>{try{const u=new URL(value,manifestURL);u.hash='';u.search='';return u.href;}catch{return '';}};
    async function probe(){
      if(standalone()){confirm(!history());return true;}
      if(typeof nav.getInstalledRelatedApps!=='function')return false;
      const epoch=generation;let timer;
      try{
        const apps=await Promise.race([nav.getInstalledRelatedApps(),new Promise(resolve=>{timer=setTimeout(()=>resolve([]),probeTimeout);})]);
        if(disposed||epoch!==generation)return false;
        const found=Array.isArray(apps)&&apps.some(app=>app.platform==='webapp'&&typeof app.url==='string'&&canonical(app.url)===canonical(manifestURL));
        if(found)confirm();return found;
      }catch{return false;}finally{clearTimeout(timer);}
    }
    const before=event=>{event.preventDefault();offer=event;generation++;confirmed=false;emit();};
    const installed=()=>confirm(true);
    const modeChanged=()=>{if(standalone())confirm(true);else emit();};
    host.addEventListener('beforeinstallprompt',before);host.addEventListener('appinstalled',installed);
    mode?.addEventListener?.('change',modeChanged);
    async function install(){
      if(busy)return {status:'busy'};
      if(standalone()){confirm();return {status:'already'};}
      // Invoke prompt before any asynchronous probe, preserving the user's activation.
      if(offer){
        const current=offer;offer=null;generation++;busy=true;emit();
        try{
          await current.prompt();const choice=await current.userChoice;
          if(confirmed)return {status:'confirmed'};
          if(choice?.outcome==='accepted')return {status:'pending'};
          return {status:'dismissed'};
        }catch{return {status:'manual',history:history()};}
        finally{busy=false;emit();}
      }
      busy=true;emit();
      try{
        if(await probe() || confirmed)return {status:'already'};
        if(offer)return {status:'ready'};
        return {status:'manual',history:history()};
      }finally{busy=false;emit();}
    }
    const check=async()=>{await probe();emit();return state();};
    emit();
    return {install,check,state,dispose(){disposed=true;host.removeEventListener('beforeinstallprompt',before);host.removeEventListener('appinstalled',installed);mode?.removeEventListener?.('change',modeChanged);}};
  }
  return Object.freeze({create});
});
