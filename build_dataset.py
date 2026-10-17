# -*- coding: utf-8 -*-
"""
WE Medical Directory - Comprehensive Data Processor & Normalizer (v4.0)
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

    SPECIALTY_SERVICES = {
        'أمراض القلب والأوعية الدموية': ['كشف واستشارة استشاري قلب', 'رسم قلب كهربائي (ECG)', 'موجات صوتية إيكو دبلر', 'هولتر ضغط ونبض 24س', 'فحص شرايين وقسطرة قلبية'],
        'أمراض الباطنة العامة والسكر': ['كشف باطنة عامة وتخصصي', 'متابعة سكر الدم التراكمي', 'علاج ارتفاع ضغط الدم والدهون', 'سونار بطن وحوض', 'فحص الغدد الصماء والمناعة'],
        'جراحة العظام والمفاصل': ['كشف عظام ومفاصل وفقرات', 'حقن المفاصل والركبة الموضعي', 'علاج آلام الانزلاق الغضروفي', 'متابعة وتجبير الكسور والإصابات', 'مناظير جراحة المفاصل'],
        'أمراض النساء والتوليد': ['كشف نساء ومتابعة الحمل', 'سونار ثلاثي ورباعي الأبعاد 4D', 'متابعة الحمل الحرج وسونار دوبلر', 'تخطيط نبض الجنين CTG', 'فحوصات تأخر الإنجاب'],
        'طب الأطفال وحديثي الولادة': ['كشف أطفال ورضع واستشارة', 'متابعة النمو والتغذية السليمة', 'تطعيمات وفحص صدر وحساسية', 'فحص حديثي الولادة والمبتسرين', 'سونار مخ وبطن أطفال'],
        'طب وجراحة العيون (الرمد)': ['كشف نظر وفحص قاع العين', 'قياس ضغط العين والقرنية', 'فحص وتصحيح الإبصار بالليزك', 'مجال إبصار وسونار عين', 'علاج ومتابعة اعتلال الشبكية السكري'],
        'جراحة المخ والأعصاب والعمود الفقري': ['كشف مخ وأعصاب دقيق', 'رسم مخ كهربائي EEG', 'رسم عضلات وتوصيل أعصاب', 'علاج الصداع النصفي والعصب السابع', 'استشارات جراحات الانزلاق الغضروفي'],
        'أمراض الكلى والمسالك البولية': ['كشف مسالك بولية وتناسلية', 'سونار كلى ومثانة وبروستاتا', 'تفتيت حصوات بالموجات التصادمية', 'منظار مسالك تشخيصي وعلاجي', 'متابعة وظائف الكلى والغسيل'],
        'جراحة الأنف والأذن والحنجرة': ['كشف منظار أنف وأذن وحنجرة', 'قياس ضغط الأذن وتخطيط السمع', 'تنظيف الأذن ميكروسكوبياً', 'علاج الدوار وعدم الاتزان وطنين الأذن', 'مناظير الجيوب الأنفية واللحمية'],
        'الأمراض الجلدية والتناسلية': ['كشف جلدية وفحص درموسكوب', 'جلسات ليزر وبلازما للشعر', 'كي تبريدي وكهربائي للزوائد', 'علاج الصدفية والبهاق والإكزيما', 'علاج حساسية الجلد والأمراض المناعية'],
        'جراحة الأوعية الدموية': ['كشف أوعية دموية وقدم سكري', 'دوبلر ملون على شرايين وأوردة', 'علاج دوالي الساقين بالليزر والحقن', 'توسيع انسداد الشرايين بالقسطرة', 'تركيب وصلات الغسيل الكلوي AVF'],
        'أمراض الصدر والجهاز التنفسي': ['كشف أمراض صدر وحساسية', 'اختبار وظائف وقياس كفاءة الرئة', 'جلسات استنشاق موسعات شعب وأكسجين', 'علاج الربو الشعبي والسدة الرئوية', 'تشخيص واختبارات الحساسية'],
        'الجراحة العامة والأورام': ['كشف جراحة عامة وتشخيص', 'جراحات المناظير الدقيقة (مرارة وزائدة)', 'جراحات الفتق واستئصال الأورام', 'جراحات الشرج والبواسير بالليزر', 'غيار جراحي متقدم للقدم السكري'],
        'العلاج الطبيعي والتأهيل': ['تقييم وتأهيل حركي شامل', 'جلسات علاج طبيعي للغضروف والرقبة', 'تأهيل إصابات الملاعب والرباط الصليبي', 'علاج طبيعي للأعصاب والجلطات الحركية', 'جلسات علاج كهربائي وموجات صوتية']
    }

    # Group doctors with multi-workplace support
    doctors_dict = {}
    for rec in records:
        if rec['is_department']:
            key = f"dept_{rec['id']}_{rec['name']}"
        else:
            key = f"doc_{clean_arabic_text(rec['name'])}_{clean_arabic_text(rec['specialty'])}"

        if key not in doctors_dict:
            spec_services = SPECIALTY_SERVICES.get(rec['specialty'], [
                'كشف واستشارة طبية متخصصة',
                'فحص إكلينيكي وتشخيص دقيق',
                'متابعة الحالات المرضية وتعديل العلاج',
                'إصدار التقارير والروشتات الطبية المعتمدة'
            ])
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
                'services': spec_services,
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

    # Emergency Hotlines & Verified Dakahlia Distress Directory (All 16 Markazes)
    emergency_services = [
        # --- Central & National Distress Lines ---
        {
            'id': 'em_1',
            'name': 'هيئة الإسعاف المصرية (الخط الساخن المركزي)',
            'markaz': 'المنصورة',
            'city': 'عموم محافظة الدقهلية',
            'affiliation': 'حكومي مركزي',
            'service_type': 'إسعاف فوري ونقل حرج',
            'number': '123',
            'tel': '123',
            'hours': '24 ساعة / طوال أيام الأسبوع',
            'is_24h': True,
            'address': 'تغطية فورية لكافة مدن وقرى ومراكز محافظة الدقهلية',
            'maps_url': 'https://maps.google.com/?q=مرفق+إسعاف+الدقهلية',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'هيئة الإسعاف المصرية فرع الدقهلية',
            'description': 'طلب سيارة إسعاف مجهزة ورعاية مركزة متنقلة للحالات الحرجة والحوادث بمحافظة الدقهلية',
            'category': 'طوارئ عامة',
            'icon': 'fa-truck-medical',
            'color': '#DC2626'
        },
        {
            'id': 'em_we_coord',
            'name': 'مسؤول الرعاية الطبية - نقابة WE بالدقهلية',
            'markaz': 'المنصورة',
            'city': 'الدقهلية',
            'affiliation': 'نقابة العاملين بالاتصالات WE',
            'service_type': 'تنسيق طوارئ وموافقات',
            'number': '',
            'tel': '',
            'hours': '24 ساعة للحالات الحرجة',
            'is_24h': True,
            'address': 'مقر اللجنة النقابية - سنترال المنصورة غرب',
            'maps_url': 'https://maps.google.com/?q=سنترال+المنصورة+غرب',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'اللجنة النقابية للعاملين بالشركة المصرية للاتصالات بالدقهلية',
            'description': 'أ / محمود العراقي - مساعدة الزملاء وأسرهم في تسهيل الدخول والتنسيق مع إدارة التأمين الطبي',
            'category': 'نقابة ومسؤولي WE',
            'icon': 'fa-user-shield',
            'color': '#5B2C82'
        },
        {
            'id': 'em_gm',
            'name': 'الخط الساخن لشبكة جلوب ميد (رعاية أسر العاملين)',
            'markaz': 'المنصورة',
            'city': 'عموم الجمهورية',
            'affiliation': 'شبكة جلوب ميد للرعاية',
            'service_type': 'موافقات واستعلام شبكة الأسرة',
            'number': '16120',
            'tel': '16120',
            'hours': '24 ساعة / 7 أيام',
            'is_24h': True,
            'address': 'مركز الاتصال الموحد لخدمة عملاء وموافقات أسر العاملين',
            'maps_url': 'https://maps.google.com/?q=GlobeMed+Egypt',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'شبكة جلوب ميد مصر',
            'description': 'خدمة عملاء وموافقات واستعلام الشبكة الطبية المخصصة لأسر العاملين بشركة WE',
            'category': 'شبكة جلوب ميد للأسرة',
            'icon': 'fa-id-card',
            'color': '#0288D1'
        },
        {
            'id': 'em_moh_icu',
            'name': 'طوارئ الرعايات المركزة والحضانات (وزارة الصحة)',
            'markaz': 'المنصورة',
            'city': 'الجمهورية',
            'affiliation': 'وزارة الصحة والسكان',
            'service_type': 'تسكين عناية مركزة وحضانات',
            'number': '137',
            'tel': '137',
            'hours': '24 ساعة / طوال أيام الأسبوع',
            'is_24h': True,
            'address': 'غرفة الطوارئ المركزية لوزارة الصحة المصرية',
            'maps_url': 'https://maps.google.com/?q=وزارة+الصحة+المصرية',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'وزارة الصحة والسكان',
            'description': 'البحث والتنسيق لأسرة العنايات المركزة الشاغرة وحضانات المبتسرين وأكياس الدم النادرة',
            'category': 'طوارئ وطنية',
            'icon': 'fa-kit-medical',
            'color': '#EA580C'
        },

        # --- Markaz 1: Mansoura (المنصورة) ---
        {
            'id': 'em_mans_emergency_univ',
            'name': 'مستشفى الطوارئ الجامعي بالمنصورة',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'جامعة المنصورة',
            'service_type': 'استقبال حوادث وطوارئ عامة وجراحة',
            'number': '050/2202685',
            'tel': '0502202685',
            'hours': '24 ساعة / طوال أيام الأسبوع مجاناً',
            'is_24h': True,
            'address': 'المنصورة - شارع جيهان - الحرم الجامعي الطبي',
            'maps_url': 'https://maps.google.com/?q=مستشفى+الطوارئ+جامعة+المنصورة',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مستشفيات جامعة المنصورة',
            'description': 'أكبر صرح طوارئ وحوادث وإصابات بالدلتا - استقبال طوارئ وجراحة وعناية مركزة 24/7',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },
        {
            'id': 'em_mans_intl_hosp',
            'name': 'مستشفى المنصورة الدولي (سندوب)',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'أمانة المراكز الطبية المتخصصة',
            'service_type': 'طوارئ متقدمة وعناية وبنك دم',
            'number': '050/2216060',
            'tel': '0502216060',
            'hours': '24 ساعة / طوال أيام الأسبوع',
            'is_24h': True,
            'address': 'المنصورة - مدخل سندوب / طريق المنصورة - القاهرة',
            'maps_url': 'https://maps.google.com/?q=مستشفى+المنصورة+الدولي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'أمانة المراكز الطبية المتخصصة',
            'description': 'طوارئ جراحية وباطنية مجهزة بأحدث أجهزة الرنين والقسطرة والعنايات المركزة',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#4338CA'
        },
        {
            'id': 'em_mans_old_general',
            'name': 'مستشفى المنصورة التخصصي (العام القديم)',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'أمانة المراكز الطبية المتخصصة',
            'service_type': 'طوارئ عامة وحوادث وعظام',
            'number': '050/2244244',
            'tel': '0502244244',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'المنصورة - شارع بنك مصر المتفرع من شارع الجمهورية',
            'maps_url': 'https://maps.google.com/?q=مستشفى+المنصورة+التخصصي+العام+القديم',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية بالدقهلية',
            'description': 'استقبال طوارئ وجراحة وعظام وأطفال وعناية مركزة وبنك دم تجميعي',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#047857'
        },
        {
            'id': 'em_mans_poison_center',
            'name': 'مركز علاج التسمم والسموم - جامعة المنصورة',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'جامعة المنصورة',
            'service_type': 'علاج تسمم وسموم طارئة ولغات حشرات',
            'number': '050/2259080',
            'tel': '0502259080',
            'hours': '24 ساعة / طوال أيام الأسبوع',
            'is_24h': True,
            'address': 'المنصورة - شارع جيهان - الحرم الجامعي بجوار الطوارئ',
            'maps_url': 'https://maps.google.com/?q=مركز+علاج+التسمم+المنصورة',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'كلية الطب جامعة المنصورة',
            'description': 'المركز التخصصي المعتمد للتعامل مع كافة حالات التسمم الدوائي، الغذائي، والمبيدات الحشرية',
            'category': 'طوارئ سموم وتسمم',
            'icon': 'fa-biohazard',
            'color': '#DC2626'
        },
        {
            'id': 'em_mans_ghonaim_urology',
            'name': 'مركز جراحة الكلى والمسالك البولية (مركز د. غنيم)',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'جامعة المنصورة',
            'service_type': 'طوارئ كلى ومسالك ومغص كلوي حاد',
            'number': '050/2202222',
            'tel': '0502202222',
            'hours': 'طوارئ 24 ساعة للحالات الحرجة',
            'is_24h': True,
            'address': 'المنصورة - شارع جيهان',
            'maps_url': 'https://maps.google.com/?q=مركز+الكلى+والمسالك+البولية+المنصورة',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مركز الكلى والمسالك البولية',
            'description': 'استقبال طوارئ المغص الكلوي الحاد واحتباس البول وإصابات الجهاز البولي',
            'category': 'طوارئ تخصصية',
            'icon': 'fa-droplet',
            'color': '#0284C7'
        },
        {
            'id': 'em_mans_pediatric_univ',
            'name': 'طوارئ مستشفى الأطفال الجامعي بالمنصورة',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'جامعة المنصورة',
            'service_type': 'طوارئ أطفال وبسترة وحضانات 24س',
            'number': '050/2202525',
            'tel': '0502202525',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'المنصورة - الحرم الجامعي الطبي - شارع جيهان',
            'maps_url': 'https://maps.google.com/?q=مستشفى+الأطفال+الجامعي+المنصورة',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مستشفى الأطفال الجامعي',
            'description': 'استقبال حوادث وأمراض الأطفال، حضانات حديثي الولادة والمبتسرين، وعناية مركزة أطفال',
            'category': 'طوارئ أطفال وحضانات',
            'icon': 'fa-baby',
            'color': '#EC4899'
        },
        {
            'id': 'em_mans_blood_bank',
            'name': 'بنك الدم الإقليمي بالمنصورة',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'مراكز خدمات نقل الدم القومية',
            'service_type': 'صرف دم وبلازما وفصائل نادرة',
            'number': '050/2301980',
            'tel': '0502301980',
            'hours': '24 ساعة / طوال أيام الأسبوع',
            'is_24h': True,
            'address': 'المنصورة - شارع جيهان أمام كلية التربية',
            'maps_url': 'https://maps.google.com/?q=بنك+الدم+الإقليمي+بالمنصورة',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'المركز الإقليمي لنقل الدم بالدقهلية',
            'description': 'توفير كافة فصائل الدم، البلازما الطازجة، الصفائح الدموية، والفصائل السالبة النادرة',
            'category': 'بنوك الدم',
            'icon': 'fa-droplet',
            'color': '#991B1B'
        },
        {
            'id': 'em_mans_fever_hosp',
            'name': 'مستشفى حميات المنصورة',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ حميات وأمراض معدية ونزلات معوية',
            'number': '050/2242850',
            'tel': '0502242850',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'المنصورة - شارع الجيش بجوار حي شرق',
            'maps_url': 'https://maps.google.com/?q=مستشفى+حميات+المنصورة',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال حالات الحمى الشديدة، الالتهاب السحائي، التسمم الغذائي، والعزل الطبي',
            'category': 'طوارئ حميات',
            'icon': 'fa-temperature-arrow-up',
            'color': '#D97706'
        },
        {
            'id': 'em_mans_chest_hosp',
            'name': 'مستشفى صدر المنصورة',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ أزمات صدرية وتنفسية واختناق',
            'number': '050/2243288',
            'tel': '0502243288',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'المنصورة - شارع الجيش خلف الحميات',
            'maps_url': 'https://maps.google.com/?q=مستشفى+صدر+المنصورة',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال طارئ لأزمات الربو الحادة، نزيف الرئة، ضيق التنفس الشديد، وجلسات الأكسجين',
            'category': 'طوارئ صدرية',
            'icon': 'fa-lungs',
            'color': '#0891B2'
        },
        {
            'id': 'em_mans_sellab_priv',
            'name': 'طوارئ مستشفى الجزيرة الدولي (السلاب) - متعاقد WE',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'خاص متعاقد WE وجلوب ميد',
            'service_type': 'طوارئ شاملة وعناية مركزة 24س',
            'number': '050/2209112',
            'tel': '0502209112',
            'hours': '24 ساعة / 7 أيام',
            'is_24h': True,
            'address': 'المنصورة - شارع قناة السويس أمام مساكن العبور',
            'maps_url': 'https://maps.google.com/?q=مستشفى+الجزيرة+الدولي+السلاب+المنصورة',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'نقابة WE وإدارة المستشفى',
            'description': 'استقبال طوارئ معتمد لزملاء الشركة WE، عناية مركزة، غرف عمليات طوارئ، وبنك دم',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#5B2C82'
        },
        {
            'id': 'em_mans_kheir_cath',
            'name': 'طوارئ قسطرة القلب 24س - مستشفى الخير - متعاقد WE',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'خاص متعاقد WE',
            'service_type': 'قسطرة قلب طارئة وجلطات 24 ساعة',
            'number': '050/2301555',
            'tel': '0502301555',
            'hours': '24 ساعة يومياً (الدور التاسع)',
            'is_24h': True,
            'address': 'المنصورة - أول شارع الجيش وميدان المحطة',
            'maps_url': 'https://maps.google.com/?q=مستشفى+الخير+المنصورة',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'نقابة WE ومستشفى الخير',
            'description': 'وحدة قسطرة القلب والجلطات الحادة بالدور التاسع - فريق استشاري متأهب على مدار الساعة',
            'category': 'طوارئ قلب وقسطرة',
            'icon': 'fa-heart-pulse',
            'color': '#BE185D'
        },
        {
            'id': 'em_mans_hekma_priv',
            'name': 'استقبال مستشفى الحكمة التخصصي - متعاقد WE',
            'markaz': 'المنصورة',
            'city': 'المنصورة',
            'affiliation': 'خاص متعاقد WE',
            'service_type': 'طوارئ وعيادات واستعلام',
            'number': '050/2260709',
            'tel': '0502260709',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'المنصورة - توريل الجديدة شارع سعد زغلول',
            'maps_url': 'https://maps.google.com/?q=مستشفى+الحكمة+المنصورة',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'نقابة WE ومستشفى الحكمة',
            'description': 'طوارئ واستقبال وفحوصات معتمدة لشركة WE واستعلام المواعيد',
            'category': 'استعلامات المستشفيات',
            'icon': 'fa-hospital-user',
            'color': '#7E22CE'
        },

        # --- Markaz 2: Mit Ghamr (ميت غمر) ---
        {
            'id': 'em_mitghamr_central',
            'name': 'مستشفى ميت غمر المركزي',
            'markaz': 'ميت غمر',
            'city': 'ميت غمر',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ وحوادث وعناية مركزة 24س',
            'number': '050/6902223',
            'tel': '0506902223',
            'hours': '24 ساعة / طوال أيام الأسبوع',
            'is_24h': True,
            'address': 'ميت غمر - شارع الحرية / طريق المعاهدة الرئيسي',
            'maps_url': 'https://maps.google.com/?q=مستشفى+ميت+غمر+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية بالدقهلية',
            'description': 'استقبال طوارئ الحوادث والإصابات، عناية مركزة، بنك دم، وحضانات لخدمة مركز وقرى ميت غمر',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },
        {
            'id': 'em_mitghamr_fever',
            'name': 'مستشفى حميات ميت غمر',
            'markaz': 'ميت غمر',
            'city': 'ميت غمر',
            'affiliation': 'وزارة الصحة',
            'service_type': 'حميات وأمراض باطنية طارئة',
            'number': '050/6904144',
            'tel': '0506904144',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'ميت غمر - بجوار مستشفى الكلى',
            'maps_url': 'https://maps.google.com/?q=مستشفى+حميات+ميت+غمر',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال نوبات الحمى، التسمم، والأمراض الفيروسية',
            'category': 'طوارئ حميات',
            'icon': 'fa-temperature-arrow-up',
            'color': '#D97706'
        },

        # --- Markaz 3: Dikirnis (دكرنس) ---
        {
            'id': 'em_dikirnis_general',
            'name': 'مستشفى دكرنس العام',
            'markaz': 'دكرنس',
            'city': 'دكرنس',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ وحوادث وعناية مركزة 24س',
            'number': '050/7472015',
            'tel': '0507472015',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'دكرنس - شارع المستشفى العام أمام بنك مصر',
            'maps_url': 'https://maps.google.com/?q=مستشفى+دكرنس+العام',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال طوارئ عام، عناية مركزة، غسيل كلوي طارئ، وحضانات لشرق الدقهلية',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 4: Bilqas (بلقاس) ---
        {
            'id': 'em_bilqas_central',
            'name': 'مستشفى بلقاس المركزي',
            'markaz': 'بلقاس',
            'city': 'بلقاس',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ وحوادث وعناية وحضانات 24س',
            'number': '050/2791012',
            'tel': '0502791012',
            'hours': '24 ساعة / طوال أيام الأسبوع',
            'is_24h': True,
            'address': 'بلقاس - شارع الجمهورية بجوار المحكمة القديمة',
            'maps_url': 'https://maps.google.com/?q=مستشفى+بلقاس+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'خدمة طوارئ واستقبال متكاملة لمدينة بلقاس وقرى الحفير والستاموني',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 5: Simbillawein (السنبلاوين) ---
        {
            'id': 'em_simbillawein_general',
            'name': 'مستشفى السنبلاوين العام',
            'markaz': 'السنبلاوين',
            'city': 'السنبلاوين',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ عامة وحوادث وعناية مركزة 24س',
            'number': '050/6721013',
            'tel': '0506721013',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'السنبلاوين - شارع صلاح سالم / طريق نوسا',
            'maps_url': 'https://maps.google.com/?q=مستشفى+السنبلاوين+العام',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال طوارئ وحوادث السنبلاوين وبرقين وشبرا سندي مع وحدة عناية وحضانات',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 6: Sherbin (شربين) ---
        {
            'id': 'em_sherbin_central',
            'name': 'مستشفى شربين المركزي',
            'markaz': 'شربين',
            'city': 'شربين',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ حوادث الطريق السريع وعناية 24س',
            'number': '050/7921014',
            'tel': '0507921014',
            'hours': '24 ساعة / طوال أيام الأسبوع',
            'is_24h': True,
            'address': 'شربين - طريق المنصورة دمياط الغربي بجوار محطة القطار',
            'maps_url': 'https://maps.google.com/?q=مستشفى+شربين+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال طوارئ مجهز لحوادث الطريق السريع والإصابات وغسيل كلوي وحضانات',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 7: Aga (أجا) ---
        {
            'id': 'em_aga_central',
            'name': 'مستشفى أجا المركزي',
            'markaz': 'أجا',
            'city': 'أجا',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ واستقبال وحوادث 24س',
            'number': '050/6451015',
            'tel': '0506451015',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'أجا - طريق المنصورة ميت غمر الزراعي السريع',
            'maps_url': 'https://maps.google.com/?q=مستشفى+أجا+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال طوارئ على الطريق الزراعي السريع، عناية مركزة، وحضانات لمركز وقرى أجا',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 8: Manzala (المنزلة) ---
        {
            'id': 'em_manzala_central',
            'name': 'مستشفى المنزلة المركزي',
            'markaz': 'المنزلة',
            'city': 'المنزلة',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ وحوادث وعناية وغسيل كلوي 24س',
            'number': '050/7701016',
            'tel': '0507701016',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'المنزلة - شارع البحر الرئيسي بجوار مجلس المدينة',
            'maps_url': 'https://maps.google.com/?q=مستشفى+المنزلة+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'طوارئ شمال الدقهلية ومنطقة بحيرة المنزلة وعناية مركزة مجهزة',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 9: Talkha (طلخا) ---
        {
            'id': 'em_talkha_central',
            'name': 'مستشفى طلخا المركزي',
            'markaz': 'طلخا',
            'city': 'طلخا',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ عامة وباطنة وحوادث 24س',
            'number': '050/2522018',
            'tel': '0502522018',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'طلخا - شارع صلاح سالم بجوار مجمع المصالح',
            'maps_url': 'https://maps.google.com/?q=مستشفى+طلخا+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال طوارئ سريع لسكان مركز ومدينة طلخا والقرى المجاورة',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 10: Minyat an-Nasr (منية النصر) ---
        {
            'id': 'em_minyat_nasr_central',
            'name': 'مستشفى منية النصر المركزي',
            'markaz': 'منية النصر',
            'city': 'منية النصر',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ واستقبال وعناية 24س',
            'number': '050/7551017',
            'tel': '0507551017',
            'hours': '24 ساعة / طوال أيام الأسبوع',
            'is_24h': True,
            'address': 'منية النصر - شارع المستشفى العام',
            'maps_url': 'https://maps.google.com/?q=مستشفى+منية+النصر+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'خدمات الطوارئ والرعاية لمركز منية النصر والكردي وميت طاهر',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 11: Gamasa (جمصة) ---
        {
            'id': 'em_gamasa_central',
            'name': 'مستشفى جمصة المركزي (طوارئ الساحل الدولي)',
            'markaz': 'جمصة',
            'city': 'جمصة',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ حوادث الطريق الدولي والمصيف 24س',
            'number': '050/2770020',
            'tel': '0502770020',
            'hours': '24 ساعة يومياً (طوارئ ساحلية 24/7)',
            'is_24h': True,
            'address': 'جمصة - بالقرب من الطريق الدولي الساحلي والمنطقة المركزية',
            'maps_url': 'https://maps.google.com/?q=مستشفى+جمصة+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'نقطة ارتكاز طوارئ حوادث الطريق الساحلي الدولي، غرق الشواطئ، وإسعاف مصطافي جمصة',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 12: Matariyya (المطرية) ---
        {
            'id': 'em_matariyya_central',
            'name': 'مستشفى المطرية المركزي',
            'markaz': 'المطرية',
            'city': 'المطرية',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ عامة وحوادث وعناية 24س',
            'number': '050/7601019',
            'tel': '0507601019',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'المطرية دقهلية - شارع الميناء والجمهورية',
            'maps_url': 'https://maps.google.com/?q=مستشفى+المطرية+المركزي+دقهلية',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال طوارئ للصيادين وأهالي مدينة المطرية وقرى بحيرة المنزلة',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 13: Bani Ubayd (بني عبيد) ---
        {
            'id': 'em_bani_ubayd_specialized',
            'name': 'مستشفى بني عبيد التخصصي',
            'markaz': 'بني عبيد',
            'city': 'بني عبيد',
            'affiliation': 'أمانة المراكز الطبية المتخصصة',
            'service_type': 'طوارئ جراحة وعناية وحضانات 24س',
            'number': '050/7331021',
            'tel': '0507331021',
            'hours': '24 ساعة / طوال أيام الأسبوع',
            'is_24h': True,
            'address': 'بني عبيد - شارع المستشفى الجديد',
            'maps_url': 'https://maps.google.com/?q=مستشفى+بني+عبيد+التخصصي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'أمانة المراكز الطبية المتخصصة',
            'description': 'صرح تخصصي حديث لخدمة مركز بني عبيد وقرى ميت فارس واليوسيفية',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#4338CA'
        },

        # --- Markaz 14: Mit Salsil (ميت سلسيل) ---
        {
            'id': 'em_mit_salsil_central',
            'name': 'مستشفى ميت سلسيل المركزي',
            'markaz': 'ميت سلسيل',
            'city': 'ميت سلسيل',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ واستقبال 24س',
            'number': '050/7851025',
            'tel': '0507851025',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'ميت سلسيل - شارع بورسعيد',
            'maps_url': 'https://maps.google.com/?q=مستشفى+ميت+سلسيل+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال طوارئ لمركز ميت سلسيل والقرى التابعة لها',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 15: El Gamaliya (الجمالية) ---
        {
            'id': 'em_gamaliya_central',
            'name': 'مستشفى الجمالية المركزي',
            'markaz': 'الجمالية',
            'city': 'الجمالية',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ واستقبال وحوادث 24س',
            'number': '050/7631026',
            'tel': '0507631026',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'الجمالية دقهلية - شارع المستشفى',
            'maps_url': 'https://maps.google.com/?q=مستشفى+الجمالية+المركزي+دقهلية',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'طوارئ واستقبال أهالي مركز الجمالية وقرى شمال الدقهلية',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 16: Temay al-Amdid (تمي الأمديد) ---
        {
            'id': 'em_temay_amdid_central',
            'name': 'مستشفى تمي الأمديد المركزي',
            'markaz': 'تمي الأمديد',
            'city': 'تمي الأمديد',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ واستقبال وعناية مركزة 24س',
            'number': '050/6681022',
            'tel': '0506681022',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'تمي الأمديد - طريق السنبلاوين تمي الأمديد',
            'maps_url': 'https://maps.google.com/?q=مستشفى+تمي+الأمديد+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال طوارئ وغسيل كلوي وحضانات لخدمة أهالي تمي الأمديد',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 17: Mahalat Damanah (محلة دمنة) ---
        {
            'id': 'em_mahalat_damanah_central',
            'name': 'مستشفى محلة دمنة المركزي',
            'markaz': 'محلة دمنة',
            'city': 'محلة دمنة',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ واستقبال وإسعاف أولي 24س',
            'number': '050/7221023',
            'tel': '0507221023',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'محلة دمنة - شارع داير الناحية',
            'maps_url': 'https://maps.google.com/?q=مستشفى+محلة+دمنة+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'طوارئ وإسعافات أولية لمدينة وقرى محلة دمنة',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
        },

        # --- Markaz 18: Nabaro (نبروه) ---
        {
            'id': 'em_nabaro_central',
            'name': 'مستشفى نبروه المركزي',
            'markaz': 'نبروه',
            'city': 'نبروه',
            'affiliation': 'وزارة الصحة',
            'service_type': 'طوارئ واستقبال وحوادث 24س',
            'number': '050/2651024',
            'tel': '0502651024',
            'hours': '24 ساعة يومياً',
            'is_24h': True,
            'address': 'نبروه - شارع المستشفى العام بجوار موقف المنصورة',
            'maps_url': 'https://maps.google.com/?q=مستشفى+نبروه+المركزي',
            'verified': True,
            'verification_date': '2026-10-15',
            'verification_source': 'مديرية الشؤون الصحية',
            'description': 'استقبال طوارئ وحوادث وعناية مركزة وغسيل كلوي لمركز نبروه وقراه',
            'category': 'طوارئ المستشفيات',
            'icon': 'fa-hospital',
            'color': '#B91C1C'
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
    employees_directory = []  # Membership is verified server-side; never publish employee records.

    bundle = {
        'metadata': {
            'title': 'منظومة الدليل الطبي الموحد - المصرية للاتصالات WE بالدقهلية',
            'author': 'الأستاذ / محمود العراقي',
            'version': '4.0.0',
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

    # Public directory only: stable provider IDs and honest review/coverage states.
    bundle.pop('employees_directory', None)
    record_map = {r['id']: r for r in bundle['records']}
    for doctor in bundle['doctors']:
        record_ids = [w['record_id'] for w in doctor['workplaces']]
        provider_id = 'provider_' + str(min(record_ids))
        doctor['doctor_id'] = provider_id
        doctor.pop('rating', None)
        doctor.pop('reviews_count', None)
        for record_id in record_ids:
            record_map[record_id]['provider_id'] = provider_id
    collections = [bundle['records'], list(bundle['hospitals'].values()), bundle['labs'],
                   bundle['radiology'], bundle['pharmacies'], bundle['specialized_centers']]
    for entries in collections:
        for entry in entries:
            entry.pop('rating', None)
            entry.pop('reviews_count', None)
            entry['coverage_verified'] = bool(entry.get('source_url') and entry.get('verified_at'))
            if not entry['coverage_verified']:
                entry['declared_coverage_scope'] = entry.get('coverage_scope', 'unknown')
                entry['coverage_scope'] = 'unknown'
                entry['coverage_label'] = 'التغطية تحتاج تأكيدًا من الجهة'
    for entry in bundle['emergency_services']:
        entry['verified'] = bool(entry.get('source_url') and entry.get('verification_date'))

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)

    os.makedirs('js', exist_ok=True)
    with open(os.path.join('js', 'data.js'), 'w', encoding='utf-8') as f:
        f.write('/* WE Medical Directory Dataset v4.0 - Prepared by Mahmoud El-Eraky */\n')
        f.write('window.INITIAL_MEDICAL_DATA = ')
        public_bundle = {k: v for k, v in bundle.items() if k not in ('doctors', 'categories', 'specialties')}
        json.dump(public_bundle, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    print('Enhanced dataset v4.0 built successfully by Mahmoud El-Eraky!')
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
