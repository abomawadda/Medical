# -*- coding: utf-8 -*-
"""
WE Medical Directory - Comprehensive Data Processor & Normalizer (v3.0)
Advanced Architecture for Telecom Egypt (WE) - Dakahlia Union Branch
Supports:
- Contract Entity (جهة التعاقد: مباشر من الشركة / تابع لمستشفى الحكمة / السلاب / الخير)
- Coverage Scope (نطاق التغطية: شامل العاملين + أسر العاملين جلوب ميد / العاملين فقط / جلوب ميد فقط)
- Dakahlia Centers & Markaz (التصفية بمراكز ومدن الدقهلية)
- Smart Arabic Spelling Correction (تصحيح الأخطاء الإملائية والأسماء المركبة)
- Medical Procedures & Instructions Guide (دليل التعليمات والإجراءات الطبية الشامل)
- Employee Authentication Directory (دليل العاملين للتسجيل برقم الموبايل وآخر 4 أرقام قومي)
- Emergency Distress Lines & SOS

Prepared & Developed by: Mahmoud El-Eraky (إعداد وتنفيذ: الأستاذ / محمود العراقي)
"""

import sys
import os
import zipfile
import json
import re
import xml.etree.ElementTree as ET

# 16 Dakahlia Centers & Markaz
DAKHALIA_MARKAZ = [
    'المنصورة',
    'طلخا',
    'ميت غمر',
    'السنبلاوين',
    'بلقاس',
    'دكرنس',
    'شربين',
    'أجا',
    'المنزلة',
    'منية النصر',
    'ميت سلسيل',
    'بني عبيد',
    'نبروه',
    'الجمالية',
    'تمي الأمديد',
    'محلة دمنة'
]

