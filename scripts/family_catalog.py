"""Idempotent family-network seed merge, preserving all existing review identities."""
import copy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
IMPORT=ROOT/'imports/family-20261018.json'

def merge_family_catalog(bundle):
    if not IMPORT.exists():return bundle
    imported=json.loads(IMPORT.read_text())
    hospital_dict=isinstance(bundle['hospitals'],dict)
    if hospital_dict:bundle['hospitals']=list(bundle['hospitals'].values())
    for item in imported['entries']:
        kind=item['kind'];entity=copy.deepcopy(item['entity']);target=item['merge_target']
        old=next((r for r in bundle[kind]if str(r['id'])==str(entity['id'])),None)
        if target:
            if old is None:raise ValueError('Missing shared family target '+str(target))
            # Keep existing names, employee contact/address, photos and review IDs.
            old['network_members']=list(dict.fromkeys(old.get('network_members',[])+['family','retiree']))
            rels={r['id']:r for r in old.get('contract_relationships',[])}
            rels.update({r['id']:r for r in entity['contract_relationships']})
            old['contract_relationships']=list(rels.values())
        elif not old:bundle[kind].append(entity)
        elif old.get('source_ref')=='family-20261018':old.update(entity)
        else:raise ValueError('Unexpected family ID collision')
    docs={d['doctor_id']:d for d in bundle['doctors']}
    grouped={}
    for r in bundle['records']:grouped.setdefault(r['provider_id'],[]).append(r)
    for provider,rows in grouped.items():
        r=rows[0];d=docs.setdefault(provider,{'doctor_id':provider,'name':r['name'],'display_name':r.get('display_name',r['name']),'specialty':r['specialty']})
        prior={str(w['record_id']):w for w in d.get('workplaces',[])}
        d['workplaces']=[prior.get(str(r['id']),dict(record_id=r['id'],**{k:v for k,v in r.items()if k!='id'}))for r in rows]
        d['records_count']=len(rows)
    bundle['doctors']=list(docs.values())
    specialty={s['name']:s for s in bundle['specialties']}
    for r in bundle['records']:specialty.setdefault(r['specialty'],{'name':r['specialty']})
    for name,s in specialty.items():s['total_records']=sum(r['specialty']==name for r in bundle['records'])
    bundle['specialties']=list(specialty.values())
    bundle['metadata'].update(family_import=imported['summary'],total_records=len(bundle['records']),total_doctors=len(bundle['doctors']),total_hospitals=len(bundle['hospitals']),total_specialties=len(bundle['specialties']))
    if hospital_dict:bundle['hospitals']={r.get('short_name')or r['name']:r for r in bundle['hospitals']}
    return bundle
