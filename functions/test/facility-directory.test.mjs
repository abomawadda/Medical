import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import facilities from '../src/facility-directory.cjs';
import arabic from '../src/arabic-directory.cjs';
import {groupedReviewStats} from '../src/facility-review-stats.mjs';
import {fixtureStore} from './memory-store.mjs';
import {memberCatalog,targets} from '../src/core.mjs';
const data=JSON.parse(await readFile(new URL('../../data.json',import.meta.url),'utf8'));
const policy=JSON.parse(await readFile(new URL('../../imports/facility-branch-links-20261018.json',import.meta.url),'utf8'));

test('seven reviewed branch groups remove eight redundant cards while retaining every source contract and ID',()=>{
 let reduction=0;
 for(const kind of ['labs','pharmacies']){
  const branches=facilities.branches(kind,data[kind]);reduction+=data[kind].length-branches.length;
  assert.equal(branches.flatMap(b=>b.entries).length,data[kind].length);
  for(const g of policy.groups.filter(g=>g.kind===kind)){
   const branch=branches.find(b=>b.id===g.ids[0]);assert.deepEqual(new Set(branch.entries.map(r=>r.id)),new Set(g.ids));
   assert.deepEqual(new Set(branch.network_members),new Set(branch.entries.flatMap(r=>r.network_members)));
  }
 }
 assert.equal(reduction,8);
});
test('same chain and shared shortcode do not merge different branches; changed source addresses break a reviewed link safely',()=>{
 const rows=data.labs.filter(r=>r.id.startsWith('staff_12'));
 assert.equal(facilities.branches('labs',rows).length,rows.length);
 const group=policy.groups[0],source=group.ids.map(id=>structuredClone(data.labs.find(r=>r.id===id)));
 source[0].address='شارع آخر - برج مختلف';assert.equal(facilities.branches('labs',source).length,2);
 const org=facilities.organizations('labs',data.labs).find(o=>o.name==='معامل المختبر');assert.ok(org.branches.length>3);
});
test('member visibility precedes grouping: a hidden alias cannot donate networks, contact details, review targets or ratings',()=>{
 const pair=policy.groups[0].ids.map(id=>structuredClone(data.labs.find(r=>r.id===id)));
 pair[1].directory_visibility='hidden';
 const allowed=memberCatalog({labs:pair});const grouped=facilities.branches('labs',allowed.labs);
 assert.equal(grouped[0].entries.length,1);assert.deepEqual(grouped[0].network_members,['employee']);
 assert.equal(targets(allowed).has('labs:'+pair[1].id),false);
 assert.equal(facilities.reviewGroups(allowed).length,0);
});
test('grouped statistics count the newest author experience once; pending newer duplicates exclude the older published score',()=>{
 const group={target:'labs:a',targets:['labs:a','labs:b']};
 const rows=[{id:'1',author_id:'member1',target_id:'labs:a',rating:5,status:'published',updated_at:1},{id:'2',author_id:'member1',target_id:'labs:b',rating:1,status:'published',updated_at:2},{id:'3',author_id:'member2',target_id:'labs:a',rating:3,status:'published',updated_at:3}];
 assert.deepEqual(groupedReviewStats([group],rows)['labs:a'],{count:2,average:2});
 assert.deepEqual(groupedReviewStats([group],rows)['labs:a'],groupedReviewStats([group],rows)['labs:b']);
 rows[1].status='pending';assert.deepEqual(groupedReviewStats([group],rows)['labs:a'],{count:1,average:3});
 assert.equal(facilities.uniqueReviews(rows,[group]).length,2);
});
test('saving from a second alias edits the latest existing authored review, retaining its ID and idempotent revision',async()=>{
 const store=fixtureStore({});
 const old={id:'old',target_id:'labs:b',branch_id:'b',author_id:'member',author_name:'عضو اختبار',rating:4,comment:'تجربة مصطنعة',visited_declared:true,updated_at:1};
 await store.saveReview(old);
 const save=await store.saveReview({...old,id:'new',target_id:'labs:a',updated_at:2},['old','new']);
 assert.equal(save.changed,false);assert.equal(store.reviews.size,1);
 await store.saveReview({...old,id:'new',target_id:'labs:a',branch_id:'a',rating:2,updated_at:3},['old','new']);
 assert.equal(store.reviews.size,1);assert.equal(store.reviews.get('old').revision,2);
 assert.equal(store.reviews.get('old').target_id,'labs:b');
});


test('orthographic display cleanup preserves reviewed identities, while a country change detaches even the canonical source',()=>{
 for(const g of policy.groups){
  const rows=g.ids.map(id=>arabic.entity(data[g.kind].find(r=>r.id===id)));
  assert.equal(facilities.branches(g.kind,rows).length,1);
  rows[0].country_code='SA';assert.equal(facilities.branches(g.kind,rows).length,2);
 }
});

test('an explicit administrative beneficiary override preserves imported evidence without silently restoring a removed network',async()=>{
 const {withFamilyContracts}=await import('../src/family-projection.mjs');
 const seed={contract_relationships:[{id:'family_source',source_ref:'family-20261018',network_members:['family','retiree']}]};
 const row=withFamilyContracts(seed,{id:'test',network_members:['employee'],network_override:true});
 assert.deepEqual(row.network_members,['employee']);assert.equal(row.contract_relationships[0].id,'family_source');
});
