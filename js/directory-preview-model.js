/* Read-only presentation of the server-published directory. No fuzzy identity merges. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MedicalDirectoryModel=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const kinds=['records','hospitals','labs','radiology','pharmacies','specialized_centers'];
 const labels={records:'الأطباء',hospitals:'المستشفيات',labs:'التحاليل',radiology:'الأشعة',pharmacies:'الصيدليات',specialized_centers:'المراكز'};
 const icons={records:'doctors',hospitals:'hospitals',labs:'labs',radiology:'radiology',pharmacies:'pharmacies',specialized_centers:'centers'};
 const text=v=>v==null?'':String(v).replace(/\b(?:null|undefined|nan|none)\b/gi,'').trim();
 const usable=v=>{const s=text(v);return /تحتاج? (?:إلى )?تأكيد|تحتاج? مراجعة|اتصل لمعرفة|راجع حداثة|رقم منشور|غير مسجل/.test(s)?'':s;};
 const emptyFilters=()=>({query:'',kind:'all',markaz:'',specialty:'',network:'',limit:24});
 // Session-memory presentation choices; never infer them from member data.
 const readingPreferences=value=>({size:['standard','large','larger'].includes(value?.size)?value.size:'standard',compact:value?.compact===true,contrast:value?.contrast===true,calm:value?.calm===true});
 const safeStat=s=>Number.isInteger(s?.count)&&s.count>0&&Number.isFinite(s.average)&&s.average>=1&&s.average<=5?{count:s.count,average:s.average}:null;
 const networkText=values=>[...new Set(values)].map(v=>({employee:'الموظفون',family:'الأسر',retiree:'المعاشات'}[v])).filter(Boolean).join(' · ');
 function create(data,{facilities,search,contacts,research}){
  const catalog=data.catalog,providers=[],doctorMap=new Map();
  const dental=r=>/اسنان|لثه|تقويم|فكين/.test(search.normalize([r.specialty,r.category,r.name,...(r.services||[])].join(' ')));
  const section=(source,r)=>{if(!['hospitals','specialized_centers'].includes(source))return source;const category=text(r.category);if(/^مركز متخصص(?:$| · )/.test(category))return 'specialized_centers';if(/^مستشفى(?:$| )/.test(category))return 'hospitals';return source;};
  const hospitalOf=r=>(catalog.hospitals||[]).find(h=>h.id===r.contract_entity_id||[h.name,h.short_name].filter(Boolean).includes(r.hospital));
  function view(raw,source,network){
   let r={...raw};const hospital=source==='records'?hospitalOf(r):null;
   if(hospital&&(!usable(r.address)||search.normalize(r.address)===search.normalize(hospital.name)||search.normalize(r.address)===search.normalize(hospital.short_name)))r.address=hospital.address;
   const facts=source==='hospitals'?research?.hospital?.(r):null;
   if(facts?.address&&r.address===facts.originalAddress&&!r._version)r.address=facts.address;
   if(facts?.originalMap===r.maps_url&&['conflict','unresolved'].includes(facts?.mapStatus))r.maps_url='';
   let phones=contacts.forEntity(r),reception=false;
   if(!['mobile','landline','shortcode'].some(k=>phones[k].length)&&hospital&&(hospital.network_members||[]).some(n=>network.includes(n))){const rel=(hospital.contract_relationships||[]).find(c=>c.route==='family_network'&&network.some(n=>['family','retiree'].includes(n)));const groups=rel?.contact_groups||{};phones=contacts.forEntity(rel?{raw_phone:['mobile','landline','shortcode'].flatMap(k=>groups[k]||[]).join(' - ')}:hospital);reception=true;}
   const kind=section(source,r),specialty=dental(r)?'الأسنان':usable(r.specialty)||usable(r.category)||labels[kind];
   return {id:String(r.id),kind,specialty,dental:dental(r),name:usable(r.display_name)||usable(r.name),city:usable(r.markaz)||usable(r.city),address:usable(r.address),hours:usable(r.schedule)||usable(r.working_hours),hospital:usable(r.hospital),contract:usable(r.contract_entity),maps:usable(r.maps_url),network,phones,reception,services:(Array.isArray(r.services)?r.services:[]).map(text),raw:r};
  }
  function views(r,source){
   const network=(r.network_members||[]).filter(n=>['employee','family','retiree'].includes(n));
   const relationships=(r.contract_relationships||[]).filter(c=>c.route==='family_network'&&c.network_members?.length);
   if(!relationships.length)return [view(r,source,network)];
   const result=[],base=network.filter(n=>!['family','retiree'].includes(n));if(base.length)result.push(view(r,source,base));
   for(const rel of relationships){const groups=rel.contact_groups||{},phone=['mobile','landline','shortcode'].flatMap(k=>groups[k]||[]).join(' - ');result.push(view({...r,address:rel.address||r.address,raw_phone:phone,phone,hotline:'',phone_digits:'',contract_entity:'شبكة الأسر والمعاشات'},source,rel.network_members.filter(n=>network.includes(n))));}
   const valid=result.filter(v=>v.network.length);return valid.length?valid:[view(r,source,network)];
  }
  function branch(id,entries,source,target){return {id:String(id),target,views:entries.flatMap(r=>views(r,source)),suspended:entries.every(r=>r.service_status==='suspended')};}
  for(const r of catalog.records||[]){if(!r.provider_id)continue;const id='doctor:'+r.provider_id;if(!doctorMap.has(id)){const p={id,name:usable(r.display_name)||usable(r.name),source:'records',branches:[],avatar:r};doctorMap.set(id,p);providers.push(p);}doctorMap.get(id).branches.push(branch(r.id,[r],'records',id));}
  for(const source of kinds.filter(k=>k!=='records'))for(const org of facilities.organizations(source,catalog[source]||[]))providers.push({id:org.key,name:usable(org.name),source,avatar:org.branches[0].entries[0],branches:org.branches.map(b=>branch(b.id,b.entries,source,source+':'+b.id))});
  const byId=new Map(providers.map(p=>[p.id,p]));
  function matchingViews(b,f){return b.views.filter(v=>(!f.network||(f.network==='family'?v.network.some(n=>['family','retiree'].includes(n)):v.network.includes(f.network)))&&(f.kind==='all'||v.kind===f.kind)&&(!f.markaz||v.city===f.markaz)&&(!f.specialty||v.specialty===f.specialty));}
  const matchView=(p,v,query)=>search.match(query,{name:p.name,tags:[v.specialty,labels[v.kind],...v.services],details:[v.name,v.city,v.address,v.hospital,v.contract,...['mobile','landline','shortcode'].flatMap(k=>v.phones[k])]});
  function find(filters){const f={...emptyFilters(),...filters};return providers.flatMap(p=>{
   const matches=p.branches.flatMap(b=>matchingViews(b,f).map(v=>({b,v,...matchView(p,v,f.query)}))).filter(m=>m.score>0).sort((a,b)=>b.score-a.score);
   return matches.length?[{provider:p,...matches[0],matchingBranches:new Set(matches.map(m=>m.b.id)).size}]:[];
  }).sort((a,b)=>b.score-a.score||a.provider.name.localeCompare(b.provider.name,'ar'));}
  function suggestions(filters){
   const f={...emptyFilters(),...filters},groups=new Map();
   // Only existing specialty/city pairs in the selected network/section. No inferred eligibility.
   for(const p of providers)for(const b of p.branches)for(const v of matchingViews(b,f)){
    if(!v.specialty||!v.city)continue;const key=JSON.stringify([v.specialty,v.city]);
    if(!groups.has(key)){const label=v.specialty+' في '+v.city,match=search.match(f.query,{name:label,tags:[labels[v.kind]]});groups.set(key,{label,specialty:v.specialty,markaz:v.city,...match,providers:new Set()});}
    groups.get(key).providers.add(p.id);
   }
   return [...groups.values()].filter(g=>g.score>0&&!(f.specialty===g.specialty&&f.markaz===g.markaz&&!text(f.query))).sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label,'ar')).slice(0,3).map(g=>({label:g.label,count:g.providers.size,approximate:g.approximate,filters:{query:'',specialty:g.specialty,markaz:g.markaz,kind:f.kind,network:f.network}}));
  }
  function select(p,branchId,network){const b=p.branches.find(b=>b.id===branchId)||p.branches[0];const v=b.views.find(v=>network==='family'?v.network.some(n=>['family','retiree'].includes(n)):v.network.includes(network))||b.views[0];return {b,v};}
  function stat(p,b){return safeStat((p.source==='records'?data.stats?.[p.id]:data.facilityStats?.[b.target]||data.stats?.[b.target]));}
  function mapLink(p,v,address=v.address){
   if(!address)return null;
   if(address===v.address){try{const u=new URL(v.maps);if(u.protocol==='https:'&&['www.google.com','google.com','maps.google.com','maps.app.goo.gl','goo.gl','www.google.com.eg'].includes(u.hostname))return {href:u.href,label:/\/maps\/search|[?&](q|query)=/.test(u.href)?'البحث عن العنوان':'الخريطة'};}catch{}}
   return {href:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([p.name,address,v.city,'الدقهلية مصر'].filter(Boolean).join(' ')),label:'البحث عن العنوان'};
  }
  const values=key=>[...new Set(providers.flatMap(p=>p.branches.flatMap(b=>b.views.map(v=>v[key]))).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
  return {providers,byId,find,suggestions,matches:(p,v,query)=>matchView(p,v,query).score>0,select,stat,mapLink,cities:values('city'),specialties:values('specialty')};
 }
 return Object.freeze({create,kinds,labels,icons,text,usable,networkText,emptyFilters,readingPreferences});
});
