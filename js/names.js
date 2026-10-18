/* Display-only Arabic name grouping. Never changes the membership source. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MedicalNames=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const key=s=>s.replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي');
  const prefixes=new Set(['عبد','ابو','ابي','ام','ال','بن','بنت']);
  function parts(value){
    const words=String(value??'').trim().split(/\s+/).filter(Boolean), result=[];
    for(let i=0;i<words.length && result.length<3;){
      const group=[words[i++]];
      while(i<words.length && (prefixes.has(key(group.at(-1))) || key(words[i])==='الدين'))group.push(words[i++]);
      if(prefixes.has(key(group.at(-1))) && i===words.length && result.length)break;
      result.push(group.join(' '));
    }
    return result;
  }
  return {parts,greeting:value=>parts(value).join(' ')};
});
