import {ApiError} from './core.mjs';
export function profileStore(db,audit){
 const requests=db.collection('medical_profile_requests'),ledgers=db.collection('medical_profile_ledgers'),overrides=db.collection('medical_profile_overrides'),notifications=db.collection('medical_profile_notifications');
 const clean=s=>s.exists?s.data():null;
 return {
  async getProfileOverrides(owner){return (await overrides.doc(owner).get()).data()?.values || {};},
  async profileRead(id){return clean(await requests.doc(id).get());},
  async profileTransact(owner,id,change,actor,at){return db.runTransaction(async tx=>{
   const [r,l,o]=await tx.getAll(requests.doc(id),ledgers.doc(owner),overrides.doc(owner));
   const result=change({request:clean(r),ledger:clean(l)||{},overrides:clean(o)?.values || {}});
   if(result.request)tx.set(requests.doc(id),result.request);
   if(result.ledger)tx.set(ledgers.doc(owner),result.ledger);
   if(result.overrides)tx.set(overrides.doc(owner),{values:result.overrides});
   if(result.notification)tx.set(notifications.doc(result.notification.id),result.notification);
   if(result.request || result.notification)tx.create(audit.doc(),{action:'profile.request',requestId:id,status:result.request?.status || '',actor,at});
   return result.result;
  });},
  async profileOwn(owner){const ledger=(await ledgers.doc(owner).get()).data() || {};const ids=ledger.requestIds || [];return ids.length?(await db.getAll(...ids.map(id=>requests.doc(id)))).filter(d=>d.exists).map(d=>d.data()):[];},
  async profileAdmin(){return (await requests.orderBy('updated_at','desc').limit(100).get()).docs.map(d=>d.data());},
  async profileNotifications(owner,since){const ledger=(await ledgers.doc(owner).get()).data() || {},version=ledger.notificationVersion || 0;if(since===version)return {notModified:true,version};const ids=ledger.notificationIds || [];return {version,notifications:ids.length?(await db.getAll(...ids.map(id=>notifications.doc(id)))).filter(d=>d.exists&&d.data().owner===owner).map(d=>d.data()):[]};},
  async profileMarkRead(owner,id,at){return db.runTransaction(async tx=>{const ref=notifications.doc(id),[row,ledger]=await tx.getAll(ref,ledgers.doc(owner));if(!row.exists||row.data().owner!==owner)throw new ApiError(404,'NOT_FOUND','الإشعار غير موجود.');if(!row.data().readAt){tx.update(ref,{readAt:at});tx.set(ledgers.doc(owner),{...ledger.data(),notificationVersion:(ledger.data()?.notificationVersion || 0)+1});}return {success:true};});}

 };
}
