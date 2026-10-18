/* Local directory matching. Searches only records already authorized for this session. */
(function(root,factory){const api=factory();if(typeof module==='object' && module.exports)module.exports=api;else root.MedicalSearch=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const normalize=value=>String(value??'').toLowerCase().replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  const aliases=new Map();
  for(const group of [ ['طبيب','اطباء','دكتور','دكاتره','دكتوره'],['عياده','عيادات'],['مركز','مراكز'],['متخصص','متخصصه'],['مستشفي','مستشفيات'],['معمل','معامل','مختبر','مختبرات'],['تحليل','تحاليل'],['اسنان','سنان'],['اشعه','اشعات'],['صيدليه','صيدليات'],['باطنه','باطني'] ])for(const word of group)aliases.set(word,group[0]);
  const stops=new Set(['في','من','عن','الي','لو','سمحت','عايز','عاوزه','عاوز','عايزه','اريد','ابحث','بحث','عندي','فين','علاج','كشف','عند','د']);
  const canonical=word=>{const bare=word.startsWith('ال') && word.length>3?word.slice(2):word;return aliases.get(bare)||bare;};
  const tokens=value=>normalize(value).split(' ').filter(Boolean).map(canonical);
  function near(a,b){
    if(a.length<4 || b.length<4 || /\d/.test(a+b) || Math.abs(a.length-b.length)>1)return false;
    if(a.length===b.length){const diff=[];for(let i=0;i<a.length;i++)if(a[i]!==b[i])diff.push(i);return diff.length===1 || (diff.length===2 && diff[1]===diff[0]+1 && a[diff[0]]===b[diff[1]] && a[diff[1]]===b[diff[0]]);}
    const [short,long]=a.length<b.length?[a,b]:[b,a];let i=0,j=0;while(i<short.length && j<long.length){if(short[i]===long[j]){i++;j++;}else{j++;if(j-i>1)return false;}}return true;
  }
  function match(query,fields){
    const raw=normalize(query).slice(0,240);
    if(!raw)return {score:1,approximate:false};
    const wanted=tokens(raw).filter(t=>!stops.has(t)).slice(0,20);
    if(!wanted.length)return {score:0,approximate:false};
    const data=Array.isArray(fields)?{name:fields[0],details:fields.slice(1)}:fields;
    const name=normalize(data.name), words=tokens([data.name,...[data.tags,data.details].flat(Infinity)].filter(v=>v!=null).join(' '));
    const names=new Set(tokens(data.name));
    const fuzzyWords=tokens([data.name,...[data.tags].flat(Infinity)].filter(v=>v!=null).join(' '));let score=0,approximate=false;
    for(const word of wanted){
      if(words.includes(word)){score+=names.has(word)?35:15;continue;}
      if(word.length>=2 && words.some(w=>w.startsWith(word))){score+=8;continue;}
      if(fuzzyWords.some(w=>near(word,w))){score+=[...names].some(w=>near(word,w))?12:3;approximate=true;continue;}
      return {score:0,approximate:false};
    }
    if(name===raw)score+=180;else if(name.includes(raw))score+=90;
    if(approximate)score=Math.min(score/(1+names.size)/100,7); // Exact matches always precede guesses.
    return {score,approximate};
  }
  return {normalize,match};
});
