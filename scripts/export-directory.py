"""Export merged public provider information only; no members, sessions or reviews."""
import argparse
import json
from pathlib import Path
import openpyxl
from import_staff import sheet
from staff_catalog import ROOT

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
data = json.loads((ROOT / 'data.json').read_text())
book = openpyxl.Workbook()
book.remove(book.active)
names = {'records':'الأطباء والمقار','hospitals':'المستشفيات','labs':'التحاليل','radiology':'الأشعة','pharmacies':'الصيدليات','specialized_centers':'المراكز المتخصصة'}
summary = []
for kind, title in names.items():
    entries = data[kind]
    if isinstance(entries, dict):
        entries = list(entries.values())
    rows = []
    for e in entries:
        c = e.get('contact_groups', {})
        rows.append([str(e['id']),e.get('provider_id',''),e.get('display_name') or e['name'],e.get('specialty') or e.get('category',''),e.get('governorate','الدقهلية'),e.get('markaz') or e.get('city',''),e.get('address',''),e.get('hospital') or e.get('contract_entity',''), '\n'.join(c.get('mobile',[])), '\n'.join(c.get('landline',[])), '\n'.join(c.get('shortcode',[])),e.get('schedule') or e.get('working_hours',''), e.get('maps_url',''),e.get('source_ref','سجل المستشفيات السابق'), 'تحتاج تأكيد الخدمة والشروط المالية'])
    sheet(book,title,['معرّف السجل','معرّف الطبيب الثابت','الاسم','التخصص أو النوع','المحافظة','المركز','العنوان','جهة التعاقد','محمول','أرضي','مختصر','المواعيد المسجلة','الخريطة','مرجع البيانات','حالة التغطية'],rows)
    summary.append([title,len(rows)])
sheet(book,'ملخص',['الفئة','عدد السجلات'],summary + [['بطاقات الطبيب والقسم',len({e['provider_id'] for e in data['records']})],['ملاحظة','هذه نسخة بيانات المستودع؛ تعديلات المدير المركزية لها أولوية ولا تُقرأ في هذا التصدير. الأرقام لم تُختبر بمكالمات.']])
output = Path(args.output)
output.parent.mkdir(parents=True,exist_ok=True)
book.save(output)
print('Merged provider workbook exported; no member or review data included.')
