import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewInsights,insightsLabService} from '../src/lab-insights.mjs';
import {reviewInsightsStore} from '../src/review-insights-store.mjs';
import {insightsFields,insightsLimit,insightsFeature} from '../src/lab-insights-policy.mjs';
import {fixtureStore} from './memory-store.mjs';
import {ApiError} from '../src/core.mjs';
const at=Date.UTC(2026,9,23,10),catalog={records:[{id:'a',provider_id:'one',name:'طبيب مصطنع'},{id:'b',provider_id:'two',name:'طبيب مصطنع'}],labs:[{id:'l1',name:'معمل مصطنع',organization_id:'brand',organization_name:'معمل مصطنع',address:'عنوان واحد',markaz:'طلخا'},{id:'l2',name:'معمل مصطنع',organization_id:'brand',organization_name:'معمل مصطنع',address:'عنوان واحد',markaz:'طلخا'}]},row=(id,more={})=>({id,author_id:'opaque-'+id,target_id:'doctor:one',status:'published',rating:4,criteria:{reception:5,waiting:2},updated_at:at-1000,author_name:'PRIVATE_NAME',comment:'PRIVATE_COMMENT',employee_code:'PRIVATE_CODE',...more});
const run=(rows,period='all')=>reviewInsights(catalog,{complete:true,rows},period,at);
test('insights contain only aggregates and omit all identities and comment fields',()=>{
 const rows=Array.from({length:5},(_,i)=>row('r'+i)),before=structuredClone(rows),report=run(rows),text=JSON.stringify(report);
 assert.equal(report.overall.count,5);assert.equal(report.overall.average,4);assert.deepEqual(report.overall.stars,[0,0,0,5,0]);assert.equal(report.overall.criteria[0].average,5);assert.equal(report.overall.criteria[1].low,5);
 for(const forbidden of ['PRIVATE_NAME','PRIVATE_COMMENT','PRIVATE_CODE','opaque-','author_id','author_name','comment','employee_code'])assert.ok(!text.includes(forbidden),forbidden);
 assert.deepEqual(rows,before);assert.equal(report.readOnly,true);assert.equal(report.memberEnabled,false);
});
test('latest versions shadow old publication before period filtering, without conflating same-named doctors',()=>{
 const result=run([row('old',{author_id:'same',updated_at:at-9000}),row('new',{author_id:'same',status:'pending'}),row('different',{target_id:'doctor:two'})]);
 assert.equal(result.counts.pending,1);assert.equal(result.counts.published,1);assert.equal(result.counts.duplicateDocuments,1);assert.equal(result.providers[0].id,'doctor:two');
 const distinct=run([row('one'),row('two',{target_id:'doctor:two'})]);assert.equal(distinct.providers.length,2);
});
test('organization branches do not collapse just because names and brand match',()=>{
 const result=run([row('old',{author_id:'same',target_id:'labs:l1',updated_at:at-2000}),row('new',{author_id:'same',target_id:'labs:l2',status:'hidden'})]);
 assert.equal(result.counts.current,2);assert.equal(result.counts.hidden,1);assert.equal(result.counts.published,1);assert.equal(result.providers.length,1);
});
test('small samples suppress every score and distribution; missing criteria are never zeros',()=>{
 const small=run([row('a'),row('b')]);assert.equal(small.overall.average,null);assert.equal(small.overall.low,null);assert.equal(small.overall.stars,null);assert.equal(small.providers[0].average,null);
 const rows=Array.from({length:6},(_,i)=>row('r'+i,{criteria:i<4?{waiting:1}:undefined})),report=run(rows);
 assert.equal(report.overall.average,4);assert.equal(report.overall.criteria.find(x=>x.id==='waiting').count,4);assert.equal(report.overall.criteria.find(x=>x.id==='waiting').average,null);assert.equal(report.overall.criteria.find(x=>x.id==='service').count,0);
});
test('periods use Cairo calendar days and latest submission, not moderation or claimed visit dates',()=>{
 const boundary=Date.UTC(2026,8,23,21),rows=[row('in',{updated_at:boundary,moderated_at:at}),row('out',{updated_at:boundary-1,moderated_at:at})];
 const report=run(rows,'30');assert.equal(report.from,'2026-09-24');assert.equal(report.overall.count,1);assert.equal(run(rows,'all').overall.count,2);
 assert.throws(()=>run(rows,'31'),e=>e.code==='INVALID_INSIGHTS_PERIOD');assert.equal(report.activity.length,14);
});
test('unavailable metadata is hashed and malformed latest date quarantines the whole identity group',()=>{
 const report=run([row('a',{author_id:'same'}),row('bad',{author_id:'same',updated_at:'not-a-date'}),row('future',{updated_at:at+1}),row('ambiguous',{updated_at:'01/02/2026'}),row('rating',{rating:8}),row('missing',{author_id:''}),row('unknown',{target_id:'PRIVATE_CODE'})]);
 assert.equal(report.counts.quarantinedGroups,3);assert.equal(report.overall.count,1);assert.ok(report.counts.qualityIssues>=4);assert.equal(report.providers[0].kind,'unavailable');assert.ok(!JSON.stringify(report).includes('PRIVATE_CODE'));
});
test('oversized or unverified sources never yield biased partial metrics',()=>{
 const report=reviewInsights(catalog,{complete:false,rows:[row('a')]},'all',at);assert.equal(report.state,'too_large');assert.equal(report.overall,null);assert.equal(report.counts,null);assert.deepEqual(report.providers,[]);
 assert.throws(()=>reviewInsights(catalog,{},'all',at),e=>e.status===503);assert.throws(()=>run(Array.from({length:2001},(_,i)=>row('r'+i))),e=>e.status===503);
});
test('identity tuples cannot collide on separators and order is deterministic for tied timestamps',()=>{
 const report=run([row('a',{author_id:'a|doctor:x',target_id:'doctor:y'}),row('b',{author_id:'a',target_id:'doctor:x|doctor:y'})]);assert.equal(report.counts.current,2);
 const first=row('a',{author_id:'same',status:'published'}),second=row('z',{author_id:'same',status:'hidden'});assert.deepEqual(run([first,second]),run([second,first]));assert.equal(run([first,second]).counts.hidden,1);
});
test('stored insight reads project no names or comments and request at most the bound plus one',async()=>{
 let selected,limit,order;const db={collection(name){assert.equal(name,'medical_reviews');return {orderBy(value){order=value;return this;},select(...fields){selected=fields;return this;},limit(value){limit=value;return this;},async get(){return {size:1,docs:[{id:'r',data:()=>row('forged',{privateExtra:'PRIVATE_EXTRA'})}]};}};}};
 const source=await reviewInsightsStore(db).reviewInsightsRead();assert.equal(order,'__name__');assert.equal(limit,insightsLimit+1);assert.deepEqual(selected,[...insightsFields]);assert.equal(source.rows[0].id,'r');assert.ok(!JSON.stringify(source).includes('PRIVATE_NAME'));assert.ok(!JSON.stringify(source).includes('PRIVATE_EXTRA'));
});
function fixture(){const store=fixtureStore(catalog);let revoked=false;const service=insightsLabService({store,now:()=>at,authorize:async token=>{if(!token)throw new ApiError(401,'UNAUTHORIZED','');if(token==='member'||revoked)throw new ApiError(403,'FORBIDDEN','');return {sourceId:token};}});return {store,service,revoke:()=>{revoked=true;}};}
test('every read requires live administrator authority and supports pause without any source writes',async()=>{
 const f=fixture(),before=await f.store.catalog();f.store.reviews.set('r',row('r'));const reviews=structuredClone([...f.store.reviews]);
 for(const [token,status]of [['',401],['member',403]])await assert.rejects(()=>f.service.labReviewInsights(token),e=>e.status===status);
 const result=await f.service.labReviewInsights('admin');assert.equal(result.feature.previewRevision,insightsFeature.previewRevision);assert.equal(result.audience,'admin');
 f.store.labRows.set(insightsFeature.id,{previewEnabled:false});await assert.rejects(()=>f.service.labReviewInsights('admin'),e=>e.code==='LAB_PAUSED');assert.deepEqual(await f.store.catalog(),before);assert.deepEqual([...f.store.reviews],reviews);assert.equal(f.store.audit.length,0);
});
test('revocation or pause while a source is being read prevents delivery of the aggregates',async()=>{
 for(const action of ['revoke','pause']){const f=fixture();f.store.reviewInsightsRead=async()=>{if(action==='revoke')f.revoke();else f.store.labRows.set(insightsFeature.id,{previewEnabled:false});return {complete:true,rows:[row('r')]};};await assert.rejects(()=>f.service.labReviewInsights('admin'),e=>action==='revoke'?e.status===403:e.code==='LAB_PAUSED');}
});
test('invalid periods fail before reading review source',async()=>{
 const f=fixture();let reads=0;f.store.reviewInsightsRead=async()=>{reads++;return {complete:true,rows:[]};};await assert.rejects(()=>f.service.labReviewInsights('admin','invalid'),e=>e.status===400);assert.equal(reads,0);
});
