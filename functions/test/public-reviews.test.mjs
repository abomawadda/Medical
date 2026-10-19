import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedExperiences,reviewSummary,publicReviewPage} from '../src/public-reviews.mjs';
test('latest alias experience determines both public comments and each criterion denominator',()=>{
 const group={target:'labs:a',targets:['labs:a','labs:b']};
 const rows=[{id:'1',target_id:'labs:a',author_id:'a',status:'published',rating:5,criteria:{reception:5},share_comment:true,comment:'old',updated_at:1},{id:'2',target_id:'labs:b',author_id:'a',status:'pending',rating:1,criteria:{reception:1},share_comment:true,comment:'pending',updated_at:2},{id:'3',target_id:'labs:a',author_id:'b',status:'published',rating:3,criteria:{waiting:4},share_comment:true,comment:'approved',updated_at:3}];
 const approved=approvedExperiences(rows,group);assert.equal(approved.length,1);assert.equal(publicReviewPage(approved).comments[0].comment,'approved');
 const summary=reviewSummary(approved);assert.equal(summary.average,3);assert.deepEqual(summary.criteria.reception,{count:0,average:null});assert.deepEqual(summary.criteria.waiting,{count:1,average:4});
});
test('anonymous projection strips account fields and known names, email and numeric identifiers in shared text',()=>{
 const row={id:'private-id',author_id:'private-author',author_name:'اسم اختبار كامل',share_comment:true,rating:4,comment:'اسم اختبار كامل بريدي member@example.invalid ورقمي 01012345678',criteria:{reception:5,private:123},updated_at:1};
 const result=publicReviewPage([row]);const text=JSON.stringify(result);
 for(const value of ['private-id','private-author','اسم اختبار كامل','member@example.invalid','01012345678','"private"'])assert.ok(!text.includes(value));
 assert.equal(result.comments[0].criteria.reception,5);
 assert.equal(publicReviewPage([{...row,share_comment:undefined}]).comments.length,0);
});
