import test from 'node:test';
import assert from 'node:assert/strict';
import P from '../src/member-profile.cjs';
import {effectiveProfile,proposedChanges} from '../src/profile-requests.mjs';
import {profileWriterFromDb,createImpersonatedProfileWriter} from '../src/profile-source-writer.mjs';
test('death detection is explicit and date aware; protected fields never enter profile projection',()=>{
 const at=Date.parse('2026-10-19T12:00:00Z');assert.equal(P.deceased({memberState:'مُتَوَفّى'},at),true);assert.equal(P.deceased({deathDate:'01/01/2020'},at),true);assert.equal(P.deceased({deathDate:'31/02/2020'},at),false);assert.equal(P.deceased({deathDate:'01/01/2030'},at),false);assert.equal(P.deceased({deceasedAt:{seconds:100}},at),true);
 const result=P.project({name:'اسم',nationalId:'private',passwordHash:'secret',privateField:'secret'});assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('secret'));
});
test('unchanged legacy formats do not become accidental corrections; source changes invalidate local overrides',()=>{
 const current=P.project({name:'اسم',phone:'010 12345678',birthDate:'تاريخ قديم',email:'غير متاح'});const values={...current,workplace:'مقر جديد'};
 assert.deepEqual(Object.keys(proposedChanges(values,current,current)),['workplace']);
 assert.deepEqual(effectiveProfile({email:'new'}, {email:{sourceBefore:'old',value:'local'}}).conflicts,['email']);
});
test('writer requires an existing document, checks the entire selected patch and never updates unselected fields',async()=>{
 let data={email:'old',jobTitle:'original',nationalId:'protected'},writes=[];
 const db={collection:()=>({doc:id=>({id})}),runTransaction:async action=>action({getAll:async(ref,options)=>{assert.ok(!options.fieldMask.includes('nationalId'));return [{exists:true,data:()=>({...data})}];},update:(ref,patch)=>{writes.push(patch);data={...data,...patch};}})};
 const writer=profileWriterFromDb(db);await writer.updateProfile('member',{email:{sourceBefore:'old',value:'new'}});assert.deepEqual(writes,[{email:'new'}]);assert.equal(data.nationalId,'protected');
 assert.equal((await writer.updateProfile('member',{email:{sourceBefore:'old',value:'new'}})).changed,false);
 await assert.rejects(()=>writer.updateProfile('member',{jobTitle:{sourceBefore:'original',value:'new job'},email:{sourceBefore:'old',value:'conflicting'}}),e=>e.code==='SOURCE_CHANGED');assert.equal(data.jobTitle,'original');
 await assert.rejects(()=>writer.updateProfile('member',{nationalId:{sourceBefore:'protected',value:'changed'}}),e=>e.status===400);
});
test('unconfigured, cross-project and read-only identities never become profile writers',()=>{
 assert.equal(createImpersonatedProfileWriter({account:''}),null);
 assert.equal(createImpersonatedProfileWriter({account:'reader@source.iam.gserviceaccount.com',sourceProject:'source',medicalProject:'medical',readOnlyAccount:'reader@source.iam.gserviceaccount.com'}),null);
 assert.equal(createImpersonatedProfileWriter({account:'writer@other.iam.gserviceaccount.com',sourceProject:'source',medicalProject:'medical'}),null);
});
