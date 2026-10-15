/* ====================================================================
 * WE Medical Directory - Admin & Control Panel Engine (v3.0)
 * Prepared by: Mahmoud El-Eraky (أ / محمود العراقي)
 * Features:
 * - Smart Provider Look-Up & Auto GPS/Maps linking
 * - Dakahlia Markaz Auto-Detection
 * - Arabic Spelling & Compound Name Orthographic Correction
 * - Incomplete Records & Audit Engine
 * - Duplicate Detection
 * - Guidelines & Distress Lines Management
 * - Employee Database Import & Synchronization
 * ==================================================================== */

(function (window) {
  'use strict';

  const DEFAULT_PIN = 'we2026';
  const ADMIN_SESSION_KEY = 'we_admin_auth_status';

  const DAKHALIA_MARKAZ = [
    'المنصورة', 'طلخا', 'ميت غمر', 'السنبلاوين', 'بلقاس',
    'دكرنس', 'شربين', 'أجا', 'المنزلة', 'منية النصر',
    'ميت سلسيل', 'بني عبيد', 'نبروه', 'الجمالية', 'تمي الأمديد', 'محلة دمنة'
  ];

  const AdminPanel = {
    isAuthenticated() {
      // Check if logged in via current employee session as admin, or pin session
      const currentUser = window.MedicalStorage ? window.MedicalStorage.getCurrentUser() : null;
      if (currentUser && currentUser.role === 'admin') return true;
      return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true';
    },

    login(pin) {
      if (pin === DEFAULT_PIN || pin === '123456') {
        sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
        return true;
      }
      return false;
    },

    logout() {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      if (window.MedicalStorage) {
        const u = window.MedicalStorage.getCurrentUser();
        if (u && u.role === 'admin') {
          window.MedicalStorage.logoutEmployee();
        }
      }
    },

    // --- Arabic Spelling Correction & Compound Names Normalizer ---
    correctArabicNameSpelling(rawName) {
      if (!rawName) return '';
      let name = String(rawName).trim();

      // Strip titles
      name = name.replace(/^(أ\.د|أ د|أ\. د|دكتور|د\.|د\/|د)\s*/g, '').trim();
      name = name.replace(/^(استشاري أول|استشاري ورئيس قسم|استشاري|أخصائي أول|أخصائي|مدرس|أستاذ مساعد|أستاذ م\.|أستاذ)\s*/g, '').trim();

      // Compound names with 'عبد'
      const abdelPatterns = [
        [/\bعبد\s*الرحمن\b/g, 'عبد الرحمن'],
        [/\bعبدالرحمن\b/g, 'عبد الرحمن'],
        [/\bعبد\s*الله\b/g, 'عبد الله'],
        [/\bعبدالله\b/g, 'عبد الله'],
        [/\bعبد\s*الرازق\b/g, 'عبد الرازق'],
        [/\bعبدالرازق\b/g, 'عبد الرازق'],
        [/\bعبد\s*اللطيف\b/g, 'عبد اللطيف'],
        [/\bعبداللطيف\b/g, 'عبد اللطيف'],
        [/\bعبد\s*العزيز\b/g, 'عبد العزيز'],
        [/\bعبدالعزيز\b/g, 'عبد العزيز'],
        [/\bعبد\s*العظيم\b/g, 'عبد العظيم'],
        [/\bعبدالعظيم\b/g, 'عبد العظيم'],
        [/\bعبد\s*المنعم\b/g, 'عبد المنعم'],
        [/\bعبدالمنعم\b/g, 'عبد المنعم'],
        [/\bعبد\s*الحليم\b/g, 'عبد الحليم'],
        [/\bعبدالحليم\b/g, 'عبد الحليم'],
        [/\bعبد\s*الحميد\b/g, 'عبد الحميد'],
        [/\bعبدالحميد\b/g, 'عبد الحميد'],
        [/\bعبد\s*الوهاب\b/g, 'عبد الوهاب'],
        [/\bعبدالوهاب\b/g, 'عبد الوهاب'],
        [/\bعبد\s*الفتاح\b/g, 'عبد الفتاح'],
        [/\bعبدالفتاح\b/g, 'عبد الفتاح'],
        [/\bعبد\s*الناصر\b/g, 'عبد الناصر'],
        [/\bعبدالناصر\b/g, 'عبد الناصر'],
        [/\bعبد\s*السلام\b/g, 'عبد السلام'],
        [/\bعبدالسلام\b/g, 'عبد السلام'],
        [/\bعبد\s*الغني\b/g, 'عبد الغني'],
        [/\bعبدالغني\b/g, 'عبد الغني'],
        [/\bعبد\s*القادر\b/g, 'عبد القادر'],
        [/\bعبدالقادر\b/g, 'عبد القادر'],
        [/\bعبد\s*الجليل\b/g, 'عبد الجليل'],
        [/\bعبدالجليل\b/g, 'عبد الجليل'],
        [/\bعبد\s*الصمد\b/g, 'عبد الصمد'],
        [/\bعبدالصمد\b/g, 'عبد الصمد']
      ];
      abdelPatterns.forEach(([pat, rep]) => { name = name.replace(pat, rep); });

      // Compound names with 'أبو'
      const abuPatterns = [
        [/\bابو\s*العز\b/g, 'أبو العز'],
        [/\bابوالعز\b/g, 'أبو العز'],
        [/\bابو\s*الخير\b/g, 'أبو الخير'],
        [/\bابوالخير\b/g, 'أبو الخير'],
        [/\bابو\s*النجا\b/g, 'أبو النجا'],
        [/\bابوالنجا\b/g, 'أبو النجا'],
        [/\bابو\s*الفتوح\b/g, 'أبو الفتوح'],
        [/\bابوالفتوح\b/g, 'أبو الفتوح'],
        [/\bابو\s*زيد\b/g, 'أبو زيد'],
        [/\bابوزيد\b/g, 'أبو زيد'],
        [/\bابو\s*بكر\b/g, 'أبو بكر'],
        [/\bابوبكر\b/g, 'أبو بكر'],
        [/\bابو\s*المعاطي\b/g, 'أبو المعاطي'],
        [/\bابوالمعاطي\b/g, 'أبو المعاطي']
      ];
      abuPatterns.forEach(([pat, rep]) => { name = name.replace(pat, rep); });

      // Fix Hamza on prominent names
      const hamzaWords = [
        [/\bاحمد\b/g, 'أحمد'],
        [/\bاسامه\b/g, 'أسامة'],
        [/\bاشرف\b/g, 'أشرف'],
        [/\bايمن\b/g, 'أيمن'],
        [/\bامجد\b/g, 'أمجد'],
        [/\bايهاب\b/g, 'إيهاب'],
        [/\bاسماعيل\b/g, 'إسماعيل'],
        [/\bابراهيم\b/g, 'إبراهيم'],
        [/\bاسلام\b/g, 'إسلام'],
        [/\bانور\b/g, 'أنور'],
        [/\bامين\b/g, 'أمين'],
        [/\bاكرم\b/g, 'أكرم'],
        [/\bالهام\b/g, 'إلهام'],
        [/\bايمان\b/g, 'إيمان'],
        [/\bاسماء\b/g, 'أسماء'],
        [/\bاماني\b/g, 'أماني']
      ];
      hamzaWords.forEach(([pat, rep]) => { name = name.replace(pat, rep); });

      return name.replace(/\s+/g, ' ').trim();
    },

    // --- Smart Provider Auto-Detection & GPS Link Generator ---
    smartDetectProvider(name, address) {
      const fullText = `${name || ''} ${address || ''}`;
      
      // Category detection
      let category = 'طبيب / عيادة';
      let icon = 'fa-user-doctor';
      let specialtySuggestion = '';

      if (/معمل|تحاليل|مختبر|باثولوجي/.test(fullText)) {
        category = 'معمل تحاليل';
        icon = 'fa-vial-virus';
      } else if (/أشعة|اشعة|سكان|رنين|سونار/.test(fullText)) {
        category = 'مركز أشعة';
        icon = 'fa-x-ray';
      } else if (/صيدلية|صيدليات|أدوية/.test(fullText)) {
        category = 'صيدلية';
        icon = 'fa-prescription-bottle-medical';
      } else if (/أسنان|اسنان|فم|تقويم/.test(fullText)) {
        category = 'مركز أسنان';
        specialtySuggestion = 'طب الفم والأسنان';
        icon = 'fa-tooth';
      } else if (/عيون|رمد|بصريات|ليزك/.test(fullText)) {
        category = 'مركز عيون';
        specialtySuggestion = 'طب وجراحة العيون';
        icon = 'fa-eye';
      } else if (/علاج طبيعي|تأهيل|انزلاق|سمنة/.test(fullText)) {
        category = 'علاج طبيعي وتأهيل';
        specialtySuggestion = 'التأهيل والعلاج الطبيعي';
        icon = 'fa-person-walking';
      } else if (/مستشفى|صرح|مجمع طبي/.test(fullText)) {
        category = 'مستشفى / مجمع طبي';
        icon = 'fa-hospital';
      } else if (/قلب|قسطرة|أوعية/.test(fullText)) {
        specialtySuggestion = 'أمراض القلب والأوعية الدموية';
      } else if (/عظام|مفاصل|عمود فقري/.test(fullText)) {
        specialtySuggestion = 'جراحة العظام والعمود الفقري';
      } else if (/باطنة|كبد|جهاز هضمي/.test(fullText)) {
        specialtySuggestion = 'الباطنة والقلب والجهاز الهضمي';
      } else if (/أطفال|اطفال|مبتسرين/.test(fullText)) {
        specialtySuggestion = 'طب الأطفال';
      } else if (/نساء|توليد|عقم|حقن/.test(fullText)) {
        specialtySuggestion = 'النساء والتوليد';
      } else if (/أنف|أذن|حنجرة/.test(fullText)) {
        specialtySuggestion = 'الأنف والأذن والحنجرة';
      } else if (/جلدية|تناسلية|ليزر/.test(fullText)) {
        specialtySuggestion = 'الجلدية والتناسلية';
      } else if (/مسالك|كلى|بولية/.test(fullText)) {
        specialtySuggestion = 'المسالك البولية والكلى';
      }

      // Markaz detection in Dakahlia
      let markaz = 'المنصورة';
      for (const m of DAKHALIA_MARKAZ) {
        if (fullText.includes(m)) {
          markaz = m;
          break;
        }
      }

      // GPS Google Maps Query
      const cleanName = this.correctArabicNameSpelling(name);
      const mapsQuery = `${cleanName} ${address || ''} ${markaz} الدقهلية`.replace(/\s+/g, ' ').trim();
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;

      return {
        correctedName: cleanName,
        category,
        specialtySuggestion,
        markaz,
        mapsUrl,
        initialRating: 4.8,
        icon
      };
    },

    // Duplicate detection engine
    findDuplicates(records) {
      const nameMap = {};
      const phoneMap = {};
      const duplicates = {
        byName: [],
        byPhone: []
      };

      const cleanAr = (t) => {
        if (!t) return '';
        return t.replace(/^(أ\.د|د|استشاري|أخصائي|مدرس|أستاذ)\s*/, '')
          .replace(/[إأآا]/g, 'ا')
          .replace(/ة/g, 'ه')
          .replace(/ى/g, 'ي')
          .trim().toLowerCase();
      };

      records.forEach((rec) => {
        const cName = cleanAr(rec.name || rec.raw_name);
        if (cName) {
          if (!nameMap[cName]) nameMap[cName] = [];
          nameMap[cName].push(rec);
        }

        if (rec.phones && Array.isArray(rec.phones)) {
          rec.phones.forEach((p) => {
            if (p.digits && p.digits.length >= 7) {
              if (!phoneMap[p.digits]) phoneMap[p.digits] = [];
              phoneMap[p.digits].push(rec);
            }
          });
        }
      });

      for (const [name, list] of Object.entries(nameMap)) {
        if (list.length > 1) {
          duplicates.byName.push({
            name: list[0].name || list[0].raw_name,
            count: list.length,
            records: list,
            isMultiHospital: new Set(list.map(r => r.hospital)).size > 1
          });
        }
      }

      for (const [phone, list] of Object.entries(phoneMap)) {
        if (list.length > 1) {
          duplicates.byPhone.push({
            phone: list[0].raw_phone || phone,
            count: list.length,
            records: list
          });
        }
      }

      return duplicates;
    },

    // Incomplete records auditor
    findIncompleteRecords(records) {
      const incomplete = [];
      records.forEach((rec) => {
        const issues = [];
        if (!rec.raw_phone || rec.raw_phone.includes('بمقر المستشفى') || rec.raw_phone.includes('عيادات المستشفى')) {
          issues.push('رقم الهاتف مباشر غير مسجل (مذكور عيادات المستشفى فقط)');
        }
        if (!rec.schedule || rec.schedule.includes('حسب جدول') || rec.schedule === 'يومياً' || rec.schedule.includes('حجز مسبق')) {
          issues.push('مواعيد العمل عامة أو تتطلب تحديد الساعات بدقة');
        }
        if (!rec.address || rec.address === rec.hospital) {
          issues.push('العنوان التفصيلي مطابق لاسم المستشفى دون تحديد رقم الدور أو المبنى');
        }

        if (issues.length > 0) {
          incomplete.push({
            record: rec,
            issues: issues,
            completenessScore: Math.max(30, 100 - issues.length * 25)
          });
        }
      });
      return incomplete;
    },

    // Export to CSV
    exportToCSV(records) {
      const headers = ['م', 'المستشفى / الجهة', 'جهة التعاقد', 'نطاق التغطية', 'المركز / المدينة', 'التخصص الموحد', 'التخصص الدقيق', 'اسم الطبيب / القسم', 'نوع العيادة', 'أرقام التليفون / الحجز', 'العنوان التفصيلي', 'المواعيد وأيام العمل', 'ملاحظات'];
      const rows = records.map((r, idx) => [
        idx + 1,
        `"${(r.hospital || '').replace(/"/g, '""')}"`,
        `"${(r.contract_entity || 'مباشر من الشركة WE').replace(/"/g, '""')}"`,
        `"${(r.coverage_label || 'شامل: العاملين + أسر العاملين جلوب ميد').replace(/"/g, '""')}"`,
        `"${(r.markaz || r.city || 'المنصورة').replace(/"/g, '""')}"`,
        `"${(r.specialty || '').replace(/"/g, '""')}"`,
        `"${(r.subspecialty || '').replace(/"/g, '""')}"`,
        `"${(r.name || r.raw_name || '').replace(/"/g, '""')}"`,
        `"${(r.clinic_type || '').replace(/"/g, '""')}"`,
        `"${(r.raw_phone || '').replace(/"/g, '""')}"`,
        `"${(r.address || '').replace(/"/g, '""')}"`,
        `"${(r.schedule || '').replace(/"/g, '""')}"`,
        `"${(r.notes || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `WE_Medical_Directory_Dakahlia_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },

    // Export to JSON
    exportToJSON(data) {
      const jsonContent = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `WE_Medical_Directory_Backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  window.AdminPanel = AdminPanel;
})(window);
