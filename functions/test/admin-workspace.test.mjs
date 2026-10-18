import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../src/core.mjs';
import {fixtureStore} from './memory-store.mjs';
const unlisted={id:'hidden',name:'مستشفى اختبار مستقل',contract_listing:false,contract_type:'independent',contract_entity:'مستشفى اختبار مستقل',contract_entity_id:'hidden',directory_visibility:'hidden'};
async function setup(){
 const account={name:'مدير اختبار',email:'admin@example.invalid',role:'admin',accountStatus:'active',firebaseUid:'uid',passwordHash:'not-to-be-exposed'};
 const employee={name:'عضو اختبار',jobId:'00123',phone:'01012345678',nationalId:'29901010101234',memberState:'نشط'};
 const store=fixtureStore({hospitals:[unlisted],records:[{id:1,provider_id:'p1',name:'طبيب اختبار',specialty:'باطنة',hospital:unlisted.name,contract_listing:true,contract_type:'hospital',contract_entity:unlisted.name,contract_entity_id:unlisted.id}]});
 const source={verifyAdminIdentity:async()=>({uid:'uid'}),findAccounts:async()=>[{id:'admin',...account}],getAccount:async()=>account,findEmployees:async()=>[{id:'member',...employee}],getEmployee:async()=>employee};
 const service=createService({source,store,secret:'isolated-admin-workspace-secret-1234567890',adminAccountIds:['admin'],allowedStates:['نشط']});
 const admin=(await service.adminLogin({email:account.email,password:'fixture'},'local')).token;
 const member=(await service.memberLogin({employee_code:'00123',phone:employee.phone,last4:'1234'},'local-member')).token;
 return {service,store,admin,member,account};
}
test('administrator explicitly approves an unlisted hospital, keeps authority after edits and can hide it again',async()=>{
 const f=await setup();assert.equal((await f.service.catalog(f.member)).catalog.hospitals.length,0);
 const body={field:'directory_visibility',value:'visible',scope:'entity',versions:{hidden:0}};
 await assert.rejects(()=>f.service.setEntityState(f.member,'hospitals','hidden',{...body,approve_contract:true}),e=>e.status===403);
 await assert.rejects(()=>f.service.setEntityState(f.admin,'hospitals','hidden',body),e=>e.code==='APPROVAL_REQUIRED');
 await f.service.setEntityState(f.admin,'hospitals','hidden',{...body,approve_contract:true});
 let row=(await f.service.catalog(f.member)).catalog.hospitals[0];assert.equal(row.id,'hidden');assert.ok(!('publication_approval' in row));
 assert.equal((await f.service.catalog(f.member)).catalog.records.length,1);
 const own=(await f.service.catalog(f.admin)).catalog.hospitals[0];
 await f.service.putEntity(f.admin,'hospitals','hidden',{entity:{...own,address:'عنوان مُحدّث',publication_approval:{status:'approved',by:'forged'}},expected_version:1});
 assert.equal((await f.service.catalog(f.admin)).catalog.hospitals[0].publication_approval.by,'admin');
 await f.service.setEntityState(f.admin,'hospitals','hidden',{field:'directory_visibility',value:'hidden',scope:'entity',versions:{hidden:2}});
 assert.equal((await f.service.catalog(f.member)).catalog.hospitals.length,0);assert.equal((await f.service.catalog(f.member)).catalog.records.length,0);
});
test('new hospitals can contract for themselves; client metadata cannot substitute for an explicit admin approval',async()=>{
 const f=await setup();const entity={...unlisted,id:'new',contract_entity_id:'new',directory_visibility:'visible',publication_approval:{status:'approved'}};
 await f.service.putEntity(f.admin,'hospitals','new',{entity,expected_version:0});
 assert.ok(!(await f.service.catalog(f.member)).catalog.hospitals.some(r=>r.id==='new'));
 await f.service.putEntity(f.admin,'hospitals','new',{entity,expected_version:1,approve_contract:true});
 assert.equal((await f.service.catalog(f.member)).catalog.hospitals.find(r=>r.id==='new').contract_entity_id,'new');
 await assert.rejects(()=>f.service.putEntity(f.admin,'hospitals','bad',{entity:{name:'بدون تعاقد'},expected_version:0,approve_contract:true}),e=>e.code==='CONTRACT_REQUIRED');
});
test('dictionary values persist across sessions, deduplicate and remain administrator-only',async()=>{
 const f=await setup();
 await assert.rejects(()=>f.service.addAdminOption(f.member,'specialty',{value:'تخصص'}),e=>e.status===403);
 await assert.rejects(()=>f.service.adminOptions(f.member),e=>e.status===403);
 await f.service.addAdminOption(f.admin,'specialty',{value:'أمراض  المناعة'});
 await f.service.addAdminOption(f.admin,'specialty',{value:'امراض المناعه'});
 assert.deepEqual((await f.service.adminOptions(f.admin)).options.specialty,['أمراض المناعة']);
 await assert.rejects(()=>f.service.addAdminOption(f.admin,'role',{value:'owner'}),e=>e.code==='INVALID_OPTION');
 await assert.rejects(()=>f.service.addAdminOption(f.admin,'markaz',{value:'<script>'}),e=>e.code==='INVALID_OPTION');
 const next=(await f.service.adminLogin({email:f.account.email,password:'fixture'},'another-session')).token;
 assert.deepEqual((await f.service.adminOptions(next)).options.specialty,['أمراض المناعة']);
});
test('admin profile is restricted to its own session and never returns credentials',async()=>{
 const f=await setup();await assert.rejects(()=>f.service.adminProfile(f.member),e=>e.status===403);
 const {profile}=await f.service.adminProfile(f.admin);assert.equal(profile.name,f.account.name);assert.equal(profile.email,f.account.email);
 assert.ok(profile.lastLoginAt);assert.ok(!JSON.stringify(profile).includes('passwordHash'));
 f.account.role='member';await assert.rejects(()=>f.service.adminOptions(f.admin),e=>e.status===403);
});
