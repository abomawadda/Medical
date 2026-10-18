"""Import only the owner's refined provider sheet; never membership data or workbook instructions."""
import argparse, copy, hashlib, json, re, sys
from collections import Counter
from pathlib import Path
import openpyxl
from import_staff import clean, sheet
from staff_catalog import normalize_contacts, ROOT

BATCH='family-20261018'
OUTPUT=ROOT/'imports'/f'{BATCH}.json'
KINDS={'مستشفى':'hospitals','مراكز متخصصة':'specialized_centers','صيدليات':'pharmacies','معامل تحاليل':'labs','مراكز أشعة':'radiology','عيادات':'records','أسنان':'records','علاج طبيعي':'specialized_centers','بصريات':'specialized_centers'}
FACILITY_ALIASES={2:('hospitals','hosp_kheir'),3:('hospitals','hosp_sellab'),5:('hospitals','staff_2433'),6:('hospitals','staff_753'),7:('hospitals','staff_765'),9:('hospitals','staff_774'),12:('pharmacies','staff_771')}
NO_MERGE={11,16,29} # Different building/bank landmarks: keep family branch independent.
DOCTOR_ALIASES={38:'provider_10',45:'provider_133'} # name+specialty+city; 45 additionally shares 0502337645.
STOP=set('شارع ش امام أمام بجوار خلف اعلى أعلى برج الدور من في مدينة المنصورة مركز صيدلية صيدليات معامل معمل مستشفى مستشفي للتحاليل الطبية'.split())

def norm(t):
    t=clean(t).replace('أ','ا').replace('إ','ا').replace('آ','ا').replace('ة','ه').replace('ى','ي')
    return re.sub(r'[^\w\s]',' ',t).strip()

def doctor_name(t):
    t=re.sub(r'^د\s*[./]\s*','',clean(t))
    return t.replace('عبدالكريم','عبد الكريم').replace('عبدالرحمن','عبد الرحمن')

def brand(t):
    t=norm(t)
    for v in ['العزبي','البرج','المختبر','تكنوسكان','القمه','امبليفون','الاكاديميه','نيولايف','جلوري','جلورى','جولي']:
        if v in t:return v
    return t

def compatible(a,b):
    if brand(a['name']) != brand(b['name']) or norm(a.get('markaz') or a.get('city')) != norm(b['markaz']):return False
    if norm(a.get('address')) == norm(b['address']):return True
    phones=lambda e:set(e.get('contact_groups',{}).get('mobile',[])+e.get('contact_groups',{}).get('landline',[]))
    if phones(a)&phones(b):return True
    words=lambda x:{w for w in norm(x).split() if w not in {norm(s)for s in STOP} and len(w)>2}
    return len(words(a.get('address',''))&words(b['address']))>=2

