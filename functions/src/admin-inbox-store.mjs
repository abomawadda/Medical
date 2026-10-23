/* Count queries never load review comments or employee change request contents. */
export function adminInboxStore(db){return {
 async adminInboxCounts(){
  const queries=[['reviews','medical_reviews','pending'],['profilePending','medical_profile_requests','pending'],['profileApplying','medical_profile_requests','applying']];
  const result=await Promise.allSettled(queries.map(([,collection,status])=>db.collection(collection).where('status','==',status).count().get()));
  return Object.fromEntries(queries.map(([key],index)=>{
   const row=result[index],count=row.status==='fulfilled'?row.value.data().count:null;
   return [key,Number.isSafeInteger(count)&&count>=0?{available:true,count,scope:'status-documents'}:{available:false,count:null,scope:'status-documents'}];
  }));
 }
};}
