(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.MedicalReviewCriteria=value;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const items=Object.freeze([
    {id:'reception',label:'الاستقبال والتعامل',hint:'وضوح الإجراءات واحترام المستفيد'},
    {id:'waiting',label:'وقت الانتظار',hint:'رضاك عن مدة الانتظار وتنظيم الدور'},
    {id:'cleanliness',label:'النظافة وتهيئة المكان',hint:'نظافة المكان ومرافقه أثناء زيارتك'},
    {id:'service',label:'تنظيم الخدمة ووضوحها',hint:'توضيح الخطوات والإجابة عن استفساراتك'}
  ].map(Object.freeze));
  function parse(value){
    if(value===undefined)return undefined; // Legacy reviews remain valid.
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!items.some(i=>i.id===k)))throw new Error('INVALID_CRITERIA');
    const result={};for(const {id} of items){if(value[id]===undefined)continue;if(!Number.isInteger(value[id])||value[id]<1||value[id]>5)throw new Error('INVALID_CRITERIA');result[id]=value[id];}
    if(!Object.keys(result).length)throw new Error('INVALID_CRITERIA');
    return result;
  }
  return Object.freeze({items,parse});
});