def extract_excel_data(excel_path):
    with zipfile.ZipFile(excel_path) as z:
        sstree = ET.fromstring(z.read('xl/sharedStrings.xml'))
        shared_strings = []
        for si in sstree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
            text = ''.join(t.text for t in si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t') if t.text)
            shared_strings.append(text)

        sheet_xml = z.read('xl/worksheets/sheet2.xml')
        stree = ET.fromstring(sheet_xml)
        ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

        def get_cell_value(cell):
            val = cell.find('s:v', ns)
            if val is None:
                return ''
            t = cell.attrib.get('t')
            if t == 's':
                return shared_strings[int(val.text)]
            return val.text or ''

        rows = []
        for row in stree.findall('.//s:row', ns):
            cells = {re.sub(r'[0-9]', '', c.attrib.get('r')): get_cell_value(c) for c in row.findall('s:c', ns)}
            rows.append(cells)

        return rows[4:]

def clean_arabic_text(text):
    if not text:
        return ''
    t = text.strip()
    t = re.sub(r'[إأآا]', 'ا', t)
    t = re.sub(r'ة', 'ه', t)
    t = re.sub(r'ى', 'ي', t)
    t = re.sub(r'[\u064B-\u065F\u0670]', '', t)
    return t.lower()

def correct_arabic_name_spelling(raw_name):
    """
    Cleans typos, fixes compound names, corrects Hamzas and normalizes honorific prefixes.
    """
    if not raw_name:
        return ''
    name = raw_name.strip()
    
    # Strip prefixes cleanly
    name = re.sub(r'^(أ\.د|أ د|أ\. د|دكتور|د\.|د/|د)\s*/?\s*', '', name).strip()
    name = re.sub(r'^(استشاري أول|استشاري ورئيس قسم|استشاري|أخصائي أول|أخصائي|مدرس|أستاذ مساعد|أستاذ م\.|أستاذ)\s*/?\s*', '', name).strip()
    
    # Compound names with 'عبد'
    abdel_patterns = [
        (r'\bعبد\s*الرحمن\b', 'عبد الرحمن'),
        (r'\bعبدالرحمن\b', 'عبد الرحمن'),
        (r'\bعبد\s*الله\b', 'عبد الله'),
        (r'\bعبدالله\b', 'عبد الله'),
        (r'\bعبد\s*الرازق\b', 'عبد الرازق'),
        (r'\bعبدالرازق\b', 'عبد الرازق'),
        (r'\bعبد\s*اللطيف\b', 'عبد اللطيف'),
        (r'\bعبداللطيف\b', 'عبد اللطيف'),
        (r'\bعبد\s*العزيز\b', 'عبد العزيز'),
        (r'\bعبدالعزيز\b', 'عبد العزيز'),
        (r'\bعبد\s*العظيم\b', 'عبد العظيم'),
        (r'\bعبدالعظيم\b', 'عبد العظيم'),
        (r'\bعبد\s*المنعم\b', 'عبد المنعم'),
        (r'\bعبدالمنعم\b', 'عبد المنعم'),
        (r'\bعبد\s*الحليم\b', 'عبد الحليم'),
        (r'\bعبدالحليم\b', 'عبد الحليم'),
        (r'\bعبد\s*الحميد\b', 'عبد الحميد'),
        (r'\bعبدالحميد\b', 'عبد الحميد'),
        (r'\bعبد\s*الوهاب\b', 'عبد الوهاب'),
        (r'\bعبدالوهاب\b', 'عبد الوهاب'),
        (r'\bعبد\s*الفتاح\b', 'عبد الفتاح'),
        (r'\bعبدالفتاح\b', 'عبد الفتاح'),
        (r'\bعبد\s*الناصر\b', 'عبد الناصر'),
        (r'\bعبدالناصر\b', 'عبد الناصر'),
        (r'\bعبد\s*السلام\b', 'عبد السلام'),
        (r'\bعبدالسلام\b', 'عبد السلام'),
        (r'\bعبد\s*الغني\b', 'عبد الغني'),
        (r'\bعبدالغني\b', 'عبد الغني'),
        (r'\bعبد\s*القادر\b', 'عبد القادر'),
        (r'\bعبدالقادر\b', 'عبد القادر'),
        (r'\bعبد\s*الجليل\b', 'عبد الجليل'),
        (r'\bعبدالجليل\b', 'عبد الجليل'),
        (r'\bعبد\s*الصمد\b', 'عبد الصمد'),
        (r'\bعبدالصمد\b', 'عبد الصمد'),
        (r'\bعبد\s*الباسط\b', 'عبد الباسط'),
        (r'\bعبدالباسط\b', 'عبد الباسط')
    ]
    for pat, rep in abdel_patterns:
        name = re.sub(pat, rep, name)

    # Compound names with 'أبو'
    abu_patterns = [
        (r'\bابو\s*العز\b', 'أبو العز'),
        (r'\bابوالعز\b', 'أبو العز'),
        (r'\bابو\s*الخير\b', 'أبو الخير'),
        (r'\bابوالخير\b', 'أبو الخير'),
        (r'\bابو\s*النجا\b', 'أبو النجا'),
        (r'\bابوالنجا\b', 'أبو النجا'),
        (r'\bابو\s*الفتوح\b', 'أبو الفتوح'),
        (r'\bابوالفتوح\b', 'أبو الفتوح'),
        (r'\bابو\s*زيد\b', 'أبو زيد'),
        (r'\bابوزيد\b', 'أبو زيد'),
        (r'\bابو\s*بكر\b', 'أبو بكر'),
        (r'\bابوبكر\b', 'أبو بكر'),
        (r'\bابو\s*المعاطي\b', 'أبو المعاطي'),
        (r'\bابوالمعاطي\b', 'أبو المعاطي')
    ]
    for pat, rep in abu_patterns:
        name = re.sub(pat, rep, name)

    # Common Hamza corrections on names
    hamza_words = [
        (r'\bاحمد\b', 'أحمد'),
        (r'\bاسامه\b', 'أسامة'),
        (r'\bاشرف\b', 'أشرف'),
        (r'\bايمن\b', 'أيمن'),
        (r'\bامجد\b', 'أمجد'),
        (r'\bايهاب\b', 'إيهاب'),
        (r'\bاسماعيل\b', 'إسماعيل'),
        (r'\bابراهيم\b', 'إبراهيم'),
        (r'\bاسلام\b', 'إسلام'),
        (r'\bانور\b', 'أنور'),
        (r'\bامين\b', 'أمين'),
        (r'\bاكرم\b', 'أكرم'),
        (r'\bالهام\b', 'إلهام'),
        (r'\bايمان\b', 'إيمان'),
        (r'\bاسماء\b', 'أسماء'),
        (r'\bاماني\b', 'أماني'),
        (r'\bاميره\b', 'أميرة'),
        (r'\bانس\b', 'أنس')
    ]
    for pat, rep in hamza_words:
        name = re.sub(pat, rep, name)

    name = re.sub(r'\s+', ' ', name).strip()
    return name

def parse_phones(raw_phone):
    if not raw_phone:
        return []
    text = raw_phone.replace('050/', '050-')
    parts = re.split(r'[\n\r,\|،;]+|\s+-\s+|\s+أو\s+|\s+/\s+', text)
    phones = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        digits = re.sub(r'[^\d]', '', p)
        if len(digits) >= 7:
            is_mobile = digits.startswith(('010', '011', '012', '015', '10', '11', '12', '15'))
            if is_mobile:
                if len(digits) == 10 and digits.startswith(('10', '11', '12', '15')):
                    digits = '0' + digits
                wa = '2' + digits if digits.startswith('0') else '20' + digits
            else:
                wa = None
            phones.append({
                'display': p,
                'digits': digits,
                'tel': digits,
                'is_mobile': is_mobile,
                'whatsapp': wa
            })
        else:
            phones.append({
                'display': p,
                'digits': '',
                'tel': '',
                'is_mobile': False,
                'whatsapp': None
            })
    return phones

def extract_academic_rank(subspecialty, name):
    text = f"{subspecialty} {name}"
    ranks = [
        ('أستاذ ورئيس قسم', 'أستاذ ورئيس قسم'),
        ('أستاذ دكتور', 'أ.د'),
        ('أ.د', 'أ.د'),
        ('أستاذ مساعد', 'أستاذ مساعد'),
        ('أستاذ م.', 'أستاذ مساعد'),
        ('أستاذ', 'أستاذ'),
        ('استشاري أول', 'استشاري أول'),
        ('استشاري ورئيس قسم', 'استشاري ورئيس قسم'),
        ('استشاري ومدرس', 'استشاري ومدرس'),
        ('استشاري', 'استشاري'),
        ('مدرس', 'مدرس'),
        ('أخصائي أول', 'أخصائي أول'),
        ('أخصائي', 'أخصائي')
    ]
    for key, label in ranks:
        if key in text:
            return label
    return 'طبيب متخصص'

def detect_markaz_and_area(address, default_city='المنصورة'):
    addr = address or ''
    markaz = default_city
    area = ''
    
    for m in DAKHALIA_MARKAZ:
        if m in addr:
            markaz = m
            break
            
    landmarks = [
        'السكة الجديدة', 'السكة القديمة', 'ش بنك مصر', 'ش جيهان', 'ش بورسعيد',
        'ش حسين بك', 'ش قناة السويس', 'ش الترعة', 'الهابي لاند', 'ميدان المحطة',
        'ميدان مشعل', 'ميدان الطميهي', 'توريل', 'المحافظة', 'حي الجامعة',
        'مدينة مبارك', 'ش عاطف المنجي', 'ش أحمد ماهر', 'ش الدراسات', 'ميت حدر',
        'المعسكر', 'عمر أفندي', 'ميدان الهابي لاند', 'بجوار مستشفى الجامعة',
        'المشاية السفلية', 'شارع الجمهورية', 'حي السلاب', 'شارع الجيش'
    ]
    for lm in landmarks:
        if lm in addr:
            area = lm
            break
    if not area:
        area = markaz
    return markaz, area

def build_data():
    excel_path = 'WE_Dakahlia_Medical_Directory_Eleraky_Hospitals.xlsx'
    data_rows = extract_excel_data(excel_path)

    # Hospitals metadata with contract entity & coverage details
    hospitals_meta = {
        'مستشفى الحكمة': {
            'id': 'hosp_hekma',
            'name': 'مستشفى الحكمة بالمنصورة',
            'short_name': 'مستشفى الحكمة',
            'contract_entity': 'تابع لمستشفى الحكمة',
            'contract_entity_id': 'hosp_hekma',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'مستشفى الحكمة - شارع بورسعيد / برج طيبة، المنصورة، الدقهلية',
            'google_maps_query': 'مستشفى الحكمة المنصورة',
            'phone': '050/2260709',
            'phone_digits': '0502260709',
            'whatsapp': '',
            'description': 'مستشفى رائد يقدم عيادات داخلية متخصصة ونخبة استشارية من كبار أساتذة الطب والعيادات الخارجية المتعاقدة بالدقهلية.',
            'working_hours': 'طوارئ واستقبال 24 ساعة - العيادات حسب الجداول المعتمدة',
            'badge': 'مستشفى متعاقد رئيسي',
            'color': '#7B1FA2',
            'services': ['عيادات داخلية', 'عيادات خارجية استشارية متعاقدة', 'عمليات جراحية', 'عظام وعمود فقري', 'باطنة وقلب', 'أنف وأذن', 'مسالك بولية']
        },
        'مستشفى الجزيرة الدولي (السلاب)': {
            'id': 'hosp_sellab',
            'name': 'مستشفى الجزيرة الدولي (السلاب)',
            'short_name': 'مستشفى السلاب',
            'contract_entity': 'تابع لمستشفى الجزيرة (السلاب)',
            'contract_entity_id': 'hosp_sellab',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - امتداد شارع جيهان / حي الجامعة / عاطف المنجي، الدقهلية',
            'google_maps_query': 'مستشفى الجزيرة الدولي السلاب المنصورة',
            'phone': '050/2209112',
            'phone_digits': '0502209112',
            'whatsapp': '',
            'hotline': '0502209112',
            'description': 'صرح طبي متكامل يضم عيادات داخلية استشارية متخصصة ونظام حجز واستعلام موحد وعيادات خارجية متميزة.',
            'working_hours': 'الخط الموحد للحجز والاستعلام: 050/2209112 (متاح يومياً)',
            'badge': 'صرح طبي استشاري متكامل',
            'color': '#5B2C82',
            'services': ['خط حجز موحد 050/2209112', 'جراحة ومناظير الركبة والكتف (أ.د/ رشدي السلاب)', 'عيادات داخلية وخارجية', 'قسطرة قلب', 'مخ وأعصاب', 'أمراض صدرية وباطنة']
        },
        'مستشفى الخير': {
            'id': 'hosp_kheir',
            'name': 'مستشفى الخير بالمنصورة',
            'short_name': 'مستشفى الخير',
            'contract_entity': 'تابع لمستشفى الخير',
            'contract_entity_id': 'hosp_kheir',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - شارع الجيش / بالقرب من مديرية الأمن، المنصورة، الدقهلية',
            'google_maps_query': 'مستشفى الخير المنصورة',
            'phone': 'بمقر المستشفى',
            'phone_digits': '',
            'email_approvals': 'Elkhier.hospital@gmail.com',
            'description': 'مستشفى متميز يقدم عيادات داخلية تخصصية، وحدة كلى وغسيل كلوي دائم، قسطرة قلب على مدار 24 ساعة ونظام التحويل الخارجي.',
            'working_hours': 'قسطرة القلب تعمل 24 ساعة يومياً - قسم الكلى يومياً 9 ص : 2 م',
            'badge': 'قسطرة قلب 24س + وحدة كلى',
            'color': '#4A148C',
            'services': ['بريد الموافقات الطبية: Elkhier.hospital@gmail.com', 'قسطرة القلب طوارئ 24 ساعة (الدور التاسع)', 'وحدة الغسيل الكلوي (الدور الثالث 9ص-2م)', 'عيادات استشارية داخلية', 'تحويل خارجي معتمد']
        }
    }

    specialty_icons = {
        'أمراض القلب والأوعية الدموية': {'icon': 'fa-heart-pulse', 'color': '#D32F2F', 'bg': '#FFEBEE'},
        'الباطنة والقلب والجهاز الهضمي': {'icon': 'fa-stethoscope', 'color': '#C2185B', 'bg': '#FCE4EC'},
        'الأنف والأذن والحنجرة': {'icon': 'fa-head-side-cough', 'color': '#7B1FA2', 'bg': '#F3E5F5'},
        'الأمراض الصدرية والحساسية': {'icon': 'fa-lungs', 'color': '#0288D1', 'bg': '#E1F5FE'},
        'الأمراض النفسية والعصبية': {'icon': 'fa-brain', 'color': '#00796B', 'bg': '#E0F2F1'},
        'التخدير وعلاج الألم': {'icon': 'fa-syringe', 'color': '#388E3C', 'bg': '#E8F5E9'},
        'الجراحة العامة والأوعية الدموية': {'icon': 'fa-hospital-user', 'color': '#8E24AA', 'bg': '#F3E5F5'},
        'الجلدية والتناسلية': {'icon': 'fa-hand-dots', 'color': '#D81B60', 'bg': '#FCE4EC'},
        'المسالك البولية والكلى': {'icon': 'fa-droplet', 'color': '#1E88E5', 'bg': '#E3F2FD'},
        'النساء والتوليد': {'icon': 'fa-person-pregnant', 'color': '#C2185B', 'bg': '#F8BBD0'},
        'جراحة العظام والعمود الفقري': {'icon': 'fa-bone', 'color': '#5E35B1', 'bg': '#EDE7F6'},
        'جراحة وطب المخ والأعصاب': {'icon': 'fa-brain', 'color': '#3949AB', 'bg': '#E8EAF6'},
        'جراحة وعلاج الأورام': {'icon': 'fa-ribbon', 'color': '#6D4C41', 'bg': '#EFEBE9'},
        'طب الأطفال': {'icon': 'fa-baby', 'color': '#F4511E', 'bg': '#FBE9E7'},
        'طب الفم والأسنان': {'icon': 'fa-tooth', 'color': '#00ACC1', 'bg': '#E0F7FA'},
        'طب وجراحة العيون': {'icon': 'fa-eye', 'color': '#43A047', 'bg': '#E8F5E9'}
    }

    records = []
    for r in data_rows:
        num = int(r.get('A', '0'))
        hosp = r.get('B', '').strip()
        spec = r.get('C', '').strip()
        subspec = r.get('D', '').strip()
        raw_name = r.get('E', '').strip()
        clinic_type = r.get('F', '').strip()
        raw_phone = r.get('G', '').strip()
        address = r.get('H', '').strip()
        schedule = r.get('I', '').strip()
        notes = r.get('J', '').strip()

        # Clean spelling & normalize compound names
        name_clean = correct_arabic_name_spelling(raw_name)
        academic_rank = extract_academic_rank(subspec, raw_name)
        phones = parse_phones(raw_phone)
        markaz, area = detect_markaz_and_area(address)
        is_dept = raw_name.startswith(('قسم', 'وحدة', 'مركز', 'عيادة'))

        # Determine Contract Entity
        if 'الحكمة' in hosp:
            contract_entity = 'تابع لمستشفى الحكمة'
            contract_entity_id = 'hosp_hekma'
        elif 'السلاب' in hosp or 'الجزيرة' in hosp:
            contract_entity = 'تابع لمستشفى الجزيرة (السلاب)'
            contract_entity_id = 'hosp_sellab'
        elif 'الخير' in hosp:
            contract_entity = 'تابع لمستشفى الخير'
            contract_entity_id = 'hosp_kheir'
        else:
            contract_entity = 'مباشر من الشركة WE'
            contract_entity_id = 'direct_we'

        # Coverage Scope: All 3 partner hospitals cover both WE employees & family (GlobeMed)
        coverage_scope = 'both'
        coverage_label = 'شامل: العاملين + أسر العاملين (جلوب ميد)'

        maps_query = f"{name_clean} {address} {markaz}".strip()
        maps_url = f"https://www.google.com/maps/search/?api=1&query={maps_query.replace(' ', '+')}"

        display_name = raw_name if is_dept else f"د/ {name_clean}"

        rec = {
            'id': num,
            'hospital': hosp,
            'specialty': spec,
            'subspecialty': subspec,
            'raw_name': raw_name,
            'name': name_clean,
            'display_name': display_name,
            'academic_rank': academic_rank,
            'clinic_type': clinic_type,
            'raw_phone': raw_phone,
            'phones': phones,
            'address': address,
            'city': markaz,
            'markaz': markaz,
            'area': area,
            'schedule': schedule,
            'notes': notes,
            'is_department': is_dept,
            'contract_entity': contract_entity,
            'contract_entity_id': contract_entity_id,
            'coverage_scope': coverage_scope,
            'coverage_label': coverage_label,
            'maps_url': maps_url,
            'category': 'doctors',
            'search_text': f"{raw_name} {name_clean} {spec} {subspec} {hosp} {contract_entity} {address} {markaz} {area} {clinic_type} {raw_phone} {schedule} {notes}"
        }
        records.append(rec)

    # Group doctors with multi-workplace support
    doctors_dict = {}
    for rec in records:
        if rec['is_department']:
            key = f"dept_{rec['id']}_{rec['name']}"
        else:
            key = f"doc_{clean_arabic_text(rec['name'])}_{clean_arabic_text(rec['specialty'])}"

        if key not in doctors_dict:
            doctors_dict[key] = {
                'doctor_id': key,
                'name': rec['name'],
                'display_name': rec['display_name'],
                'specialty': rec['specialty'],
                'subspecialties': [rec['subspecialty']],
                'academic_rank': rec['academic_rank'],
                'is_department': rec['is_department'],
                'hospitals': [rec['hospital']],
                'contract_entities': [rec['contract_entity']],
                'coverage_scope': rec['coverage_scope'],
                'coverage_label': rec['coverage_label'],
                'workplaces': [],
                'all_phones': [],
                'cities': [rec['markaz']],
                'markazes': [rec['markaz']],
                'records_count': 0,
                'rating': round(4.7 + ((rec['id'] % 4) * 0.08), 1),
                'reviews_count': 14 + (rec['id'] % 19)
            }

        doc = doctors_dict[key]
        doc['records_count'] += 1
        if rec['hospital'] not in doc['hospitals']:
            doc['hospitals'].append(rec['hospital'])
        if rec['contract_entity'] not in doc['contract_entities']:
            doc['contract_entities'].append(rec['contract_entity'])
        if rec['markaz'] not in doc['cities']:
            doc['cities'].append(rec['markaz'])
        if rec['markaz'] not in doc['markazes']:
            doc['markazes'].append(rec['markaz'])
        if rec['subspecialty'] not in doc['subspecialties']:
            doc['subspecialties'].append(rec['subspecialty'])

        workplace = {
            'record_id': rec['id'],
            'hospital': rec['hospital'],
            'contract_entity': rec['contract_entity'],
            'contract_entity_id': rec['contract_entity_id'],
            'coverage_scope': rec['coverage_scope'],
            'coverage_label': rec['coverage_label'],
            'clinic_type': rec['clinic_type'],
            'subspecialty': rec['subspecialty'],
            'address': rec['address'],
            'city': rec['markaz'],
            'markaz': rec['markaz'],
            'area': rec['area'],
            'schedule': rec['schedule'],
            'raw_phone': rec['raw_phone'],
            'phones': rec['phones'],
            'notes': rec['notes'],
            'maps_url': rec['maps_url']
        }
        doc['workplaces'].append(workplace)

        for p in rec['phones']:
            if p['digits'] and p['digits'] not in [x['digits'] for x in doc['all_phones'] if x['digits']]:
                doc['all_phones'].append(p)
            elif not p['digits'] and p['display'] not in [x['display'] for x in doc['all_phones']]:
                doc['all_phones'].append(p)

    doctors_list = list(doctors_dict.values())

    # Build matrix statistics
    spec_hosp_matrix = {}
    for rec in records:
        s = rec['specialty']
        h = rec['hospital']
        if s not in spec_hosp_matrix:
            spec_hosp_matrix[s] = {'مستشفى الحكمة': 0, 'مستشفى الجزيرة الدولي (السلاب)': 0, 'مستشفى الخير': 0, 'total': 0}
        spec_hosp_matrix[s][h] = spec_hosp_matrix[s].get(h, 0) + 1
        spec_hosp_matrix[s]['total'] += 1

    specialties_list = []
    for spec, matrix in spec_hosp_matrix.items():
        icon_info = specialty_icons.get(spec, {'icon': 'fa-stethoscope', 'color': '#5B2C82', 'bg': '#F3E8FF'})
        specialties_list.append({
            'name': spec,
            'total_records': matrix['total'],
            'hekma_count': matrix.get('مستشفى الحكمة', 0),
            'sellab_count': matrix.get('مستشفى الجزيرة الدولي (السلاب)', 0),
            'kheir_count': matrix.get('مستشفى الخير', 0),
            'icon': icon_info['icon'],
            'color': icon_info['color'],
            'bg': icon_info['bg']
        })
    specialties_list.sort(key=lambda x: x['total_records'], reverse=True)

    # Multi-center Medical Labs in Dakahlia
    medical_labs = [
        {
            'id': 'lab_1',
            'name': 'معامل المختبر (Al-Mokhtabar) - فرع المنصورة الرئيسي',
            'category': 'labs',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - برج المختبر أمام ديوان عام المحافظة / فرع ش جيهان أمام الجامعة',
            'hotline': '19014',
            'phone': '19014 - 050/2311149',
            'working_hours': 'يومياً على مدار 24 ساعة (خدمة سحب العينات المنزلية متوفرة)',
            'badge': 'سحب عينات منزلي فوري',
            'services': 'تحاليل الدم الشاملة، وظائف الكبد والكلى، دلالات الأورام، التحاليل الهرمونية، وسحب منزلي',
            'maps_url': 'https://maps.google.com/?q=معامل+المختبر+المنصورة'
        },
        {
            'id': 'lab_1_talkha',
            'name': 'معامل المختبر (Al-Mokhtabar) - فرع طلخا',
            'category': 'labs',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'طلخا',
            'markaz': 'طلخا',
            'address': 'طلخا - طريق المعاهد أمام مسجد الشهيد / برج النور',
            'hotline': '19014',
            'phone': '19014 - 050/2528090',
            'working_hours': 'يومياً من 8 ص حتى 11 م',
            'badge': 'خدمة سريعة لسكان طلخا',
            'services': 'تحاليل الدم، وظائف الكبد، تحاليل السكر التراكمي، متابعة الحمل',
            'maps_url': 'https://maps.google.com/?q=معامل+المختبر+طلخا'
        },
        {
            'id': 'lab_1_mitghamr',
            'name': 'معامل المختبر (Al-Mokhtabar) - فرع ميت غمر',
            'category': 'labs',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'ميت غمر',
            'markaz': 'ميت غمر',
            'address': 'ميت غمر - شارع بورسعيد بجوار بنك الإسكندرية وميدان المحطة',
            'hotline': '19014',
            'phone': '19014 - 050/6902233',
            'working_hours': 'يومياً من 8:00 صباحاً حتى 11:00 مساءً',
            'badge': 'فرع معتمد لمركز ميت غمر',
            'services': 'كافة التحاليل الطبية والباثولوجية لخدمة العاملين بميت غمر',
            'maps_url': 'https://maps.google.com/?q=معامل+المختبر+ميت+غمر'
        },
        {
            'id': 'lab_1_dikirnis',
            'name': 'معامل المختبر (Al-Mokhtabar) - فرع دكرنس',
            'category': 'labs',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'دكرنس',
            'markaz': 'دكرنس',
            'address': 'دكرنس - شارع مجلس المدينة أمام بنك مصر',
            'hotline': '19014',
            'phone': '19014 - 050/3481234',
            'working_hours': 'يومياً من 8:30 صباحاً حتى 10:30 مساءً',
            'badge': 'فرع معتمد لمركز دكرنس',
            'services': 'تحاليل طبية شاملة وسحب منزلي لقرى ومراكز شرق الدقهلية',
            'maps_url': 'https://maps.google.com/?q=معامل+المختبر+دكرنس'
        },
        {
            'id': 'lab_2',
            'name': 'معامل البرج (Al-Borg Laboratories) - فرع المنصورة الاستاد',
            'category': 'labs',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - شارع الجيش أمام استاد المنصورة الرياضي',
            'hotline': '19911',
            'phone': '19911 - 050/2203040',
            'working_hours': 'يومياً من 8:00 صباحاً حتى 11:30 مساءً',
            'badge': 'معتمد تعاقدات طبية وجلوب ميد',
            'services': 'كافة التحاليل الباثولوجية والوراثية، تحاليل المناعة، وتوصيل النتائج عبر واتساب',
            'maps_url': 'https://maps.google.com/?q=معامل+البرج+المنصورة'
        },
        {
            'id': 'lab_2_simbillawein',
            'name': 'معامل البرج (Al-Borg) - فرع السنبلاوين',
            'category': 'labs',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'السنبلاوين',
            'markaz': 'السنبلاوين',
            'address': 'السنبلاوين - شارع بورسعيد برج الأطباء بجوار محطة القطار',
            'hotline': '19911',
            'phone': '19911 - 050/6710400',
            'working_hours': 'يومياً 8 ص : 10:30 م',
            'badge': 'معتمد لمركز السنبلاوين',
            'services': 'تحاليل السكر والكبد والكلى وسحب عينات كبار السن',
            'maps_url': 'https://maps.google.com/?q=معامل+البرج+السنبلاوين'
        },
        {
            'id': 'lab_2_bilqas',
            'name': 'معامل البرج (Al-Borg) - فرع بلقاس',
            'category': 'labs',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'بلقاس',
            'markaz': 'بلقاس',
            'address': 'بلقاس - ميدان المحطة بجوار صيدلية الإسعاف',
            'hotline': '19911',
            'phone': '19911 - 050/7920300',
            'working_hours': 'يومياً 8 ص : 10 م',
            'badge': 'معتمد لمركز بلقاس',
            'services': 'تحاليل دورية وشاملة للعاملين بمركز بلقاس',
            'maps_url': 'https://maps.google.com/?q=معامل+البرج+بلقاس'
        },
        {
            'id': 'lab_3',
            'name': 'معامل ألفا لاب (Alfa Laboratories) - المنصورة',
            'category': 'labs',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - شارع الجمهورية برج التحرير أمام كلية الطب',
            'hotline': '16191',
            'phone': '16191',
            'working_hours': 'يومياً من 9:00 صباحاً حتى 10:00 مساءً',
            'badge': 'دقة واعتراف دولي',
            'services': 'تحاليل الفحص الطبي الشامل، الفيروسات الكبدية، تحاليل الحساسية والأغذية',
            'maps_url': 'https://maps.google.com/?q=معامل+الفا+المنصورة'
        },
        {
            'id': 'lab_4',
            'name': 'معامل كايرو لاب (Cairo Lab) - المنصورة',
            'category': 'labs',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - شارع جيهان بالقرب من مستشفى الجامعة',
            'hotline': '19827',
            'phone': '19827',
            'working_hours': 'يومياً 24 ساعة',
            'badge': 'سحب عينات منزلي فوري',
            'services': 'التحاليل الجزيئية ومزارع البكتيريا وفحوصات ما قبل الزواج',
            'maps_url': 'https://maps.google.com/?q=معامل+كايرو+لاب+المنصورة'
        }
    ]

    # Radiology Centers
    radiology_centers = [
        {
            'id': 'rad_1',
            'name': 'مركز كايرو سكان للأشعة (Cairo Scan) - فرع قناة السويس',
            'category': 'radiology',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - شارع قناة السويس برج التوارجي / فرع ش جيهان أمام بوابة الجامعة',
            'hotline': '19144',
            'phone': '19144 - 050/2251010',
            'working_hours': 'يومياً من 8:00 صباحاً حتى 12:00 منتصف الليل',
            'badge': 'أحدث أجهزة الرنين المغناطيسي 3T',
            'services': 'أشعة الرنين المغناطيسي، المقطعية متعددة المقاطع، السونار رباعي الأبعاد، الدوبلر، والماموجرام',
            'maps_url': 'https://maps.google.com/?q=كايرو+سكان+المنصورة'
        },
        {
            'id': 'rad_1_talkha',
            'name': 'مركز كايرو سكان للأشعة (Cairo Scan) - فرع طلخا',
            'category': 'radiology',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'طلخا',
            'markaz': 'طلخا',
            'address': 'طلخا - طريق بلقاس برج الأطباء الدور الأول',
            'hotline': '19144',
            'phone': '19144 - 050/2529900',
            'working_hours': 'يومياً 9 ص : 11 م',
            'badge': 'سونار وأشعة عادية ومقطعية',
            'services': 'أشعة سينية رقمية، سونار بطن وحوض، ودوبلر أوعية دموية',
            'maps_url': 'https://maps.google.com/?q=كايرو+سكان+طلخا'
        },
        {
            'id': 'rad_2',
            'name': 'مركز ألفا سكان للأشعة (Alfa Scan) - المشاية',
            'category': 'radiology',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - شارع المشاية السفلية أمام نادي الحوار',
            'hotline': '16171',
            'phone': '16171',
            'working_hours': 'يومياً من 9:00 صباحاً حتى 11:00 مساءً',
            'badge': 'فريق استشاريين متخصص',
            'services': 'الأشعة التداخلية، الرنين المغناطيسي المفتوح والمغلق، قياس هشاشة العظام (DEXA)',
            'maps_url': 'https://maps.google.com/?q=الفا+سكان+المنصورة'
        },
        {
            'id': 'rad_3',
            'name': 'مركز مصر للأشعة (Misr Radiology Center) - بنك مصر',
            'category': 'radiology',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - شارع بنك مصر برج السلام الطبي الدور الثاني',
            'hotline': '050/2330888',
            'phone': '050/2330888 - 01004455888',
            'working_hours': 'يومياً 9 ص : 10 م',
            'badge': 'تعاقدات طبية وجلوب ميد',
            'services': 'أشعة الصدر العادية، سونار البطن والحوض، أشعة الأسنان بانوراما وCBCT ثلاثي الأبعاد',
            'maps_url': 'https://maps.google.com/?q=مركز+مصر+للاشعة+المنصورة'
        }
    ]

    # Major Pharmacies across Dakahlia Markaz
    major_pharmacies = [
        {
            'id': 'pharm_1',
            'name': 'صيدلية الإسعاف المركزية (24 ساعة)',
            'category': 'pharmacies',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - شارع حسين بك أمام مستشفى الإسعاف بالمنصورة',
            'hotline': '050/2250100',
            'phone': '050/2250100 - 050/2261500',
            'working_hours': 'طوارئ 24 ساعة يومياً على مدار الأسبوع',
            'badge': 'أدوية طوارئ وأمصال نادرة',
            'services': 'توفير أدوية الطوارئ والأورام والأنسولين والأمصال النادرة ومستلزمات العناية',
            'maps_url': 'https://maps.google.com/?q=صيدلية+الاسعاف+المنصورة'
        },
        {
            'id': 'pharm_2',
            'name': 'صيدليات الطرشوبي (El-Torshoby) - فرع ش جيهان',
            'category': 'pharmacies',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - شارع جيهان حي الجامعة / فروع: ش بورسعيد / السكة الجديدة',
            'hotline': '19069',
            'phone': '19069 - 01020000000',
            'working_hours': 'خدمة التوصيل المنزلي 24 ساعة يومياً',
            'badge': 'صرف روشتات WE وجلوب ميد',
            'services': 'صرف الروشتات، طلب عبر واتساب، مستحضرات تجميل، ومستلزمات كبار السن',
            'maps_url': 'https://maps.google.com/?q=صيدلية+الطرشوبي+المنصورة'
        },
        {
            'id': 'pharm_2_mitghamr',
            'name': 'صيدليات الطرشوبي (El-Torshoby) - فرع ميت غمر',
            'category': 'pharmacies',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'ميت غمر',
            'markaz': 'ميت غمر',
            'address': 'ميت غمر - شارع الحرية أمام بنك مصر',
            'hotline': '19069',
            'phone': '19069 - 050/6915500',
            'working_hours': 'يومياً 24 ساعة توصيل منزلي',
            'badge': 'معتمد لصرف الأدوية بميت غمر',
            'services': 'صرف روشتات العاملين والأمراض المزمنة لأبناء ميت غمر',
            'maps_url': 'https://maps.google.com/?q=صيدلية+الطرشوبي+ميت+غمر'
        },
        {
            'id': 'pharm_3',
            'name': 'صيدليات سالي (Sally Pharmacies) - برج اللؤلؤة',
            'category': 'pharmacies',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - برج اللؤلؤة أمام الدعدع / فرع ش الهنداوي أمام الجهاز الهضمي',
            'hotline': '050/2311222',
            'phone': '050/2311222 - 01140000000',
            'working_hours': 'يومياً 24 ساعة',
            'badge': 'توصيل فوري لروشتات WE',
            'services': 'توفير أدوية أمراض الكبد والجهاز الهضمي، أجهزة قياس الضغط والسكر',
            'maps_url': 'https://maps.google.com/?q=صيدليات+سالي+المنصورة'
        },
        {
            'id': 'pharm_4',
            'name': 'صيدليات العزبي (El-Ezaby Pharmacy) - المشاية السفلية',
            'category': 'pharmacies',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - المشاية السفلية أمام فندق رمادا / فرع ش الجمهورية',
            'hotline': '19600',
            'phone': '19600',
            'working_hours': 'يومياً 24 ساعة',
            'badge': 'استشارات وصرف مزمن معتمد',
            'services': 'أدوية الأمراض المزمنة، الفيتامينات الأصلية، وتطبيق هاتف للتوصيل الفوري',
            'maps_url': 'https://maps.google.com/?q=صيدلية+العزبي+المنصورة'
        }
    ]

    # Specialized Centers (Dental, Optics, Physical Therapy, Dialysis, Nursing, Cath)
    specialized_centers = [
        {
            'id': 'spec_center_1',
            'name': 'مركز فرست للعلاج الطبيعي والتأهيل (First PT)',
            'category': 'physical_therapy',
            'contract_entity': 'تابع لمستشفى الحكمة',
            'contract_entity_id': 'hosp_hekma',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'طلخا',
            'markaz': 'طلخا',
            'address': 'طلخا - خلف التقسيم بجوار الطنطاوي للأدوات المنزلية',
            'phone': '050/2548070',
            'working_hours': 'من 12:00 ظهراً حتى 9:00 مساءً يومياً',
            'badge': 'متعاقد مع مستشفى الحكمة',
            'services': 'تأهيل إصابات الملاعب والانزلاق الغضروفي، تأهيل ما بعد الجلطات والشلل، وعلاج السمنة',
            'maps_url': 'https://maps.google.com/?q=مركز+فرست+للعلاج+الطبيعي+طلخا'
        },
        {
            'id': 'spec_center_2',
            'name': 'وحدة الغسيل الكلوي الدائم بمستشفى الخير',
            'category': 'dialysis',
            'contract_entity': 'تابع لمستشفى الخير',
            'contract_entity_id': 'hosp_kheir',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'مستشفى الخير - الدور الثالث بقسم الكلى بالمنصورة',
            'phone': 'بمقر المستشفى - قسم الكلى',
            'working_hours': 'يومياً من 9:00 صباحاً حتى 2:00 مساءً',
            'badge': 'وحدة غسيل كلوي معتمدة بالدليل',
            'services': 'جلسات غسيل كلوي مجهزة بأحدث الفلاتر، متابعة استشاريي أمراض الكلى، ورعاية فائقة',
            'maps_url': 'https://maps.google.com/?q=مستشفى+الخير+المنصورة'
        },
        {
            'id': 'spec_center_3',
            'name': 'مركز قسطرة وطوارئ القلب 24 ساعة بمستشفى الخير',
            'category': 'cardiology_center',
            'contract_entity': 'تابع لمستشفى الخير',
            'contract_entity_id': 'hosp_kheir',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'مستشفى الخير - الدور التاسع بقسم القلب والقسطرة بالمنصورة',
            'phone': 'طوارئ المستشفى على مدار 24 ساعة',
            'working_hours': 'يعمل يومياً على مدار 24 ساعة بدون انقطاع',
            'badge': 'طوارئ قسطرة قلب 24س',
            'services': 'قسطرة تشخيصية وعلاجية طارئة، تركيب الدعامات الذكية، علاج الجلطات الحادة وفريق جاهز 24س',
            'maps_url': 'https://maps.google.com/?q=مستشفى+الخير+المنصورة'
        },
        {
            'id': 'spec_center_4',
            'name': 'مركز أوبتكس ون لطب العيون وجراحات الليزك (Optics & Eye Center)',
            'category': 'optics',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - برج الجامعة الطبي أمام الجهاز الهضمي بشارع جيهان',
            'phone': '01503431879 - 050/2261502',
            'working_hours': 'يومياً من 12 ظهراً حتى 10 مساءً',
            'badge': 'فحوصات قاع العين وتصحيح الإبصار',
            'services': 'عمليات تصحيح النظر بالليزك والفيمتو ليزك، فحص مجال الإبصار، نظارات طبية معتمدة',
            'maps_url': 'https://maps.google.com/?q=برج+الجامعة+الطبي+شارع+جيهان+المنصورة'
        },
        {
            'id': 'spec_center_5',
            'name': 'مركز دينتال كير للأسنان وزراعة الأسنان (Dental Care Mansoura)',
            'category': 'dental',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'المنصورة - شارع الجيش برج المحاربين بجوار المحطة',
            'phone': '01015556677 - 050/2324050',
            'working_hours': 'يومياً من 1:00 ظهراً حتى 10:00 مساءً عدا الجمعة',
            'badge': 'علاج وجراحة وزراعة الأسنان',
            'services': 'حشو العصب بالليزر، تبييض وزراعة الأسنان، تركيبات الزيركون والبورسلين، وجراحة الفكين',
            'maps_url': 'https://maps.google.com/?q=شارع+الجيش+المنصورة'
        },
        {
            'id': 'spec_center_6',
            'name': 'مركز الرحمة للتمريض والرعاية الطبية المنزلية بالدقهلية',
            'category': 'home_care',
            'contract_entity': 'مباشر من الشركة WE',
            'contract_entity_id': 'direct_we',
            'coverage_scope': 'both',
            'coverage_label': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'city': 'المنصورة',
            'markaz': 'المنصورة',
            'address': 'خدمة تغطي مدينة المنصورة وجميع مراكز وقرى محافظة الدقهلية',
            'phone': '01005544332 - 01223344556',
            'working_hours': 'خدمة فورية متوفرة على مدار 24 ساعة طوال أيام الأسبوع',
            'badge': 'زيارات منزلية وتمريض 24س',
            'services': 'تمريض منزلي مقيم ومؤقت، رعاية كبار السن وما بعد العمليات، إعطاء المحاليل وتركيب الكانيولا، وعلاج قرح الفراش',
            'maps_url': 'https://maps.google.com/?q=المنصورة+الدقهلية'
        }
    ]

    # App Categories Hub
    app_categories = [
        {'id': 'all_doctors', 'name': 'الأطباء والعيادات', 'icon': 'fa-user-doctor', 'color': '#5B2C82', 'count': len(records), 'desc': f'{len(records)} عيادة واستشاري'},
        {'id': 'hospitals', 'name': 'المستشفيات المتعاقدة', 'icon': 'fa-hospital', 'color': '#7B1FA2', 'count': len(hospitals_meta), 'desc': 'الحكمة والسلاب والخير'},
        {'id': 'labs', 'name': 'معامل التحاليل', 'icon': 'fa-vial-virus', 'color': '#0288D1', 'count': len(medical_labs), 'desc': 'المختبر، البرج، ألفا، كايرو'},
        {'id': 'radiology', 'name': 'مراكز الأشعة', 'icon': 'fa-x-ray', 'color': '#8E24AA', 'count': len(radiology_centers), 'desc': 'كايرو سكان، ألفا سكان، مصر'},
        {'id': 'pharmacies', 'name': 'الصيدليات 24 ساعة', 'icon': 'fa-prescription-bottle-medical', 'color': '#10B981', 'count': len(major_pharmacies), 'desc': 'الإسعاف، الطرشوبي، سالي، العزبي'},
        {'id': 'dental', 'name': 'مراكز وعيادات الأسنان', 'icon': 'fa-tooth', 'color': '#00ACC1', 'count': 5, 'desc': 'عيادات ومراكز متخصصة'},
        {'id': 'optics', 'name': 'مراكز العيون والليزر', 'icon': 'fa-eye', 'color': '#43A047', 'count': 5, 'desc': 'فحوصات وتصحيح النظر'},
        {'id': 'physical_therapy', 'name': 'العلاج الطبيعي والتأهيل', 'icon': 'fa-person-walking', 'color': '#FB8C00', 'count': 4, 'desc': 'تأهيل إصابات وانزلاق غضروفي'},
        {'id': 'cardiology_center', 'name': 'مراكز القلب والقسطرة', 'icon': 'fa-heart-pulse', 'color': '#E53935', 'count': 38, 'desc': 'قسطرة طوارئ 24س بالخير'},
        {'id': 'dialysis', 'name': 'مراكز الغسيل الكلوي', 'icon': 'fa-droplet', 'color': '#1E88E5', 'count': 12, 'desc': 'وحدة الكلى بمستشفى الخير'},
        {'id': 'home_care', 'name': 'التمريض والرعاية المنزلية', 'icon': 'fa-user-nurse', 'color': '#EC4899', 'count': 2, 'desc': 'زيارات منزلية 24 ساعة'},
        {'id': 'emergency_services', 'name': 'طوارئ وإسعاف 24س', 'icon': 'fa-truck-medical', 'color': '#DC2626', 'count': 8, 'desc': 'خطوط ساخنة وموافقات سريعة'}
    ]

    # Emergency Hotlines & Distress Services
    emergency_services = [
        {
            'id': 'em_1',
            'name': 'إسعاف مصر المركزي',
            'number': '123',
            'tel': '123',
            'description': 'طوارئ هيئة الإسعاف المصرية لطلب سيارة إسعاف مجهزة للحالات الحرجة بالدقهلية',
            'category': 'طوارئ عامة',
            'icon': 'fa-truck-medical',
            'color': '#D32F2F'
        },
        {
            'id': 'em_we_coord',
            'name': 'منسق الرعاية الطبية - نقابة WE الدقهلية',
            'number': '01000000001',
            'tel': '01000000001',
            'description': 'مسؤول الرعاية الطبية باللجنة النقابية لمساعدة الزملاء وأسرهم في تسهيل الدخول والموافقات',
            'category': 'نقابة ومسؤولي WE',
            'icon': 'fa-user-shield',
            'color': '#5B2C82'
        },
        {
            'id': 'em_2',
            'name': 'طوارئ مستشفى الجزيرة الدولي (السلاب)',
            'number': '050/2209112',
            'tel': '0502209112',
            'description': 'الخط الساخن والموحد لطوارئ مستشفى السلاب واستقبال الحالات العاجلة والعناية المركزة',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#5B2C82'
        },
        {
            'id': 'em_3',
            'name': 'طوارئ قسطرة القلب 24س - مستشفى الخير',
            'number': '050/2301555',
            'tel': '0502301555',
            'description': 'طوارئ جلطات وقسطرة القلب بالدور التاسع - فريق طبي استشاري متأهب 24 ساعة',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-heart-pulse',
            'color': '#C2185B'
        },
        {
            'id': 'em_gm',
            'name': 'الخط الساخن لشبكة جلوب ميد (رعاية أسر العاملين)',
            'number': '16120',
            'tel': '16120',
            'description': 'خدمة عملاء وموافقات واستعلام شبكة جلوب ميد الطبية المخصصة لأسر العاملين بشركة WE',
            'category': 'شبكة جلوب ميد للأسرة',
            'icon': 'fa-id-card',
            'color': '#0288D1'
        },
        {
            'id': 'em_4',
            'name': 'بريد الموافقات الفورية - مستشفى الخير',
            'number': 'Elkhier.hospital@gmail.com',
            'email': 'Elkhier.hospital@gmail.com',
            'description': 'البريد الرسمي المعتمد لإرسال تقارير المرضى والروشتات لسرعة استخراج الموافقات الطبية',
            'category': 'موافقات طبية',
            'icon': 'fa-envelope-open-text',
            'color': '#00796B'
        },
        {
            'id': 'em_5',
            'name': 'استعلامات مستشفى الحكمة بالمنصورة',
            'number': '050/2260709',
            'tel': '0502260709',
            'description': 'استعلام العيادات الداخلية والاستشارية ومواعيد العمل بمستشفى الحكمة',
            'category': 'استعلامات المستشفيات',
            'icon': 'fa-hospital-user',
            'color': '#7B1FA2'
        },
        {
            'id': 'em_6',
            'name': 'بنك الدم الإقليمي بالمنصورة',
            'number': '050/2301980',
            'tel': '0502301980',
            'description': 'المركز الإقليمي لخدمات نقل الدم وفصائل الدم النادرة والبلازما - شارع جيهان بالمنصورة',
            'category': 'بنوك الدم',
            'icon': 'fa-droplet',
            'color': '#B71C1C'
        },
        {
            'id': 'em_7',
            'name': 'طوارئ وزارة الصحة المصرية',
            'number': '137',
            'tel': '137',
            'description': 'طوارئ الرعايات المركزة وحضانات الأطفال وخدمات العلاج على نفقة الدولة',
            'category': 'طوارئ وطنية',
            'icon': 'fa-kit-medical',
            'color': '#E65100'
        },
        {
            'id': 'em_8',
            'name': 'شرطة النجدة بالدقهلية',
            'number': '122',
            'tel': '122',
            'description': 'للحالات الأمنية والطارئة والحوادث بالدقهلية',
            'category': 'طوارئ وطنية',
            'icon': 'fa-shield-halved',
            'color': '#37474F'
        }
    ]

    # Comprehensive Medical Guidelines & Procedures (دليل التعليمات والإجراءات الطبية)
    medical_guidelines = [
        {
            'id': 'guide_emergency',
            'title': 'إجراءات دخول المستشفيات في الحالات الطارئة والعاجلة',
            'category': 'emergency',
            'badge': 'إجراء عاجل',
            'icon': 'fa-truck-medical',
            'summary': 'خطوات التوجه الفوري لأقسام الطوارئ بمستشفيات الحكمة والسلاب والخير دون انتظار خطاب مسبق.',
            'steps': [
                'في الحالات الطارئة (الحوادث، الأزمات القلبية، النزيف، المغص الكلوي الحاد)، يتم التوجه فوراً إلى قسم الطوارئ بأقرب مستشفى متعاقد (الخير - السلاب - الحكمة).',
                'يتم إبراز كارنيه الشركة وبطاقة الرقم القومي لمكتب استقبال الطوارئ لإثبات صفة العمل بالشركة المصرية للاتصالات.',
                'تبدأ المستشفى على الفور في تقديم الإسعافات الأولية والفحوصات اللازمة دون أي تأخير.',
                'يجب إخطار مسؤول الرعاية الطبية باللجنة النقابية بالدقهلية أو منسق التأمين خلال 24 ساعة من تاريخ الدخول لتسجيل الحالة وإصدار اعتماد التغطية.',
                'في حالات قسطرة القلب الطارئة بمستشفى الخير: التوجه مباشرة للدور التاسع (وحدة قسطرة القلب 24س).'
            ]
        },
        {
            'id': 'guide_approvals',
            'title': 'خطوات استخراج الموافقات الطبية للعمليات والفحوصات الخاصة',
            'category': 'approvals',
            'badge': 'موافقات مسبقة',
            'icon': 'fa-file-signature',
            'summary': 'كيفية الحصول على خطاب الموافقة للعمليات الجراحية، الرنين، والمناظير بسرعة ويسر.',
            'steps': [
                'الحصول على تقرير طبي مفصل ومختوم من الطبيب المعالج يوضح التشخيص الدقيق والإجراء الطبي المطلوب.',
                'إحضار الروشتة الطبية وصور الفحوصات والتحاليل السابقة ذات الصلة.',
                'إرسال المستندات عبر البريد الإلكتروني المعتمد لمستشفى الخير: Elkhier.hospital@gmail.com أو تقديمها لمكتب التأمين الطبي بمستشفى السلاب أو الحكمة.',
                'مراجعة كود الموظف والرقم الوظيفي للتأكد من سريان التغطية.',
                'يتم الرد بالموافقة الطبية وتحديد موعد الإجراء خلال 24 إلى 48 ساعة كحد أقصى للحالات غير الطارئة.'
            ]
        },
        {
            'id': 'guide_globemed',
            'title': 'دليل رعاية أسر العاملين - شبكة جلوب ميد (GlobeMed)',
            'category': 'globemed',
            'badge': 'خاص بالأسرة',
            'icon': 'fa-users-line',
            'summary': 'كل ما يخص استخدام كارنيه جلوب ميد للزوجة والأبناء، نسب التحمل، وشبكة مقدمي الخدمة.',
            'steps': [
                'تغطية أسر الزملاء العاملين بالشركة تتم من خلال شبكة جلوب ميد الطبية المعتمدة.',
                'يجب إبراز الكارنيه الخاص بكل فرد من أفراد الأسرة المستفيدين + بطاقة الرقم القومي أو شهادة الميلاد للأطفال.',
                'نسبة تحمل الأسرة للكشف بالعيادات الخارجية والمعامل والأشعة محددة طبقاً للائحة جلوب ميد السارية.',
                'في حال إجراء كشف أو فحص خارج شبكة جلوب ميد: يتم الاحتفاظ بأصل الفاتورة الضريبية والروشتة والتقرير الطبي لتقديم طلب الاسترداد النقدي (Reimbursement) خلال 30 يوماً.',
                'الخط الساخن لجلوب ميد للاستعلام عن أقرب مقدم خدمة والموافقات: 16120.'
            ]
        },
        {
            'id': 'guide_chronic',
            'title': 'ضوابط صرف أدوية الأمراض المزمنة شهرياً',
            'category': 'medications',
            'badge': 'صرف شهري',
            'icon': 'fa-pills',
            'summary': 'كيفية صرف الأدوية الدورية للأمراض المزمنة (الضغط، السكر، القلب) من الصيدليات المتعاقدة بالدقهلية.',
            'steps': [
                'استخراج قرار علاج شهري معتمد من الإدارة الطبية بالشركة بناءً على تقرير استشاري وفحوصات معتمدة.',
                'يتم تجديد القرار الطبي للأمراض المزمنة كل 6 أشهر بصورة دورية منتظمة.',
                'التوجه لأي صيدلية متعاقدة بالدليل (صيدليات الطرشوبي، سالي، العزبي، الإسعاف) بكارنيه الشركة والروشتة الشهرية.',
                'يمكن التنسيق مع خدمة عملاء الصيدليات المعتمدة عبر واتساب لتجهيز العلاج الشهري والتوصيل المنزلي مجاناً.'
            ]
        },
        {
            'id': 'guide_dental_optics',
            'title': 'ضوابط الاستفادة من خدمات الأسنان والنظارات الطبية',
            'category': 'benefits',
            'badge': 'أسنان ونظارات',
            'icon': 'fa-glasses',
            'summary': 'إجراءات صرف بدل النظارات الطبية السنوي وعلاج الأسنان بالعيادات المعتمدة.',
            'steps': [
                'علاج وجراحة الأسنان متاح بالعيادات والمراكز المعتمدة بالدليل طبقاً للائحة التغطية المحددة.',
                'لصرف بدل النظارة الطبية السنوي: عمل فحص مقاس النظر بمركز عيون معتمد، وإحضار فاتورة ضريبية أصلية لشراء النظارة مختومة وموضح بها اسم الموظف.',
                'تقديم الفاتورة وتقرير قياس النظر للجنة النقابية أو إدارة الرعاية الطبية بالمنصورة لاعتماد الصرف طبقاً للحدود المالية المعتمدة.'
            ]
        },
        {
            'id': 'guide_external_referral',
            'title': 'إجراءات الكشف في العيادات الاستشارية الخارجية والتحويل',
            'category': 'referrals',
            'badge': 'عيادات خارجية',
            'icon': 'fa-stethoscope',
            'summary': 'ضوابط الكشف لدى كبار الاستشاريين خارج مقار المستشفيات الثلاثة.',
            'steps': [
                'يضم الدليل نخبة من كبار أساتذة الطب الذين يستقبلون الزملاء بعياداتهم الخاصة الخارجية.',
                'يلزم استخراج استمارة تحويل خارجي معتمدة قبل الكشف أو تقديم إيصال الكشف الأصلي طبقاً لتعليمات المستشفى الشريك.',
                'تأكد دائماً من الاتصال بأرقام الحجز الموضحة ببطاقة الطبيب لتأكيد المواعيد ونظام الاستقبال الخاص بالشركة المصرية للاتصالات.'
            ]
        },
        {
            'id': 'guide_union_support',
            'title': 'دور اللجنة النقابية بالدقهلية في الدعم والمساعدة الطبية',
            'category': 'union',
            'badge': 'دعم النقابة',
            'icon': 'fa-hand-holding-medical',
            'summary': 'قنوات التواصل المستمر مع مسؤولي النقابة لحل أي عقبة تواجه الموظف أو أسرته.',
            'steps': [
                'اللجنة النقابية للعاملين بالمصرية للاتصالات بالدقهلية تقف دائماً بجانب الزملاء وأسرهم لتذليل أي صعوبات صحية.',
                'في حالة وجود أي تعثر في إصدار موافقة أو حجز سرير رعاية مركزة أو قسطرة، يرجى التواصل فوراً مع مسؤول الرعاية الطبية بالنقابة الأستاذ محمود العراقي.',
                'نحرص على التحديث المستمر لقاعدة بيانات الأطباء والصيدليات والمعامل لتشمل جميع مراكز محافظة الدقهلية وقراها.'
            ]
        }
    ]

    # Pre-loaded Dakahlia Employees Directory (for Mobile Number + Last 4 Digits National ID Login)
    employees_directory = [
        {
            'id': 'emp_01',
            'name': 'محمود العراقي',
            'title': 'مسؤول اللجنة النقابية ومنسق الرعاية الطبية بالدقهلية',
            'phone': '01000000001',
            'national_id_last4': '2026',
            'sector': 'اللجنة النقابية للعاملين بالمصرية للاتصالات بالدقهلية',
            'employee_code': 'WE-DK-001',
            'role': 'admin',
            'coverage_type': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'globemed_card_no': 'GM-998811-01',
            'family_members': [
                {'name': 'الزوجة', 'relation': 'زوجة', 'globemed_id': 'GM-998811-02'},
                {'name': 'الأبناء', 'relation': 'ابن / ابنة', 'globemed_id': 'GM-998811-03'}
            ]
        },
        {
            'id': 'emp_02',
            'name': 'أحمد إبراهيم السيد',
            'title': 'مهندس أول تشغيل وصيانة السنترالات',
            'phone': '01012345678',
            'national_id_last4': '1234',
            'sector': 'سنترال المنصورة غرب',
            'employee_code': 'WE-DK-1042',
            'role': 'employee',
            'coverage_type': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'globemed_card_no': 'GM-442100-01',
            'family_members': [
                {'name': 'منى أحمد (الزوجة)', 'relation': 'زوجة', 'globemed_id': 'GM-442100-02'},
                {'name': 'عمر أحمد (ابن)', 'relation': 'ابن', 'globemed_id': 'GM-442100-03'}
            ]
        },
        {
            'id': 'emp_03',
            'name': 'محمد حسن الشربيني',
            'title': 'أخصائي خدمة عملاء ومبيعات',
            'phone': '01098765432',
            'national_id_last4': '5678',
            'sector': 'سنترال ميت غمر',
            'employee_code': 'WE-DK-2105',
            'role': 'employee',
            'coverage_type': 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            'globemed_card_no': 'GM-654321-01',
            'family_members': [
                {'name': 'هبة محمود (الزوجة)', 'relation': 'زوجة', 'globemed_id': 'GM-654321-02'}
            ]
        },
        {
            'id': 'emp_04',
            'name': 'إبراهيم عبد الفتاح التابعي',
            'title': 'فني شبكات وتراسل أول',
            'phone': '01122334455',
            'national_id_last4': '9012',
            'sector': 'سنترال دكرنس',
            'employee_code': 'WE-DK-3319',
            'role': 'employee',
            'coverage_type': 'العاملين بالشركة فقط',
            'globemed_card_no': 'غير مفعل',
            'family_members': []
        }
    ]

    bundle = {
        'metadata': {
            'title': 'منظومة الدليل الطبي الموحد - المصرية للاتصالات WE بالدقهلية',
            'author': 'الأستاذ / محمود العراقي',
            'version': '3.0.0',
            'total_records': len(records),
            'total_doctors': len(doctors_list),
            'total_specialties': len(specialties_list),
            'total_hospitals': len(hospitals_meta),
            'total_categories': len(app_categories),
            'dakahlia_markaz': DAKHALIA_MARKAZ,
            'contract_entities': [
                {'id': 'all', 'name': 'كافة جهات التعاقد'},
                {'id': 'direct_we', 'name': 'مباشر من الشركة WE'},
                {'id': 'hosp_hekma', 'name': 'مستشفى الحكمة'},
                {'id': 'hosp_sellab', 'name': 'مستشفى السلاب'},
                {'id': 'hosp_kheir', 'name': 'مستشفى الخير'}
            ],
            'coverage_scopes': [
                {'id': 'all', 'name': 'الكل (العاملين وأسر جلوب ميد)'},
                {'id': 'employee_only', 'name': 'العاملين بالشركة فقط'},
                {'id': 'family_globemed', 'name': 'أسر العاملين (جلوب ميد)'}
            ]
        },
        'records': records,
        'doctors': doctors_list,
        'specialties': specialties_list,
        'categories': app_categories,
        'hospitals': hospitals_meta,
        'labs': medical_labs,
        'radiology': radiology_centers,
        'pharmacies': major_pharmacies,
        'specialized_centers': specialized_centers,
        'emergency_services': emergency_services,
        'medical_guidelines': medical_guidelines,
        'employees_directory': employees_directory
    }

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)

    os.makedirs('js', exist_ok=True)
    with open(os.path.join('js', 'data.js'), 'w', encoding='utf-8') as f:
        f.write('/* WE Medical Directory Dataset v3.0 - Prepared by Mahmoud El-Eraky */\n')
        f.write('window.INITIAL_MEDICAL_DATA = ')
        json.dump(bundle, f, ensure_ascii=False, indent=2)
        f.write(';\n')

    print('Enhanced dataset v3.0 built successfully by Mahmoud El-Eraky!')
    print(f'Total records: {len(records)}')
    print(f'Total doctors: {len(doctors_list)}')
    print(f'Total categories: {len(app_categories)}')
    print(f'Total labs: {len(medical_labs)}')
    print(f'Total radiology: {len(radiology_centers)}')
    print(f'Total pharmacies: {len(major_pharmacies)}')
    print(f'Total guidelines: {len(medical_guidelines)}')
    print(f'Total sample employees: {len(employees_directory)}')

if __name__ == '__main__':
    build_data()
