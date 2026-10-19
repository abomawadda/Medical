(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.MedicalMemberProfile=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const fields=[
 ['name','الاسم','personal',200],['jobId','كود الموظف','work',40],['membershipId','رقم العضوية النقابية','union',80],['membershipStatus','طبيعة العضوية','union',160],['memberState','حالة العضوية','union',80],['phone','الموبايل الأساسي','contact',30],['phone2','موبايل إضافي','contact',30],['email','البريد الإلكتروني','contact',254],['workplace','مكان العمل','work',240],['jobTitle','الوظيفة','work',160],['jobGrade','الدرجة الوظيفية','work',120],['qualification','المؤهل','work',160],['hireDate','تاريخ التعيين','work',30],['unionBranch','الفرع النقابي','union',160],['unionJoinDate','تاريخ الانتساب','union',30],['subscriptionStatus','حالة الاشتراك المسجلة','union',100],['address','العنوان','contact',500],['gender','النوع المسجل','personal',40],['maritalStatus','الحالة الاجتماعية','personal',80],['birthDate','تاريخ الميلاد','personal',30],['retirementDate','تاريخ المعاش المسجل','work',30],['membershipExpiry','تاريخ انتهاء العضوية المسجل','union',30],['deathDate','تاريخ الوفاة المسجل','union',30]
 ].map(([key,label,group,max])=>Object.freeze({key,label,group,max}));
 const groups={personal:'البيانات الأساسية',union:'العضوية النقابية',work:'البيانات المهنية',contact:'التواصل والعنوان'};
 const normalize=value=>String(value || '').normalize('NFKC').replace(/[\u064B-\u065Fـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').trim().toLowerCase();
 const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
 function date(value){
  if(value instanceof Date)return Number.isFinite(value.getTime())?day(value.getTime()):'';
  if(value && typeof value.toMillis==='function')return day(value.toMillis());
  if(value && Number.isFinite(value.seconds))return day(value.seconds*1000);
  if(typeof value!=='string')return '';
  const text=value.trim();let iso=text;
  const parts=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(parts)iso=parts[3]+'-'+parts[2].padStart(2,'0')+'-'+parts[1].padStart(2,'0');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,10)!==iso)return '';
  return iso;
 }
 function deceased(e,at=Date.now()){
  if(!e)return false;
  if(['وفاه','الوفاه','متوفاه','متوفي','متوفيه','متوف','deceased','dead','death'].includes(normalize(e.memberState)))return true;
  return [e.deathDate,e.dateOfDeath,e.deceasedAt].some(v=>{const value=date(v);return value && value<=day(at);});
 }
 function project(e){const values=Object.fromEntries(fields.map(f=>[f.key,typeof e?.[f.key]==='string'||typeof e?.[f.key]==='number'?String(e[f.key]).trim().slice(0,f.max):'']));
  for(const [key,aliases] of [['birthDate',['dateOfBirth']],['retirementDate',['retireDate','retiredAt']],['deathDate',['dateOfDeath','deceasedAt']]])if(!values[key])values[key]=aliases.map(k=>typeof e?.[k]==='string'?e[k].trim():'').find(Boolean) || '';
  return values;
 }
 function workState(e,at=Date.now()){
  if(deceased(e,at))return 'متوفى';
  const value=normalize(e.memberState);
  if(['استقاله','مستقيل','resigned','resignation'].includes(value))return 'استقالة';
  const retirement=date(e.retirementDate || e.retireDate || e.retiredAt);
  if(['معاش','متقاعد','تقاعد','retired'].includes(value)||(retirement && retirement<=day(at)))return 'معاش';
  return String(e.memberState || '').trim() || 'غير مسجل';
 }
 return Object.freeze({fields,groups,deceased,project,workState,date});
});
