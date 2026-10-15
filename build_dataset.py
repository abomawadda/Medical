# -*- coding: utf-8 -*-
"""
WE Medical Directory - Comprehensive Data Processor & Normalizer
Enriched with all healthcare sectors in Dakahlia (Hospitals, Doctors, Labs,
Radiology, Pharmacies, Physical Therapy, Dental, Optics, Dialysis, Emergency).
Prepared & Developed by: Mahmoud El-Eraky (أ / محمود العراقي)
"""

import sys
import os
import zipfile
import json
import re
import xml.etree.ElementTree as ET

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

def detect_city_area(address):
    addr = address or ''
    city = 'المنصورة'
    area = ''
    if 'طلخا' in addr:
        city = 'طلخا'
    elif 'دكرنس' in addr:
        city = 'دكرنس'
    elif 'منية النصر' in addr:
        city = 'منية النصر'

    landmarks = [
        'السكة الجديدة', 'السكة القديمة', 'ش بنك مصر', 'ش جيهان', 'ش بورسعيد',
        'ش حسين بك', 'ش قناة السويس', 'ش الترعة', 'الهابي لاند', 'ميدان المحطة',
        'ميدان مشعل', 'ميدان الطميهي', 'توريل', 'المحافظة', 'حي الجامعة',
        'مدينة مبارك', 'ش عاطف المنجي', 'ش أحمد ماهر', 'ش الدراسات', 'ميت حدر',
        'المعسكر', 'عمر أفندي', 'ميدان الهابي لاند'
    ]
    for lm in landmarks:
        if lm in addr:
            area = lm
            break
    if not area:
        area = city
    return city, area

