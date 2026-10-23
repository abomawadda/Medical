import {createHash} from 'node:crypto';
import facilities from './facility-directory.cjs';
import criteria from './review-criteria.cjs';
import {ApiError} from './core.mjs';
import {labProjection} from './development-lab.mjs';
import {insightsFeature,insightsMinimum,insightsLimit} from './lab-insights-policy.mjs';
const calendar=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'});
const day=value=>calendar.format(new Date(value));
const offset=(value,n)=>new Date(Date.parse(value+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const clean=value=>value==null?'':String(value).replace(/\b(?:null|undefined|nan|none)\b/gi,'').trim().slice(0,200);
const timestamp=value=>{const number=typeof value==='number'?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN;return Number.isSafeInteger(number)&&number>0?number:null;};
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const empty=()=>({count:0,sum:0,low:0,stars:[0,0,0,0,0]});
const identity=row=>JSON.stringify([row.author_id,row.target_id]);
function currentRows(rows){const values=new Map();for(const row of rows){const key=identity(row),previous=values.get(key);if(!previous||row.updated_at>previous.updated_at||row.updated_at===previous.updated_at&&row.id.localeCompare(previous.id)>0)values.set(key,row);}return [...values.values()];}
function measure(rows,key){const value=empty();for(const row of rows){const rating=key?row.criteria?.[key]:row.rating;if(!Number.isInteger(rating)||rating<1||rating>5)continue;value.count++;value.sum+=rating;value.low+=rating<=2?1:0;value.stars[rating-1]++;}const eligible=value.count>=insightsMinimum;return {count:value.count,eligible,average:eligible?Math.round(value.sum/value.count*100)/100:null,low:eligible?value.low:null,stars:eligible?value.stars:null};}
function summary(rows){return {...measure(rows),criteria:criteria.items.map(item=>({id:item.id,label:item.label,...measure(rows,item.id)}))};}
export function reviewInsights(catalog,source,period,at){
 if(!['all','30','90'].includes(period))fail(400,'INVALID_INSIGHTS_PERIOD','اختر كل الفترات أو آخر 30 أو 90 يومًا.');
 if(typeof source?.complete!=='boolean')fail(503,'INSIGHTS_SOURCE_UNAVAILABLE','تعذر التحقق من اكتمال مصدر المؤشرات.');
 const today=day(at),from=period==='all'?null:offset(today,1-Number(period)),base={period,today,from,timeBasis:'latest-submission-cairo-day',minimum:insightsMinimum,sourceLimit:insightsLimit,complete:source.complete,checkedAt:at,memberEnabled:false,readOnly:true};
 if(!base.complete)return {...base,state:'too_large',counts:null,overall:null,providers:[],activity:[]};
 const sourceRows=source.rows;if(!Array.isArray(sourceRows)||sourceRows.length>insightsLimit)fail(503,'INSIGHTS_SOURCE_UNAVAILABLE','تعذر التحقق من اكتمال مصدر المؤشرات.');
 const groups=facilities.reviewGroups(catalog),metadata=new Map(),canonical=target=>facilities.reviewGroup(groups,target).target;
 for(const kind of ['records','hospitals','labs','radiology','pharmacies','specialized_centers'])for(const row of catalog[kind]||[]){
  if(kind==='records'&&!row.provider_id)continue;
  const target=canonical(kind==='records'?'doctor:'+row.provider_id:kind+':'+row.id),section=kind==='hospitals'&&/^مركز متخصص(?:$| · )/.test(clean(row.category))?'specialized_centers':kind==='specialized_centers'&&/^مستشفى(?:$| )/.test(clean(row.category))?'hospitals':kind;
  if(!metadata.has(target))metadata.set(target,{id:target,name:clean(row.display_name)||clean(row.name)||'جهة بلا اسم مسجل',kind:section,places:[]});
  const place=[clean(row.branch_label),clean(row.markaz||row.city),kind==='records'?clean(row.hospital):''].filter(Boolean).join(' · '),places=metadata.get(target).places;if(place&&!places.includes(place)&&places.length<3)places.push(place);
 }
 const candidates=[],blocked=new Set();let malformed=0;
 for(const raw of sourceRows){
  if(!raw||typeof raw.author_id!=='string'||!raw.author_id||raw.author_id.length>300||typeof raw.target_id!=='string'||!raw.target_id||raw.target_id.length>400||typeof raw.id!=='string'||!raw.id||raw.id.length>200){malformed++;continue;}
  const target=canonical(raw.target_id),key=JSON.stringify([raw.author_id,target]),time=timestamp(raw.updated_at);
  if(!time||time>at||!['pending','published','hidden'].includes(raw.status)){blocked.add(key);malformed++;continue;}
  candidates.push({id:raw.id,author_id:raw.author_id,target_id:target,status:raw.status,rating:raw.rating,criteria:raw.criteria,updated_at:time});
 }
 const distinct=currentRows(candidates),latest=distinct.filter(row=>!blocked.has(identity(row))),selected=latest.filter(row=>!from||day(row.updated_at)>=from),published=[];
 for(const row of selected.filter(r=>r.status==='published')){if(!Number.isInteger(row.rating)||row.rating<1||row.rating>5){malformed++;continue;}const dimensions={},validDimensions=row.criteria&&typeof row.criteria==='object'&&!Array.isArray(row.criteria);if(row.criteria!==undefined&&!validDimensions)malformed++;for(const item of criteria.items){const value=validDimensions?row.criteria[item.id]:undefined;if(Number.isInteger(value)&&value>=1&&value<=5)dimensions[item.id]=value;else if(value!==undefined)malformed++;}published.push({...row,criteria:dimensions});}
 const byTarget=new Map();for(const row of published){if(!byTarget.has(row.target_id))byTarget.set(row.target_id,[]);byTarget.get(row.target_id).push(row);}
 const providers=[...byTarget].map(([target,rows])=>({...metadata.get(target)||{id:'unavailable:'+createHash('sha256').update(target).digest('hex').slice(0,24),name:'جهة لم تعد متاحة في الدليل الحالي',kind:'unavailable'},...summary(rows)})).sort((a,b)=>a.name.localeCompare(b.name,'ar')||a.id.localeCompare(b.id));
 return {...base,state:'ready',counts:{documents:sourceRows.length,current:latest.length,inPeriod:selected.length,published:published.length,pending:selected.filter(r=>r.status==='pending').length,hidden:selected.filter(r=>r.status==='hidden').length,duplicateDocuments:candidates.length-distinct.length,qualityIssues:malformed,quarantinedGroups:blocked.size},overall:summary(published),providers,activity:Array.from({length:14},(_,index)=>{const value=offset(today,index-13);return {day:value,count:published.filter(row=>day(row.updated_at)===value).length};})};
}
export function insightsLabService({store,authorize,now}){return {
 async labReviewInsights(token,period='all'){
  const guard=async()=>{await authorize(token,'admin');const feature=labProjection(insightsFeature,await store.labRead(insightsFeature.id));if(!feature.previewEnabled)fail(409,'LAB_PAUSED','لوحة صوت الأعضاء موقوفة من المعمل.');return feature;};
  const feature=await guard();if(!['all','30','90'].includes(period))fail(400,'INVALID_INSIGHTS_PERIOD','اختر كل الفترات أو آخر 30 أو 90 يومًا.');
  const [catalog,source]=await Promise.all([store.catalog(),store.reviewInsightsRead()]);
  const current=await guard();if(current.version!==feature.version)fail(409,'LAB_VERSION_CONFLICT','تغيرت مراجعة اللوحة؛ أعد التحقق.');
  return {audience:'admin',feature,...reviewInsights(catalog,source,period,now())};
 }
};}
