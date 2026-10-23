/* Optional, non-personal reading preferences for the private administrator preview. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MedicalDevicePreferences=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const key='rayati:admin-preview:reading:v1',version=1,retention=90*86400000;
 const defaults=()=>({size:'standard',compact:false,contrast:false,calm:false});
 const reading=value=>({size:['standard','large','larger'].includes(value?.size)?value.size:'standard',compact:value?.compact===true,contrast:value?.contrast===true,calm:value?.calm===true});
 const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(k=>keys.includes(k));
 function decode(raw,at){
  if(typeof raw!=='string'||raw.length>400||!Number.isSafeInteger(at))return null;
  try{const value=JSON.parse(raw),prefs=value.reading;
   if(!exact(value,['version','savedAt','reading'])||value.version!==version||!Number.isSafeInteger(value.savedAt)||value.savedAt<=0||value.savedAt>at||at-value.savedAt>=retention||!exact(prefs,['size','compact','contrast','calm'])||!['standard','large','larger'].includes(prefs.size)||!['compact','contrast','calm'].every(k=>typeof prefs[k]==='boolean'))return null;
   return {version,savedAt:value.savedAt,reading:reading(prefs)};
  }catch{return null;}
 }
 function create({storage,now=Date.now}={}){
  const target=()=>typeof storage==='function'?storage():storage;
  function clear(){try{target().removeItem(key);return {status:'session',savedAt:null};}catch{return {status:'blocked',savedAt:null};}}
  function read(){try{const raw=target().getItem(key);if(raw===null)return {status:'session',savedAt:null};const value=decode(raw,now());if(!value){const cleared=clear();return {status:cleared.status==='blocked'?'blocked':'discarded',savedAt:null};}return {status:'saved',savedAt:value.savedAt,reading:value.reading};}catch{return {status:'blocked',savedAt:null};}}
  function save(value){try{const savedAt=now();if(!Number.isSafeInteger(savedAt)||savedAt<=0)return {status:'blocked',savedAt:null};const encoded=JSON.stringify({version,savedAt,reading:reading(value)}),store=target();store.setItem(key,encoded);if(store.getItem(key)!==encoded)return {status:'blocked',savedAt:null};return {status:'saved',savedAt,reading:reading(value)};}catch{return {status:'blocked',savedAt:null};}}
  return Object.freeze({read,save,clear});
 }
 // Inspection only: never request permission, obtain coordinates, register push or identify a device.
 async function permissions({navigator:nav,Notification:notification,matchMedia}={}){
  let location='unknown';
  try{const result=await nav?.permissions?.query({name:'geolocation'});if(['granted','denied','prompt'].includes(result?.state))location=result.state;}catch{}
  let notifications='unsupported';try{if(notification)notifications=['granted','denied','default'].includes(notification.permission)?notification.permission:'unknown';}catch{notifications='unknown';}
  let installed=null;try{if(typeof matchMedia==='function'){installed=matchMedia('(display-mode: standalone)').matches===true||nav?.standalone===true;}}catch{}
  return {location,notifications,installed};
 }
 return Object.freeze({key,retention,defaults,reading,decode,create,permissions});
});