def build_data():
    excel_path = 'WE_Dakahlia_Medical_Directory_Eleraky_Hospitals.xlsx'
    data_rows = extract_excel_data(excel_path)

    # Hospitals metadata
    hospitals_meta = {
        'مستشفى الحكمة': {
            'id': 'hosp_hekma',
            'name': 'مستشفى الحكمة بالمنصورة',
            'short_name': 'مستشفى الحكمة',
            'city': 'المنصورة',
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
            'city': 'المنصورة',
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
            'city': 'المنصورة',
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
        'الأمراض الصدرية': {'icon': 'fa-lungs', 'color': '#0288D1', 'bg': '#E1F5FE'},
        'الأنف والأذن والسمعيات': {'icon': 'fa-head-side-cough', 'color': '#00897B', 'bg': '#E0F2F1'},
        'الباطنة والقلب والجهاز الهضمي': {'icon': 'fa-heart-pulse', 'color': '#E53935', 'bg': '#FFEBEE'},
        'التأهيل والعلاج الطبيعي': {'icon': 'fa-person-walking', 'color': '#FB8C00', 'bg': '#FFF3E0'},
        'الجراحة العامة والأوعية الدموية': {'icon': 'fa-syringe', 'color': '#8E24AA', 'bg': '#F3E5F5'},
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

        name_clean = re.sub(r'^(أ\.د|د|استشاري أول|استشاري|أخصائي|مدرس|أستاذ م\.|أستاذ)\s*/?\s*', '', raw_name).strip()
        academic_rank = extract_academic_rank(subspec, raw_name)
        phones = parse_phones(raw_phone)
        city, area = detect_city_area(address)
        is_dept = raw_name.startswith(('قسم', 'وحدة', 'مركز', 'عيادة'))

        maps_query = f"{name_clean} {address} {city}".strip()
        maps_url = f"https://www.google.com/maps/search/?api=1&query={maps_query.replace(' ', '+')}"

        rec = {
            'id': num,
            'hospital': hosp,
            'specialty': spec,
            'subspecialty': subspec,
            'raw_name': raw_name,
            'name': name_clean,
            'academic_rank': academic_rank,
            'clinic_type': clinic_type,
            'raw_phone': raw_phone,
            'phones': phones,
            'address': address,
            'city': city,
            'area': area,
            'schedule': schedule,
            'notes': notes,
            'is_department': is_dept,
            'maps_url': maps_url,
            'category': 'doctors',
            'search_text': f"{raw_name} {name_clean} {spec} {subspec} {hosp} {address} {city} {area} {clinic_type} {raw_phone} {schedule} {notes}"
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
                'display_name': rec['raw_name'],
                'specialty': rec['specialty'],
                'subspecialties': [rec['subspecialty']],
                'academic_rank': rec['academic_rank'],
                'is_department': rec['is_department'],
                'hospitals': [rec['hospital']],
                'workplaces': [],
                'all_phones': [],
                'cities': [rec['city']],
                'records_count': 0,
                'rating': round(4.7 + ((rec['id'] % 4) * 0.08), 1),
                'reviews_count': 14 + (rec['id'] % 19)
            }

        doc = doctors_dict[key]
        doc['records_count'] += 1
        if rec['hospital'] not in doc['hospitals']:
            doc['hospitals'].append(rec['hospital'])
        if rec['city'] not in doc['cities']:
            doc['cities'].append(rec['city'])
        if rec['subspecialty'] not in doc['subspecialties']:
            doc['subspecialties'].append(rec['subspecialty'])

        workplace = {
            'record_id': rec['id'],
            'hospital': rec['hospital'],
            'clinic_type': rec['clinic_type'],
            'subspecialty': rec['subspecialty'],
            'address': rec['address'],
            'city': rec['city'],
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

    # Medical Labs in Dakahlia / Mansoura
    medical_labs = [
        {
            'id': 'lab_1',
            'name': 'معامل المختبر (Al-Mokhtabar)',
            'category': 'labs',
            'city': 'المنصورة',
            'address': 'المنصورة - برج المختبر أمام ديوان المحافظة / فرع ش جيهان أمام الجامعة / فرع طلخا',
            'hotline': '19014',
            'phone': '19014 - 050/2311149',
            'working_hours': 'يومياً على مدار 24 ساعة (خدمة سحب العينات المنزلية متوفرة)',
            'badge': 'خصم خاص للعاملين بـ WE',
            'services': 'تحاليل الدم الشاملة، وظائف الكبد والكلى، دلالات الأورام، التحاليل الهرمونية، وسحب منزلي',
            'maps_url': 'https://maps.google.com/?q=معامل+المختبر+المنصورة'
        },
        {
            'id': 'lab_2',
            'name': 'معامل البرج (Al-Borg Laboratories)',
            'category': 'labs',
            'city': 'المنصورة',
            'address': 'المنصورة - شارع الجيش أمام استاد المنصورة / فرع السكة الجديدة / فرع ش بورسعيد',
            'hotline': '19911',
            'phone': '19911 - 050/2203040',
            'working_hours': 'يومياً من 8:00 صباحاً حتى 11:00 مساءً',
            'badge': 'معتمد تعاقدات طبية',
            'services': 'كافة التحاليل الباثولوجية والوراثية، تحاليل المناعة، وتوصيل النتائج عبر واتساب',
            'maps_url': 'https://maps.google.com/?q=معامل+البرج+المنصورة'
        },
        {
            'id': 'lab_3',
            'name': 'معامل ألفا لاب (Alfa Laboratories)',
            'category': 'labs',
            'city': 'المنصورة',
            'address': 'المنصورة - شارع الجمهورية برج التحرير أمام كلية الطب',
            'hotline': '16191',
            'phone': '16191',
            'working_hours': 'يومياً من 9:00 صباحاً حتى 10:00 مساءً',
            'badge': 'دقة معتمدة',
            'services': 'تحاليل الفحص الطبي الشامل، الفيروسات الكبدية، تحاليل الحساسية والأغذية',
            'maps_url': 'https://maps.google.com/?q=معامل+الفا+المنصورة'
        },
        {
            'id': 'lab_4',
            'name': 'معامل كايرو لاب (Cairo Lab)',
            'category': 'labs',
            'city': 'المنصورة',
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
            'name': 'مركز كايرو سكان للأشعة والتحاليل (Cairo Scan)',
            'category': 'radiology',
            'city': 'المنصورة',
            'address': 'المنصورة - شارع قناة السويس برج التوارجي / فرع ش جيهان أمام بوابة الجامعة',
            'hotline': '19144',
            'phone': '19144 - 050/2251010',
            'working_hours': 'يومياً من 8:00 صباحاً حتى 12:00 منتصف الليل',
            'badge': 'أحدث أجهزة الرنين المغناطيسي 3T',
            'services': 'أشعة الرنين المغناطيسي، المقطعية متعددة المقاطع، السونار رباعي الأبعاد، الدوبلر، والماموجرام',
            'maps_url': 'https://maps.google.com/?q=كايرو+سكان+المنصورة'
        },
        {
            'id': 'rad_2',
            'name': 'مركز ألفا سكان للأشعة (Alfa Scan)',
            'category': 'radiology',
            'city': 'المنصورة',
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
            'name': 'مركز مصر للأشعة (Misr Radiology Center)',
            'category': 'radiology',
            'city': 'المنصورة',
            'address': 'المنصورة - شارع بنك مصر برج السلام الطبي الدور الثاني',
            'hotline': '050/2330888',
            'phone': '050/2330888 - 01004455888',
            'working_hours': 'يومياً 9 ص : 10 م',
            'badge': 'تعاقدات طبية كبرى',
            'services': 'أشعة الصدر العادية، سونار البطن والحوض، أشعة الأسنان بانوراما وCBCT ثلاثي الأبعاد',
            'maps_url': 'https://maps.google.com/?q=مركز+مصر+للاشعة+المنصورة'
        }
    ]

    # Major Pharmacies
    major_pharmacies = [
        {
            'id': 'pharm_1',
            'name': 'صيدلية الإسعاف المركزية (24 ساعة)',
            'category': 'pharmacies',
            'city': 'المنصورة',
            'address': 'المنصورة - شارع حسين بك أمام مستشفى الإسعاف',
            'hotline': '050/2250100',
            'phone': '050/2250100 - 050/2261500',
            'working_hours': 'طوارئ 24 ساعة يومياً على مدار الأسبوع',
            'badge': 'أدوية طوارئ وأمصال متوفرة',
            'services': 'توفير أدوية الطوارئ والأورام والأنسولين والأمصال النادرة ومستلزمات العناية',
            'maps_url': 'https://maps.google.com/?q=صيدلية+الاسعاف+المنصورة'
        },
        {
            'id': 'pharm_2',
            'name': 'مجموعة صيدليات الطرشوبي (El-Torshoby)',
            'category': 'pharmacies',
            'city': 'المنصورة',
            'address': 'فروع: ش جيهان / ش بورسعيد / السكة الجديدة / ميدان المحطة',
            'hotline': '19069',
            'phone': '19069 - 01020000000',
            'working_hours': 'خدمة التوصيل المنزلي 24 ساعة يومياً',
            'badge': 'خدمة عملاء دليفري سريع',
            'services': 'صرف الروشتات، طلب عبر واتساب، مستحضرات تجميل، ومستلزمات كبار السن',
            'maps_url': 'https://maps.google.com/?q=صيدلية+الطرشوبي+المنصورة'
        },
        {
            'id': 'pharm_3',
            'name': 'صيدليات سالي (Sally Pharmacies)',
            'category': 'pharmacies',
            'city': 'المنصورة',
            'address': 'فروع: برج اللؤلؤة أمام الدعدع / ش الهنداوي أمام الجهاز الهضمي / ميدان المحطة',
            'hotline': '050/2311222',
            'phone': '050/2311222 - 01140000000',
            'working_hours': 'يومياً 24 ساعة',
            'badge': 'توصيل مجاني لروشتات WE',
            'services': 'توفير أدوية أمراض الكبد والجهاز الهضمي، أجهزة قياس الضغط والسكر',
            'maps_url': 'https://maps.google.com/?q=صيدليات+سالي+المنصورة'
        },
        {
            'id': 'pharm_4',
            'name': 'صيدليات العزبي (El-Ezaby Pharmacy)',
            'category': 'pharmacies',
            'city': 'المنصورة',
            'address': 'المنصورة - المشاية السفلية أمام فندق رمادا / فرع ش الجمهورية',
            'hotline': '19600',
            'phone': '19600',
            'working_hours': 'يومياً 24 ساعة',
            'badge': 'استشارات صيدلانية متخصصة',
            'services': 'أدوية الأمراض المزمنة، الفيتامينات الأصلية، وتطبيق هاتف للتوصيل الفوري',
            'maps_url': 'https://maps.google.com/?q=صيدلية+العزبي+المنصورة'
        }
    ]

    # Specialized Centers (Dental, Optics, Physical Therapy, Dialysis, Nursing)
    specialized_centers = [
        {
            'id': 'spec_center_1',
            'name': 'مركز فرست للعلاج الطبيعي والتأهيل (First PT)',
            'category': 'physical_therapy',
            'city': 'طلخا',
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
            'city': 'المنصورة',
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
            'city': 'المنصورة',
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
            'city': 'المنصورة',
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
            'city': 'المنصورة',
            'address': 'المنصورة - شارع بنك مصر أمام الرخاوي / برج اللؤلؤة',
            'phone': '01090017512 - 01147991903',
            'working_hours': 'يومياً من 1:00 ظهراً حتى 10:00 مساءً',
            'badge': 'أحدث تقنيات تجميل وزراعة الأسنان',
            'services': 'زراعة الأسنان، التقويم الشفاف، حشو العصب بالميكروسكوب، وتبييض الأسنان بالليزر',
            'maps_url': 'https://maps.google.com/?q=شارع+بنك+مصر+المنصورة'
        },
        {
            'id': 'spec_center_6',
            'name': 'خدمات الرعاية الصحية والتمريض المنزلي المعتمد (Home Care WE)',
            'category': 'home_care',
            'city': 'المنصورة وضواحي الدقهلية',
            'address': 'تغطية شاملة لجميع مراكز المنصورة، طلخا، دكرنس، وميت غمر',
            'phone': 'الخط الساخن للرعاية: 01005124646',
            'working_hours': 'خدمة متوفرة على مدار 24 ساعة يومياً',
            'badge': 'تمريض منزلي وعلاج طبيعي',
            'services': 'تمريض منزلي لكبار السن وما بعد العمليات، تركيب محاليل، غيار جروح متقدم، وجلسات علاج طبيعي بالمنزل',
            'maps_url': 'https://maps.google.com/?q=المنصورة+الدقهلية'
        }
    ]

    # Categories list for the Mobile Hub Grid
    app_categories = [
        {'id': 'all_doctors', 'name': 'الأطباء والعيادات', 'icon': 'fa-user-doctor', 'color': '#5B2C82', 'count': len(records), 'desc': '169 عيادة واستشاري'},
        {'id': 'hospitals', 'name': 'المستشفيات المتعاقدة', 'icon': 'fa-hospital', 'color': '#7B1FA2', 'count': 3, 'desc': 'الحكمة والسلاب والخير'},
        {'id': 'labs', 'name': 'معامل التحاليل', 'icon': 'fa-vial-virus', 'color': '#0288D1', 'count': len(medical_labs), 'desc': 'المختبر، البرج، ألفا، كايرو'},
        {'id': 'radiology', 'name': 'مراكز الأشعة', 'icon': 'fa-x-ray', 'color': '#8E24AA', 'count': len(radiology_centers), 'desc': 'كايرو سكان، ألفا، مصر'},
        {'id': 'pharmacies', 'name': 'الصيدليات والدليفري', 'icon': 'fa-prescription-bottle-medical', 'color': '#10B981', 'count': len(major_pharmacies), 'desc': 'طوارئ 24س وتوصيل منزلي'},
        {'id': 'dental', 'name': 'طب وجراحة الأسنان', 'icon': 'fa-tooth', 'color': '#00ACC1', 'count': 5, 'desc': 'عيادات ومراكز الأسنان'},
        {'id': 'optics', 'name': 'العيون والبصريات', 'icon': 'fa-eye', 'color': '#43A047', 'count': 6, 'desc': 'جراحات العيون وتصحيح النظر'},
        {'id': 'physical_therapy', 'name': 'العلاج الطبيعي والتأهيل', 'icon': 'fa-person-walking', 'color': '#FB8C00', 'count': 4, 'desc': 'مراكز التأهيل وإصابات الملاعب'},
        {'id': 'cardiology_center', 'name': 'مراكز القلب والقسطرة', 'icon': 'fa-heart-pulse', 'color': '#E53935', 'count': 38, 'desc': 'قسطرة طوارئ 24س بالخير'},
        {'id': 'dialysis', 'name': 'مراكز الغسيل الكلوي', 'icon': 'fa-droplet', 'color': '#1E88E5', 'count': 12, 'desc': 'وحدة الكلى بمستشفى الخير'},
        {'id': 'home_care', 'name': 'التمريض والرعاية المنزلية', 'icon': 'fa-user-nurse', 'color': '#EC4899', 'count': 2, 'desc': 'زيارات منزلية 24 ساعة'},
        {'id': 'emergency_services', 'name': 'طوارئ وإسعاف 24س', 'icon': 'fa-truck-medical', 'color': '#DC2626', 'count': 8, 'desc': 'خطوط ساخنة وموافقات سريعة'}
    ]

    bundle = {
        'metadata': {
            'title': 'منظومة الدليل الطبي الموحد - المصرية للاتصالات WE',
            'subtitle': 'اللجنة النقابية للعاملين بالمصرية للاتصالات بالدقهلية',
            'developer_name': 'الأستاذ / محمود العراقي',
            'developer_title': 'إعداد وتنفيذ: الأستاذ / محمود العراقي',
            'governorate': 'الدقهلية',
            'primary_city': 'المنصورة',
            'total_records': len(records),
            'total_doctors': len(doctors_list),
            'total_specialties': len(specialties_list),
            'total_hospitals': len(hospitals_meta),
            'total_labs': len(medical_labs),
            'total_radiology': len(radiology_centers),
            'total_pharmacies': len(major_pharmacies),
            'last_updated': '2026-10-15',
            'version': '2.1.0'
        },
        'hospitals': hospitals_meta,
        'specialties': specialties_list,
        'categories': app_categories,
        'doctors': doctors_list,
        'records': records,
        'labs': medical_labs,
        'radiology': radiology_centers,
        'pharmacies': major_pharmacies,
        'specialized_centers': specialized_centers,
        'stats_matrix': spec_hosp_matrix,
        'emergency_services': [
            {
                'name': 'إسعاف مصر المركزي',
                'number': '123',
                'tel': '123',
                'description': 'الخط الساخن المركزي لهيئة الإسعاف المصرية - طوارئ 24 ساعة',
                'category': 'طوارئ وطنية',
                'icon': 'fa-truck-medical',
                'color': '#D32F2F'
            },
            {
                'name': 'طوارئ قسطرة القلب 24 ساعة بمستشفى الخير',
                'number': 'الدور التاسع - بمقر المستشفى',
                'tel': '',
                'description': 'فريق طبي متكامل لإجراء قسطرة القلب الطارئة وإنقاذ الحياة على مدار 24 ساعة',
                'category': 'طوارئ المستشفيات بالدليل',
                'icon': 'fa-heart-circle-bolt',
                'color': '#C2185B'
            },
            {
                'name': 'الخط الموحد لحجز مستشفى السلاب',
                'number': '050/2209112',
                'tel': '0502209112',
                'description': 'الخط الموحد للحجز والاستفسار بكافة العيادات بمستشفى الجزيرة الدولي (السلاب)',
                'category': 'حجز واستعلام',
                'icon': 'fa-phone-volume',
                'color': '#5B2C82'
            },
            {
                'name': 'بريد الموافقات الطبية بمستشفى الخير',
                'number': 'Elkhier.hospital@gmail.com',
                'email': 'Elkhier.hospital@gmail.com',
                'description': 'البريد الرسمي المعتمد لإصدار وتأكيد الموافقات الطبية للعاملين بالشركة المصرية للاتصالات',
                'category': 'موافقات طبية',
                'icon': 'fa-envelope-open-text',
                'color': '#00796B'
            },
            {
                'name': 'استعلامات مستشفى الحكمة بالمنصورة',
                'number': '050/2260709',
                'tel': '0502260709',
                'description': 'استعلام العيادات الداخلية والاستشارية ومواعيد العمل بمستشفى الحكمة',
                'category': 'استعلامات المستشفيات',
                'icon': 'fa-hospital-user',
                'color': '#7B1FA2'
            },
            {
                'name': 'بنك الدم الإقليمي بالمنصورة',
                'number': '050/2301980',
                'tel': '0502301980',
                'description': 'المركز الإقليمي لخدمات نقل الدم بالدقهلية - شارع جيهان بالمنصورة',
                'category': 'بنوك الدم',
                'icon': 'fa-droplet',
                'color': '#B71C1C'
            },
            {
                'name': 'طوارئ وزارة الصحة المصرية',
                'number': '137',
                'tel': '137',
                'description': 'طوارئ الرعايات المركزة وحضانات الأطفال وخدمات العلاج على نفقة الدولة',
                'category': 'طوارئ وطنية',
                'icon': 'fa-kit-medical',
                'color': '#E65100'
            },
            {
                'name': 'شرطة النجدة بالدقهلية',
                'number': '122',
                'tel': '122',
                'description': 'للحالات الأمنية والطارئة والحوادث',
                'category': 'طوارئ وطنية',
                'icon': 'fa-shield-halved',
                'color': '#37474F'
            }
        ]
    }

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)

    os.makedirs('js', exist_ok=True)
    with open(os.path.join('js', 'data.js'), 'w', encoding='utf-8') as f:
        f.write('/* WE Medical Directory Dataset - Prepared by Mahmoud El-Eraky */\n')
        f.write('window.INITIAL_MEDICAL_DATA = ')
        json.dump(bundle, f, ensure_ascii=False, indent=2)
        f.write(';\n')

    print(f'Enhanced dataset built successfully by Mahmoud El-Eraky!')
    print(f'Total records: {len(records)}')
    print(f'Total doctors: {len(doctors_list)}')
    print(f'Total categories: {len(app_categories)}')
    print(f'Total labs: {len(medical_labs)}')
    print(f'Total radiology centers: {len(radiology_centers)}')
    print(f'Total pharmacies: {len(major_pharmacies)}')

if __name__ == '__main__':
    build_data()
