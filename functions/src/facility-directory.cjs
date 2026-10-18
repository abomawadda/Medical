/* Identity links are reviewed source decisions, never fuzzy name/phone merges.
   Only opaque IDs/signatures are bundled; directory details still require login. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MedicalFacilities=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const rules=[{"kind":"labs","ids":["staff_2378","family_20261018_068"],"signatures":["3945d005","61496d07"]},{"kind":"pharmacies","ids":["staff_2010","family_20261018_076"],"signatures":["d2246ed2","146c8967"]},{"kind":"pharmacies","ids":["staff_2546","family_20261018_099","family_20261018_102"],"signatures":["e2547039","3aa2a9dd","ee0a7b75"]},{"kind":"pharmacies","ids":["staff_2633","family_20261018_077"],"signatures":["e82a2d4e","1853e7eb"]},{"kind":"pharmacies","ids":["staff_2649","family_20261018_107"],"signatures":["a789ec6e","35c7bab8"]},{"kind":"pharmacies","ids":["family_20261018_011","family_20261018_067"],"signatures":["5f16c533","d26a8ec"]},{"kind":"pharmacies","ids":["staff_769","family_20261018_010"],"signatures":["5354f6f3","c7e470c0"]}];
  const normalize=v=>String(v||'').normalize('NFKC').replace(/[إأآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\u064B-\u065Fـ]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function signature(r){let h=2166136261;for(const c of [r.name,r.address,r.markaz||r.city,r.governorate_code||'EG-DK',r.country_code||'EG'].map(normalize).join('|'))h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(16);}
  function branchKey(kind,r){const rule=rules.find(g=>g.kind===kind&&g.ids.includes(String(r.id)));if(!rule)return String(r.id);const at=rule.ids.indexOf(String(r.id));return signature(r)===rule.signatures[at]?rule.ids[0]:'detached:'+String(r.id);}
  function branches(kind,rows){const groups=new Map();for(const r of rows){const key=branchKey(kind,r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}return [...groups.values()].map(entries=>{
    entries.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const key=branchKey(kind,entries[0]);const primary=entries.find(r=>String(r.id)===key)||entries[0];
    return {id:String(primary.id),entries,network_members:[...new Set(entries.flatMap(r=>r.network_members || []))]};
  });}
  function brand(kind,r){const name=normalize(r.name);let match;
    if(kind==='labs')match=[['المختبر','معامل المختبر'],['البرج','معامل البرج'],['الفا','معامل ألفا'],['النحاس','معامل النحاس'],['رويال لاب','رويال لاب'],['الطاهره','معامل الطاهرة']].find(([key])=>(' '+name+' ').includes(' '+key+' '));
    if(kind==='pharmacies')match=[['العزبي','صيدليات العزبي'],['الطرشوبي','صيدليات الطرشوبي'],['كير','صيدليات كير'],['اورانج','صيدليات أورانج']].find(([key])=>(' '+name+' ').includes(' '+key+' '));
    return match ? {key:[kind,r.country_code||'EG',r.governorate_code||'EG-DK',match[0]].join(':'),name:match[1]}:{key:kind+':'+String(r.id),name:r.name};
  }
  function organizations(kind,rows){const map=new Map();for(const b of branches(kind,rows)){const primary=b.entries.find(r=>String(r.id)===b.id)||b.entries[0],org=brand(kind,primary);if(!map.has(org.key))map.set(org.key,{...org,branches:[]});map.get(org.key).branches.push(b);}return [...map.values()];}
  function candidates(kind,row,rows){
    if(!['labs','pharmacies'].includes(kind))return [];
    const identity=brand(kind,row),address=normalize(row.address),tokens=new Set(address.split(' ').filter(t=>t.length>2));
    return rows.filter(r=>String(r.id)!==String(row.id)).map(r=>{
      if((r.country_code||'EG')!==(row.country_code||'EG') || (r.governorate_code||'EG-DK')!==(row.governorate_code||'EG-DK') || normalize(r.markaz||r.city)!==normalize(row.markaz||row.city))return null;
      const sameBrand=brand(kind,r).key===identity.key || normalize(r.name)===normalize(row.name);
      if(!sameBrand)return null;
      const other=normalize(r.address),words=new Set(other.split(' ').filter(t=>t.length>2));
      const overlap=[...tokens].filter(t=>words.has(t)).length;
      const exact=address && address===other;
      return exact || (overlap>=3 && overlap/Math.max(1,Math.min(tokens.size,words.size))>=.65) ? {row:r,reason:exact?'same_address':'similar_address'} : null;
    }).filter(Boolean);
  }
  function reviewGroups(catalog){return ['pharmacies','labs'].flatMap(kind=>branches(kind,catalog[kind]||[]).filter(b=>b.entries.length>1).map(b=>({target:kind+':'+b.id,targets:b.entries.map(r=>kind+':'+r.id)})));}
  function reviewGroup(groups,target){return groups.find(g=>g.targets.includes(target)) || {target,targets:[target]};}
  function newer(a,b){return Number(a.updated_at||0)-Number(b.updated_at||0)||String(a.id).localeCompare(String(b.id));}
  function latest(rows){return [...rows].sort((a,b)=>newer(b,a))[0];}
  function uniqueReviews(rows,groups,own=false){const map=new Map();for(const r of rows){const key=(own?'own':r.author_id)+'|'+reviewGroup(groups,r.target_id).target;const old=map.get(key);if(!old||newer(r,old)>0)map.set(key,r);}return [...map.values()];}
  return Object.freeze({normalize,signature,branchKey,branches,brand,organizations,candidates,reviewGroups,reviewGroup,latest,uniqueReviews});
});
