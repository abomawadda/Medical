"""Reproducible, provider-only merge. Never connects to Firebase or membership data."""
import copy
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMPORT = ROOT / 'imports/staff-20261018.json'
KINDS = ['records', 'hospitals', 'labs', 'radiology', 'pharmacies', 'specialized_centers']


def normalize_contacts(values):
    result = subprocess.run(['node', str(ROOT / 'scripts/normalize-contacts.mjs')],
                            input=json.dumps(values, ensure_ascii=False), text=True,
                            capture_output=True, check=True)
    return json.loads(result.stdout)


def merge_staff_catalog(bundle):
    if not IMPORT.exists():
        return bundle
    imported = json.loads(IMPORT.read_text())
    hospitals = list(bundle['hospitals'].values()) if isinstance(bundle['hospitals'], dict) else bundle['hospitals']
    collections = {k: (hospitals if k == 'hospitals' else bundle[k]) for k in KINDS}
    hospital_networks = {'hosp_hekma': ['employee'], 'hosp_sellab': ['employee', 'family', 'retiree'], 'hosp_kheir': ['employee', 'family', 'retiree']}
    for kind, rows in collections.items():
        for entry in rows:
            entry.setdefault('country_code', 'EG')
            entry.setdefault('governorate_code', 'EG-DK')
            entry.setdefault('governorate', 'الدقهلية')
            linked = entry.get('contract_entity_id')
            if linked in hospital_networks:
                entry['network_members'] = hospital_networks[linked]
                entry['network_source'] = 'شرح إدارة النقابة — 18 أكتوبر 2026؛ تفاصيل الخدمة تحتاج التأكيد'
                entry['declared_coverage_scope'] = 'employee_only' if linked == 'hosp_hekma' else 'both'
            entry.setdefault('contract_type', 'direct_we' if linked == 'direct_we' else 'hospital')
    for item in imported['entries']:
        kind, entity = item['kind'], copy.deepcopy(item['entity'])
        rows = collections[kind]
        old = next((r for r in rows if str(r['id']) == str(entity['id'])), None)
        if old:
            # Known hospital aliases use their original IDs. Never rename review targets.
            relationships = {r['id']: r for r in old.get('contract_relationships', [])}
            relationships.update({r['id']: r for r in entity.get('contract_relationships', [])})
            networks = list(dict.fromkeys(old.get('network_members', []) + entity.get('network_members', [])))
            old.update(entity)
            if kind == 'hospitals':
                old['services'] = [s for s in old.get('services', []) if '050/' not in s]
            old['network_members'] = networks
            old['contract_relationships'] = list(relationships.values())
        else:
            rows.append(entity)
    # A single parser supplies every visible phone category, including legacy providers.
    entries = [r for rows in collections.values() for r in rows]
    raw_values = [r.get('raw_phone') if 'raw_phone' in r else ' - '.join(str(r.get(k) or '') for k in ['phone', 'hotline', 'phone_digits']) for r in entries]
    parsed = normalize_contacts(raw_values)
    for r, contact in zip(entries, parsed):
        r['contact_groups'] = {k: contact[k] for k in ['mobile', 'landline', 'shortcode']}
        if contact['invalid']:
            r['contact_review_required'] = True
        if 'raw_phone' in r:
            r['phones'] = [dict(display=n, digits=n, tel=n, is_mobile=(k == 'mobile')) for k in ['mobile', 'landline', 'shortcode'] for n in contact[k]]
    if isinstance(bundle['hospitals'], dict):
        bundle['hospitals'] = {r.get('short_name') or r['name']: r for r in hospitals}
    else:
        bundle['hospitals'] = hospitals
    for item in imported['entries']:
        r = item['entity']
        if item['kind'] == 'records' and not any(d['doctor_id'] == r['provider_id'] for d in bundle['doctors']):
            bundle['doctors'].append({'doctor_id': r['provider_id'], 'name': r['name'], 'display_name': r['display_name'], 'specialty': r['specialty'], 'workplaces': [{'record_id': r['id'], 'hospital': r['hospital'], 'address': r['address']}]})
    bundle['metadata'].update(total_records=len(bundle['records']), total_doctors=len(bundle['doctors']), total_hospitals=len(hospitals), staff_import=imported['summary'], active_governorate='EG-DK')
    existing_specialties = {s['name'] for s in bundle['specialties']}
    for r in bundle['records']:
        if r['specialty'] not in existing_specialties:
            bundle['specialties'].append({'name': r['specialty'], 'total_records': sum(x['specialty'] == r['specialty'] for x in bundle['records'])})
            existing_specialties.add(r['specialty'])
    bundle['metadata']['total_specialties'] = len(bundle['specialties'])
    return bundle
