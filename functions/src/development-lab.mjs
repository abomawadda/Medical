import {insightsFeature} from './lab-insights-policy.mjs';
import {inboxFeature} from './lab-inbox-policy.mjs';
import {importFeature} from './lab-import-policy.mjs';
import {roadmapFeatures,roadmapPolicy} from './lab-roadmap-policy.mjs';
import {visitId,visitRevision,visitIssues,visitStates,visitOutcomes} from './lab-visit.mjs';
import {ApiError} from './core.mjs';
const revision='p1-20261019-1';
export const labFeatures=Object.freeze([
 {id:'compact_home',proposal:'N-D01',phase:'P1',title:'الرئيسية المختصرة',description:'بحث واضح واختصارات وخبر مهم، دون قائمة تخصصات طويلة.',previewRevision:revision},
 {id:'provider_card',proposal:'N-D02',phase:'P1',title:'بطاقة الجهة',description:'معلومات مختصرة وحالة واضحة ومدخل واحد للتفاصيل.',previewRevision:revision},
 {id:'provider_details',proposal:'N-D03',phase:'P1',title:'صفحة تفاصيل الجهة',description:'تفاصيل وفروع وتجارب أعضاء، مع إجراءات زيارة ثابتة.',previewRevision:revision},
 {id:'directory_experience',proposal:'N-D01–N-D07',phase:'P1',title:'تجربة الدليل المترابطة',description:'الدليل المنشور: اقتراحات بحث ومرشحات ظاهرة وقراءة مريحة وبطاقات وتفاصيل وفروع، للقراءة فقط.',previewRevision:'p1-directory-20261023-2'},
 {id:visitId,proposal:'N-S02 / N-S03',phase:'P2',title:'جهّز زيارتي والبلاغات',description:'ملخص زيارة من الدليل المنشور، ومسار بلاغات تجريبية معزول عن التشغيل.',previewRevision:visitRevision},
 ...roadmapFeatures,
 importFeature,
 inboxFeature,
 insightsFeature,
].map(Object.freeze));
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const definition=id=>{const f=labFeatures.find(f=>f.id===id);if(!f)fail(404,'LAB_NOT_FOUND','هذه المعاينة غير موجودة.');return f;};
export function labProjection(feature,saved={}){
 const current=saved.previewRevision===feature.previewRevision;
 return {...feature,version:Number.isSafeInteger(saved.version)?saved.version:0,audience:'admin',memberEnabled:false,memberReleaseSupported:false,syntheticOnly:!['review_insights','admin_inbox','catalog_staging','directory_experience',visitId,...roadmapFeatures.map(f=>f.id)].includes(feature.id),dataMode:feature.dataMode || (feature.id===visitId?'directory-sandbox':feature.id==='directory_experience'?'directory-readonly':'synthetic'),
  previewEnabled:saved.previewEnabled!==false,review:current&&['pending','needs_changes','approved'].includes(saved.review)?saved.review:'pending',note:current&&typeof saved.note==='string'?saved.note:'',updatedAt:saved.updatedAt || null,
  staleApproval:!current&&saved.review==='approved',history:Array.isArray(saved.history)?saved.history.slice(-20):[]};
}
export function labDecision(feature,saved,body,actor,at){
 if(!body||typeof body!=='object'||Object.keys(body).some(k=>!['expected_version','previewRevision','review','note','previewEnabled'].includes(k)))fail(400,'INVALID_LAB_DECISION','حقول قرار المعاينة غير صالحة.');
 if(!Number.isSafeInteger(body.expected_version)||body.expected_version<0||body.previewRevision!==feature.previewRevision)fail(409,'LAB_REVISION_CHANGED','تغير إصدار المعاينة؛ أعد فتحها قبل القرار.');
 if(!['pending','needs_changes','approved'].includes(body.review)||typeof body.previewEnabled!=='boolean'||typeof body.note!=='string'||body.note.length>1000||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.note))fail(400,'INVALID_LAB_DECISION','راجع القرار وملاحظات التصميم.');
 const current=labProjection(feature,saved),note=body.note.trim();
 if(current.previewEnabled===body.previewEnabled&&current.review===body.review&&current.note===note&&saved?.previewRevision===feature.previewRevision)return {changed:false,feature:current};
 if(current.version!==body.expected_version)fail(409,'LAB_VERSION_CONFLICT','حُفظ قرار أحدث؛ حدّث المعمل قبل الكتابة.');
 const entry={version:current.version+1,review:body.review,note,previewEnabled:body.previewEnabled,previewRevision:feature.previewRevision,actor,at};
 const next={...entry,updatedAt:at,history:[...(saved?.history || []),entry].slice(-20)};
 return {changed:true,next,feature:labProjection(feature,next)};
}
// Clearly fictional specimens: no real member, phone, review, news or directory write.
export const labSpecimen=()=>({
 label:'بيانات توضيحية للمعاينة فقط',
 categories:['الأطباء','المستشفيات','التحاليل','الأشعة','الصيدليات','المراكز'],
 news:{title:'نموذج خبر للشبكة',summary:'مكان مخصص للخبر المهم، دون نشر إعلان حقيقي للأعضاء.'},
 provider:{name:'جهة طبية توضيحية',specialty:'الباطنة',city:'المنصورة',network:'الموظفون والأسر والمعاشات',status:'active',rating:null,
 branches:[{id:'demo_a',name:'المقر الأول',address:'عنوان توضيحي غير مخصص للزيارة',hours:'نموذج لعرض مواعيد الجهة'},
 {id:'demo_b',name:'المقر الثاني',address:'عنوان آخر توضيحي غير مخصص للزيارة',hours:'نموذج لمواعيد الفرع الثاني'}]},
});
export function developmentLabService({store,authorize,now,readDirectory}){return {
 async adminLab(token){await authorize(token,'admin');const rows=await store.labReadAll();return {capability:'development-lab-v1',audience:'admin',memberReleaseSupported:false,features:labFeatures.map(f=>labProjection(f,rows[f.id]))};},
 async labPreview(token,id,statusOnly=false){await authorize(token,'admin');const feature=labProjection(definition(id),await store.labRead(id));if(!feature.previewEnabled)fail(409,'LAB_PAUSED','هذه المعاينة موقوفة؛ يمكن استئنافها من المعمل.');
  if(statusOnly)return {feature};
  if(id==='review_insights')return {feature,scene:{mode:'review-insights-readonly',readOnly:true,memberDataIncluded:false}};
  if(id==='admin_inbox')return {feature,scene:{mode:'admin-inbox',productionWriteSupported:false,queueDetailsIncluded:false}};
  if(id==='catalog_staging')return {feature,scene:{mode:'catalog-staging',productionWriteSupported:false}};
  if(roadmapFeatures.some(f=>f.id===id))return {feature,scene:{mode:feature.dataMode,label:'معاينة مدير خاصة · بيانات دليل منشورة ومساحة حساب معزولة',policy:roadmapPolicy,...await readDirectory()}};
  if(id===visitId)return {feature,scene:{mode:'directory-sandbox',label:'دليل منشور للقراءة · بلاغات توضيحية معزولة',issues:visitIssues,states:visitStates,outcomes:visitOutcomes,...await readDirectory()}};
  if(id==='directory_experience')return {feature,scene:{mode:'directory-readonly',label:'معاينة خاصة · بيانات الدليل المنشورة · للقراءة فقط',...await readDirectory()}};
  return {feature,scene:labSpecimen()};},
 async saveLabFeature(token,id,body){const s=await authorize(token,'admin'),feature=definition(id);return store.labTransact(id,saved=>labDecision(feature,saved,body,s.sourceId,now()));},
};}
