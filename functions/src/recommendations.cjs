(function(root,factory){const value=factory(typeof module==='object'&&module.exports?require('./facility-directory.cjs'):root.MedicalFacilities);if(typeof module==='object'&&module.exports)module.exports=value;else root.MedicalRecommendations=value;})(typeof globalThis!=='undefined'?globalThis:this,function(F){
  'use strict';
  const policy=Object.freeze({minimumCount:5,minimumAverage:4,priorWeight:5,priorAverage:3.5});
  const labels={hospitals:'المستشفيات',labs:'معامل التحاليل',radiology:'مراكز الأشعة',pharmacies:'الصيدليات',specialized_centers:'المراكز المتخصصة'};
  const text=v=>typeof v==='string' && !/^(null|undefined)$/i.test(v.trim())?v.trim():'';
  const valid=s=>Number.isInteger(s?.count)&&s.count>0&&Number.isFinite(s.average)&&s.average>=1&&s.average<=5;
  const rating=s=>({count:s?.count,average:s?.average});
  const active=r=>r.directory_visibility!=='hidden' && r.contract_listing!==false && r.service_status!=='suspended';
  // Call only with the server's member-visible projection, including parent state.
  function build(catalog,stats,grouped={}){
    const candidates=[],doctors=new Map();
    for(const r of catalog.records || [])if(active(r)&&r.provider_id){const key='doctor:'+r.provider_id;if(!doctors.has(key))doctors.set(key,[]);doctors.get(key).push(r);}
    for(const [target,rows] of doctors){const specialty=text(rows[0].specialty) || 'الأطباء';candidates.push({target,kind:'records',ids:rows.map(r=>String(r.id)),category:'doctor:'+F.normalize(specialty),label:specialty,specialty,...rating(stats[target])});}
    for(const [kind,label] of Object.entries(labels))for(const branch of F.branches(kind,(catalog[kind] || []).filter(active))){
      const target=kind+':'+branch.id,category=text(branch.entries[0].category) || label;
      candidates.push({target,kind,ids:branch.entries.map(r=>String(r.id)),category:kind+':'+F.normalize(category),label:category,...rating(grouped[target] || stats[target])});
    }
    return candidates.filter(valid).filter(r=>r.count>=policy.minimumCount && r.average>=policy.minimumAverage).map(r=>({...r,score:(r.average*r.count+policy.priorAverage*policy.priorWeight)/(r.count+policy.priorWeight)}))
      .sort((a,b)=>b.score-a.score || b.count-a.count || b.average-a.average || a.target.localeCompare(b.target));
  }
  function select(rows,{limit=3,diverse=true}={}){const used=new Set(),targets=new Set(),out=[];for(const r of rows){if(targets.has(r.target)||(diverse&&used.has(r.category)))continue;out.push(r);used.add(r.category);targets.add(r.target);if(out.length>=limit)break;}return out;}
  return Object.freeze({policy,build,select});
});
