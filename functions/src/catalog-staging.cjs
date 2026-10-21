/* Shared, deterministic import rules. This module never writes directory data. */
(function(root,factory){const value=factory(typeof module==='object'&&module.exports?require('./contacts.cjs'):root.MedicalContacts,typeof module==='object'&&module.exports?require('./arabic-directory.cjs'):root.MedicalArabic);if(typeof module==='object'&&module.exports)module.exports=value;else root.MedicalCatalogStaging=value;})(typeof globalThis!=='undefined'?globalThis:this,function(contacts,arabic){
 'use strict';
 const fields={id:'معرّف السجل',name:'الاسم',specialty:'التخصص',address:'العنوان',markaz:'المركز',raw_phone:'أرقام الاتصال',schedule:'المواعيد'},kinds={records:'الأطباء',hospitals:'المستشفيات',labs:'التحاليل',radiology:'الأشعة',pharmacies:'الصيدليات',specialized_centers:'المراكز المتخصصة'};
 const labels={new:'جديد للمراجعة',update:'تعديل مقترح',unchanged:'مطابق',possible_duplicate:'تكرار محتمل',ambiguous:'معرّف ملتبس',blocked:'يحتاج تصحيحًا'};
 const fold=v=>String(v??'').normalize('NFKC').replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();
 const nameKey=value=>fold(arabic.correct(String(value??''),'name'));
 const clean=v=>typeof v==='string'&&v.length<=500&&!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)&&!/(^|\D)[23]\d{13}(\D|$)/.test(String(v).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
 const sensitive=v=>/national|employee|password|token|secret|email|member|قومي|كود العامل|كود الموظف|عضوي|كلمة المرور|بريد/i.test(String(v));
 const aliases={id:['id','معرف','معرف السجل'],name:['name','الاسم','اسم الجهة','اسم الطبيب','اسم المستشفى'],specialty:['specialty','التخصص'],address:['address','العنوان'],markaz:['markaz','المركز','المدينة'],raw_phone:['raw_phone','الهاتف','التليفون','ارقام الاتصال','الموبايل','محمول','ارضي','مختصر'],schedule:['schedule','المواعيد','مواعيد العمل']};
 function suggest(header){const h=fold(header);return Object.keys(aliases).find(k=>aliases[k].some(v=>fold(v)===h))||'';}
 function parse(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>1024*1024)throw new Error('حد الملف النصي ميجابايت واحد.');
  text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/,1)[0],separator=first.includes('\t')?'\t':first.includes(';')&&!first.includes(',')?';':',';
  const rows=[];let row=[],cell='',quoted=false,ended=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted){quoted=false;ended=true;}else if(!cell&&!ended)quoted=true;else throw new Error('علامات اقتباس غير متوازنة في الملف.');}
   else if(!quoted&&(c===separator||c==='\n'||c==='\r')){row.push(cell);cell='';ended=false;if(row.length>40)throw new Error('حد الجدول 40 عمودًا.');if(c!==separator){if(c==='\r'&&text[i+1]==='\n')i++;rows.push(row);row=[];if(rows.length>1001)throw new Error('حد القراءة المحلية 1000 صف.');}}
   else{if(ended&&!/\s/.test(c))throw new Error('فاصل غير صحيح بعد علامة الاقتباس.');cell+=c;if(cell.length>2000)throw new Error('توجد خلية طويلة جدًا؛ استخدم بيانات الدليل فقط.');}}
  if(quoted)throw new Error('علامات اقتباس غير متوازنة في الملف.');if(cell||row.length){row.push(cell);if(row.length>40)throw new Error('حد الجدول 40 عمودًا.');rows.push(row);}if(rows.length>1001)throw new Error('حد القراءة المحلية 1000 صف.');return rows;
 }
 function mapped(table,header,mapping){
  if(!Number.isSafeInteger(header)||header<0||!table[header])throw new Error('اختر صف العناوين.');
  if(table[header].some(sensitive))throw new Error('هذا الجدول يتضمن عناوين بيانات أعضاء أو بيانات حساسة؛ استخدم ملف الجهات فقط.');
  if(!mapping.includes('name'))throw new Error('اربط عمود الاسم أولًا.');
  const unique=mapping.filter(v=>v&&v!=='raw_phone');if(new Set(unique).size!==unique.length)throw new Error('لا تربط عمودين بالحقل نفسه، باستثناء أرقام الاتصال.');
  return table.slice(header+1).map((cells,i)=>{const out={},issues=[];mapping.forEach((field,col)=>{if(!Object.hasOwn(fields,field))return;const value=String(cells[col]??'').trim();if(!value||/^(null|undefined|nan)$/i.test(value))return;if(!clean(value)||/^[=+@]/.test(value)&&!(field==='raw_phone'&&/^\+?[\p{N}][\p{N} ()/.,;،\-+]*$/u.test(value)))issues.push('خلية غير آمنة أو أطول من المسموح');else out[field]=out[field]?out[field]+' - '+value:value;});return {source_row:header+i+2,values:out,issues};}).filter(r=>Object.keys(r.values).length||r.issues.length);
 }
 function sourceRow(row){const out={};for(const key of Object.keys(fields)){const value=key==='name'?(row.name||row.display_name):key==='schedule'?(row.schedule||row.working_hours):key==='raw_phone'?(row.raw_phone||row.phone||''):row[key];out[key]=String(value??'').replace(/^(null|undefined|nan)$/i,'');}const groups=row.contact_groups;if(!out.raw_phone&&groups)out.raw_phone=['mobile','landline','shortcode'].flatMap(k=>groups[k]||[]).join(' - ');return out;}
 function analyze(kind,input,catalog){
  const values=input.values,issues=[],notes=[],proposed={};for(const [k,v]of Object.entries(values)){if(k==='id'||!v.trim())continue;proposed[k]=arabic.correct(v,k).trim();}
  const rows=catalog[kind]||[],id=values.id||'',matches=id?rows.filter(r=>String(r.id)===id):[],match=matches.length===1?matches[0]:null;
  if(!values.name)issues.push('اسم الجهة مطلوب');if(id&&!matches.length)issues.push('المعرّف غير موجود في هذا القسم؛ لا ننشئ معرّفات من ملف خارجي');if(matches.length>1)issues.push('المعرّف مكرر في الدليل');
  const before=match?sourceRow(match):null,after={...(before||{}),...proposed};if(!match){for(const key of ['address','markaz'])if(!after[key])issues.push(fields[key]+' مطلوب للسجل الجديد');}
  const phone=contacts.parse(after.raw_phone||'');if(after.raw_phone&&!['mobile','landline','shortcode'].some(k=>phone[k].length)&&!phone.invalid.length)issues.push('لا يوجد رقم قابل للفحص في خانة الاتصال');if(phone.invalid.length)issues.push('أرقام غير صالحة الصيغة؛ راجعها دون تخمين');
  if(Object.keys(values).some(k=>k!=='raw_phone'&&/^[=+@\-]/.test(values[k])))issues.push('صيغة أو قيمة غير مسموح بها');
  const allCandidates=rows.filter(r=>r!==match&&nameKey(r.name||r.display_name)===nameKey(after.name)).map(r=>({id:String(r.id),name:String(r.name||r.display_name||''),address:String(r.address||''),sameAddress:!!fold(after.address)&&fold(r.address)===fold(after.address),version:r._version||0}));
  allCandidates.sort((a,b)=>Number(b.sameAddress)-Number(a.sameAddress)||a.id.localeCompare(b.id,'en'));const candidates=allCandidates.slice(0,8);if(allCandidates.some(r=>!r.sameAddress))notes.push('اسم مشابه في عنوان آخر؛ قد يكون فرعًا مستقلًا، لا يُدمج تلقائيًا');
  if(match&&(match.directory_visibility==='hidden'))notes.push('حالة الإخفاء محفوظة دون تغيير');if(match?.service_status==='suspended')notes.push('الإيقاف المؤقت محفوظ دون تغيير');
  const changes=Object.keys(proposed).filter(k=>proposed[k]!==before?.[k]).map(key=>({key,before:before?.[key]||'',after:proposed[key]}));
  const status=matches.length>1?'ambiguous':issues.length?'blocked':allCandidates.some(r=>r.sameAddress)?'possible_duplicate':match?changes.length?'update':'unchanged':'new';
  return {source_row:input.source_row,input:values,status,issues,notes,candidates,candidateCount:allCandidates.length,before,after,changes,contacts:phone,sourceVersion:match?{version:match._version||0,hidden:match.directory_visibility||'visible',status:match.service_status||'',contract:match.contract_listing??null}:null,decision:'pending'};
 }
 function planCSV(plan){
  if(plan?.audience!=='admin'||plan.memberEnabled!==false||plan.productionWriteSupported!==false||plan.scope!=='private-proposals-only'||!Array.isArray(plan.items))throw new Error('تقرير المقترحات غير متوافق.');
  const cell=(value,asText=false)=>{let text=String(value??'');if(text&&(asText||/^[\s]*[=+@-]/.test(text)))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
  const headers=['صف المصدر','نوع المقترح','معرف السجل','الاسم','التخصص','العنوان','المركز','محمول','أرضي','مختصر','المواعيد'];
  return '\ufeff'+[headers.map(value=>cell(value)).join(','),...plan.items.map(item=>[cell(item.source_row),cell(item.operation==='propose_add'?'إضافة مقترحة فقط':'تعديل مقترح فقط'),cell(item.existingId,true),...['name','specialty','address','markaz'].map(key=>cell(item.after[key])),...['mobile','landline','shortcode'].map(key=>cell((item.contacts[key]||[]).join(' - '),true)),cell(item.after.schedule)].join(','))].join('\r\n')+'\r\n';
 }
 return Object.freeze({fields,kinds,labels,fold,nameKey,clean,sensitive,suggest,parse,mapped,sourceRow,analyze,planCSV,limits:{rows:30,batches:5}});
});
