/* Activity is explicit; polling, rendering and hidden tabs never renew a session. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MedicalAdminIdle=factory();})(globalThis,()=>{
  function create({renew,expire,warn=()=>{},failure=()=>{},now=()=>Date.now(),timeout=600000,interval=45000}){
    let active=false,lastActivity=0,lastReported=0,lastAttempt=0,pending=null,generation=0;
    function stop(){active=false;generation++;pending=null;}
    function check(){if(active && now()-lastActivity>=timeout){stop();expire();return true;}return false;}
    function start(at){stop();active=true;lastActivity=at;lastReported=at;lastAttempt=at;}
    async function ping(force=false){
      if(!active || check() || pending || (!force && (lastActivity<=lastReported || now()-lastAttempt<interval || now()-lastActivity>60000)))return false;
      const gen=generation,activity=lastActivity;lastAttempt=now();
      const operation=Promise.resolve().then(()=>active && gen===generation ? renew() : undefined);pending=operation;
      try{await operation;if(active && gen===generation)lastReported=activity;return true;}
      catch(error){if(active && gen===generation)failure(error);return false;}
      finally{if(pending===operation)pending=null;}
    }
    function activity(force=false){if(!active || check())return Promise.resolve(false);lastActivity=now();warn(null);return ping(force);}
    function tick(visible=true){if(!active || check())return Promise.resolve(false);warn(timeout-(now()-lastActivity)<=60000 ? Math.ceil((timeout-(now()-lastActivity))/1000):null);return visible?ping():Promise.resolve(false);}
    return Object.freeze({start,stop,check,activity,tick});
  }
  return Object.freeze({create});
});
