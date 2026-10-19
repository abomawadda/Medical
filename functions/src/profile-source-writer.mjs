import {ApiError} from './core.mjs';
import P from './member-profile.cjs';
import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
// Sole source-writing surface: existing member documents and an explicit field mask.
// It never receives request-body IDs, creates/deletes members, or touches Auth/IAM.
export function profileWriterFromDb(db){return {async updateProfile(sourceId,changes){
 if(!/^[^/]{1,150}$/.test(sourceId)||!Object.keys(changes).length||Object.keys(changes).some(k=>!P.fields.some(f=>f.key===k)))throw new ApiError(400,'INVALID_PROFILE','حقول تحديث المصدر غير صالحة.');
 return db.runTransaction(async tx=>{
  const ref=db.collection('employees').doc(sourceId),[snapshot]=await tx.getAll(ref,{fieldMask:[...P.fields.map(f=>f.key),'dateOfBirth','retireDate','retiredAt','dateOfDeath','deceasedAt']});
  if(!snapshot.exists)throw new ApiError(409,'SOURCE_CHANGED','السجل الأصلي غير موجود.');
  const current=P.project(snapshot.data()),patch={};
  for(const [key,change] of Object.entries(changes)){if(current[key]===change.value)continue;if(current[key]!==change.sourceBefore)throw new ApiError(409,'SOURCE_CHANGED','تغير السجل الأصلي؛ أُوقف التحديث لحماية البيانات الأحدث.');patch[key]=change.value;}
  if(Object.keys(patch).length)tx.update(ref,patch);
  return {success:true,changed:!!Object.keys(patch).length};
 });
}};}
export function createImpersonatedProfileWriter({account,sourceProject,medicalProject,readOnlyAccount}){
 if(!account)return null;
 if(account===readOnlyAccount || sourceProject===medicalProject || !new RegExp('^[a-z][a-z0-9-]+@'+sourceProject.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\.iam\\.gserviceaccount\\.com$').test(account))return null;
 const credential={async getAccessToken(){
  const source=await applicationDefault().getAccessToken();
  const response=await fetch('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+encodeURIComponent(account)+':generateAccessToken',{method:'POST',headers:{Authorization:'Bearer '+source.access_token,'Content-Type':'application/json'},body:JSON.stringify({scope:['https://www.googleapis.com/auth/datastore'],lifetime:'600s'}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new ApiError(503,'SOURCE_WRITER_UNAVAILABLE','تعذر تفويض هوية تحديث المصدر؛ لم يُعتمد نجاح العملية.');
  const value=await response.json();if(!value.accessToken)throw new Error('Writer token unavailable');return {access_token:value.accessToken,expires_in:Math.max(1,Math.floor((Date.parse(value.expireTime)-Date.now())/1000))};
 }};
 const app=getApps().find(a=>a.name==='membership-profile-writer') || initializeApp({projectId:sourceProject,credential},'membership-profile-writer');
 return profileWriterFromDb(getFirestore(app));
}