def run():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--output-dir',required=True);args=ap.parse_args()
    path=Path(args.source);workbook=openpyxl.load_workbook(path,data_only=True)
    source=workbook['الدليل المنقح']
    if list(next(source.values)) != ['المحافظة','المدينة','نوع مقدم الخدمة','اسم مقدم الخدمة','التخصص','العنوان','هاتف أرضي','هاتف محمول','رقم مختصر','الحالة','رقم الهاتف الأصلي','ملاحظات المراجعة']:raise ValueError('Unexpected refined-sheet headers')
    base=json.loads((ROOT/'data.json').read_text());existing={k:[r for r in (list(v.values()) if isinstance(v,dict) else v) if r.get('source_ref')!=BATCH] for k,v in base.items() if k in set(KINDS.values())}
    rows=list(source.values)[1:];parsed=normalize_contacts([' - '.join(str(v or '')for v in r[6:9])for r in rows])
    entries=[];normalized=[];issues=[];corrections=[];contacts=[];matches=[];seen={};status_counts=Counter();invalid=0
    for rownum,(row,phone) in enumerate(zip(rows,parsed),2):
        province,city,typ,name,specialty,address,landline,mobile,short,state,raw_phone,old_notes=row
        original_name=str(name or '');name=clean(name);city=clean(city);address=clean(address);specialty=clean(specialty)
        if province != 'الدقهلية' or typ not in KINDS:raise ValueError(f'Unsupported row {rownum}')
        kind=KINDS[typ];entity_id=f'family_20261018_{rownum:03d}'
        notes=[]
        for field,old,new in [('الاسم',original_name,name),('العنوان',str(row[5]or''),address),('المدينة',str(row[1]or''),city)]:
            if old!=new:corrections.append([rownum,field,old,new])
        if phone['invalid']:
            invalid+=len(phone['invalid']);notes+=['رقم غير صالح الصيغة عُزل: '+i['raw']for i in phone['invalid']]
        values={k:phone[k]for k in ['mobile','landline','shortcode']};valid=' - '.join(n for v in values.values()for n in v)
        entity=dict(id=entity_id,name=name,category=typ,address=address,markaz=city,city=city,country_code='EG',governorate='الدقهلية',governorate_code='EG-DK',phone=valid,contact_groups=values,network_members=['family','retiree'],contract_type='family_network',contract_entity='شبكة الأسر والمعاشات',contract_entity_id='family_network',coverage_scope='unknown',coverage_verified=False,source_ref=BATCH,source_row=rownum,network_source='ملف الأسر — الدليل المنقح — 18 أكتوبر 2026',contact_review_required=bool(phone['invalid']),maps_url='https://www.google.com/maps/search/?api=1&query='+__import__('urllib.parse',fromlist=['quote']).quote(name+' '+address+' '+city+' الدقهلية مصر'))
        relationship=dict(id=f'contract_family_20261018_{rownum:03d}',route='family_network',network_members=['family','retiree'],source_ref=BATCH,source_row=rownum,address=address,contact_groups=values,financial_terms_status='unknown')
        entity['contract_relationships']=[relationship]
        target=None
        if kind=='records':
            canonical=doctor_name(name)
            identity=DOCTOR_ALIASES.get(rownum)
            if identity:
                prior=next(r for r in existing['records']if r['provider_id']==identity)
                if rownum==45 and '0502337645' not in values['landline']:raise ValueError('Changed evidence for clinician alias')
                specialty=prior['specialty'];canonical=prior['name'];matches.append([rownum,'طبيب مشترك — مقر تعاقد مستقل',identity,original_name])
            else:identity='provider_family_'+hashlib.sha256((norm(canonical)+'|'+norm(specialty)).encode()).hexdigest()[:12]
            entity.update(name=canonical,display_name='د/ '+canonical,raw_name=name,provider_id=identity,specialty=specialty,subspecialty=clean(row[4]),hospital='شبكة الأسر والمعاشات',clinic_type='عيادة خارجية — شبكة الأسر والمعاشات',is_department=False,category='doctors',raw_phone=valid,phones=[dict(display=n,digits=n,tel=n,is_mobile=(k=='mobile'))for k in values for n in values[k]])
            if '(' in original_name:notes.append('الاسم يتضمن اسمًا بديلًا بين قوسين؛ حفظ كما ورد ولم يفترض تبديل هوية الطبيب.')
        elif rownum in FACILITY_ALIASES:
            target_kind,target_id=FACILITY_ALIASES[rownum];prior=next(r for r in existing[target_kind]if str(r['id'])==target_id)
            target={'kind':target_kind,'id':target_id};matches.append([rownum,'جهة مشتركة موثقة بالاسم والمقر',target_id,name])
        else:
            candidates=[] if rownum in NO_MERGE else [(k,r)for k in [kind] for r in existing[k] if compatible(r,entity)]
            if len(candidates)==1:
                k,prior=candidates[0];target={'kind':k,'id':str(prior['id'])};matches.append([rownum,'مطابقة الاسم والمدينة والعنوان/رقم غير مختصر',str(prior['id']),name])
            elif len(candidates)>1:notes.append('أكثر من مرشح للجهة؛ حفظ مقر الأسر مستقلًا دون دمج تخميني.')
        if rownum in NO_MERGE:notes.append('تشابه مع جهة الموظفين مع اختلاف معالم العنوان؛ حفظ مقر الأسر مستقلًا لحين المراجعة.')
        key=(kind,norm(entity['name']),city,norm(address))
        if key in seen:notes.append('تكرار كامل في الملف؛ لم ينشأ سجل ثانٍ.');target=seen[key]
        else:seen[key]=target or {'kind':kind,'id':entity_id}
        if target:entity['id']=target['id']
        entity['data_notes']='؛ '.join(notes)
        entries.append(dict(kind=target['kind'] if target else kind,entity=entity,merge_target=target))
        for k in values:
            for number in values[k]:contacts.append([rownum,name,{'mobile':'محمول','landline':'أرضي','shortcode':'مختصر'}[k],number])
        for note in notes:issues.append([rownum,name,note])
        status_counts[str(state)]+=1
        normalized.append([rownum,name,original_name,typ,specialty,city,address,'\n'.join(values['mobile']),'\n'.join(values['landline']),'\n'.join(values['shortcode']),target['id'] if target else entity_id,entity.get('provider_id',''),'رسم طبيب (ترجيح الاسم)' if kind=='records' else 'رسم صيدلية' if typ=='صيدليات' else 'رسم جهة',str(state or ''),'؛ '.join(notes)])
    summary=dict(sheet='الدليل المنقح',source_rows=len(rows),family_rows=len(entries),shared_facility_rows=sum(bool(e['merge_target'])for e in entries),doctor_location_rows=sum(e['kind']=='records'for e in entries),doctor_cards=len({e['entity']['provider_id']for e in entries if e['kind']=='records'}),invalid_phone_values=invalid,corrections=len(corrections),source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),date='2026-10-18',source_status_values=dict(status_counts))
    OUTPUT.write_text(json.dumps(dict(schema_version=1,summary=summary,entries=entries),ensure_ascii=False,indent=2))
    out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True);book=openpyxl.Workbook();book.remove(book.active)
    sheet(book,'ملخص',['البند','القيمة'],[[k,json.dumps(v,ensure_ascii=False)if isinstance(v,dict)else v]for k,v in summary.items()]+[['الحالة','Online/Offline لا تعني توقف الخدمة أو أهلية العضو؛ لم تنشر كحالة إيقاف.']])
    sheet(book,'شبكة الأسر والمعاشات',['صف المصدر','الاسم المنظم','اسم المصدر','النوع','التخصص','المركز','العنوان','محمول','أرضي','مختصر','معرف الجهة','معرف الطبيب','الرسم المقترح','ربط إلكتروني فقط - ليس إيقاف خدمة','ملاحظات الإدارة'],normalized)
    sheet(book,'الاتصالات',['صف المصدر','الجهة','الفئة','الرقم'],contacts);sheet(book,'المطابقات',['صف المصدر','أساس الربط','المعرف السابق','الاسم'],matches);sheet(book,'للمراجعة',['صف المصدر','الجهة','الملاحظة'],issues);sheet(book,'التصحيحات',['صف المصدر','الحقل','قبل','بعد'],corrections)
    book.save(out/'family-network-organized.xlsx');print(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=='__main__':run()
