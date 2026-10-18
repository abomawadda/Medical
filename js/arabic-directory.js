/* Conservative orthography for directory display only. Never an identity key.
   Personal surnames and geographic variants are deliberately not guessed. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.MedicalArabic=value;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const common={مستشفي:'مستشفى',مستشفيات:'مستشفيات',عياده:'عيادة',صيدليه:'صيدلية',الاشعة:'الأشعة',الاشعه:'الأشعة',الاسنان:'الأسنان',اسنان:'أسنان',الاطفال:'الأطفال',الانف:'الأنف',الاذن:'الأذن',اخصائي:'أخصائي',اخصائى:'أخصائي',استشارى:'استشاري',الاوسط:'الأوسط',التاهيلي:'التأهيلي',التاهيل:'التأهيل',احمد:'أحمد',ابراهيم:'إبراهيم',اسماعيل:'إسماعيل',ايمن:'أيمن',اشرف:'أشرف',اكرم:'أكرم',اسامه:'أسامة',اسامة:'أسامة',امنية:'أمنية',الطرشوبى:'الطرشوبي'};
  const address={امام:'أمام',اعلى:'أعلى',اسفل:'أسفل',ارض:'أرض',اول:'أول',الاول:'الأول',الثانى:'الثاني',المدنى:'المدني',الجامعه:'الجامعة',شركه:'شركة',الثوره:'الثورة',الصفوه:'الصفوة',الناصريه:'الناصرية',الانوار:'الأنوار',اولاد:'أولاد',حلوانى:'حلواني',مبني:'مبنى',اجا:'أجا',مدينه:'مدينة',الجمهوريه:'الجمهورية',المنصوره:'المنصورة'};
  const fields=new Set(['name','display_name','address','specialty','subspecialty','hospital','contract_entity','category']);
  function correct(value,field){if(typeof value!=='string')return value;const words=field==='address'?{...common,...address}:common;const result=value.replace(/[\u0621-\u064A]+/g,word=>words[word]||word);return field==='address'?result.replace(/ميدان على مبارك/g,'ميدان علي مبارك'):result;}
  function entity(value){if(Array.isArray(value))return value.map(entity);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,fields.has(key)?correct(v,key):v&&typeof v==='object'?entity(v):v]));}
  return Object.freeze({correct,entity});
});
