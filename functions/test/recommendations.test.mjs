import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../src/recommendations.cjs';
import {memberCatalog} from '../src/core.mjs';
const doctor=(id,extra={})=>({id,provider_id:id,name:'طبيب اختبار',specialty:'باطنة',network_members:['employee'],...extra});
test('recommendations require five real published ratings and at least four stars; malformed and insufficient totals never qualify',()=>{
 const catalog={records:['one','four','five','low','bad'].map(id=>doctor(id))};
 const values={one:{count:1,average:5},four:{count:4,average:5},five:{count:5,average:4},low:{count:90,average:3.9},bad:{count:5,average:NaN}};
 const stats=Object.fromEntries(Object.entries(values).map(([id,s])=>['doctor:'+id,s]));
 assert.deepEqual(R.build(catalog,stats).map(r=>r.target),['doctor:five']);assert.equal(R.build(catalog,{}).length,0);
});
test('confidence weighting prevents a small perfect sample automatically winning over many strong experiences',()=>{
 const rows=R.build({records:[doctor('small'),doctor('many')]},{'doctor:small':{count:5,average:5},'doctor:many':{count:50,average:4.7}});
 assert.equal(rows[0].target,'doctor:many');assert.equal(rows[0].average,4.7);assert.equal(rows[0].count,50);
 assert.equal(R.select(rows).length,1);
});
test('hidden, blocked, suspended and hidden-parent providers are excluded; doctor identity is never repeated for multiple addresses',()=>{
 const all=memberCatalog({records:[doctor('p',{id:'a',hospital:'مستشفى اختبار'}),doctor('p',{id:'b',hospital:'مستشفى اختبار'}),doctor('hidden',{directory_visibility:'hidden'}),doctor('blocked',{contract_listing:false}),doctor('paused',{service_status:'suspended'}),doctor('parent',{hospital:'مستشفى مخفية',contract_type:'hospital',contract_entity_id:'h'})],hospitals:[{id:'h',name:'مستشفى مخفية',directory_visibility:'hidden'}]});
 const stats=Object.fromEntries(['p','hidden','blocked','paused','parent'].map(p=>['doctor:'+p,{count:10,average:5}]));
 const rows=R.build(all,stats);assert.equal(rows.length,1);assert.deepEqual(rows[0].ids,['a','b']);
});
test('home selections are diverse, deterministic and capped; only aggregates leave the builder',()=>{
 const catalog={records:[doctor('a'),doctor('b'),doctor('c',{specialty:'أطفال'}),doctor('d',{specialty:'جلدية'})],labs:[{id:'lab',name:'معمل اختبار'}]};
 const stats=Object.fromEntries(['a','b','c','d'].map(p=>['doctor:'+p,{count:8,average:4.5,author_name:'secret',comment:'secret'}]));stats['labs:lab']={count:7,average:4.5};
 const result=R.build(catalog,stats);assert.equal(R.select(result).length,3);assert.equal(R.select(result,{limit:1,diverse:false}).length,1);assert.equal(new Set(R.select(result).map(r=>r.category)).size,3);assert.ok(!JSON.stringify(result).includes('secret'));
 assert.equal(R.build({...catalog,records:[...catalog.records].reverse()},stats)[0].target,result[0].target);
 assert.equal(R.build({labs:[{id:'lab',category:'null'}]},stats)[0].label,'معامل التحاليل');
});
