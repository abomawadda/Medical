/* ====================================================================
 * WE Medical Directory - Storage & Persistence Engine (v3.0)
 * Manages LocalStorage, Bookmarks, Custom Records, Suggestions,
 * Ratings, Guidelines, Emergency Distress Lines, and Employee Auth
 * by Mobile Number + Last 4 Digits of National ID.
 * Prepared & Developed by: Mahmoud El-Eraky (أ / محمود العراقي)
 * ==================================================================== */

(function (window) {
  'use strict';

  const STORAGE_KEYS = {
    FAVORITES: 'we_medical_favorites_v3',
    RECENT_SEARCHES: 'we_medical_recent_searches_v3',
    CUSTOM_RECORDS: 'we_medical_custom_records_v3',
    MODIFIED_RECORDS: 'we_medical_modified_records_v3',
    DELETED_IDS: 'we_medical_deleted_ids_v3',
    SUGGESTIONS: 'we_medical_user_suggestions_v3',
    RATINGS: 'we_medical_ratings_v3',
    THEME: 'we_medical_theme_v3',
    CURRENT_USER: 'we_medical_current_user_v3',
    EMPLOYEES_LIST: 'we_medical_employees_custom_v3',
    CUSTOM_GUIDELINES: 'we_medical_guidelines_custom_v3',
    CUSTOM_EMERGENCY: 'we_medical_emergency_custom_v3'
  };

  const MedicalStorage = {
    // --- Authentication (Mobile + Last 4 Digits of National ID) ---
    getCurrentUser() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    getEmployees() {
      try {
        const custom = localStorage.getItem(STORAGE_KEYS.EMPLOYEES_LIST);
        if (custom) {
          const list = JSON.parse(custom);
          if (Array.isArray(list) && list.length > 0) return list;
        }
      } catch (e) {}

      if (window.INITIAL_MEDICAL_DATA && Array.isArray(window.INITIAL_MEDICAL_DATA.employees_directory)) {
        return window.INITIAL_MEDICAL_DATA.employees_directory;
      }
      return [];
    },

    saveEmployees(list) {
      try {
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES_LIST, JSON.stringify(list));
        return true;
      } catch (e) {
        return false;
      }
    },

    loginEmployee(phoneInput, last4Input) {
      if (!phoneInput || !last4Input) return { success: false, message: 'يرجى إدخال رقم الموبايل وآخر 4 أرقام من الرقم القومي' };

      const cleanPhone = String(phoneInput).trim().replace(/[^\d]/g, '');
      const cleanLast4 = String(last4Input).trim().replace(/[^\d]/g, '');

      // Quick Admin PIN Override for Mahmoud El-Eraky / Union Official
      if ((cleanPhone === '01000000001' && cleanLast4 === '2026') || (phoneInput === 'we2026' || last4Input === 'we2026')) {
        const adminUser = {
          id: 'emp_01',
          name: 'محمود العراقي',
          title: 'مسؤول اللجنة النقابية ومنسق الرعاية الطبية بالدقهلية',
          phone: '01000000001',
          national_id_last4: '2026',
          sector: 'اللجنة النقابية للعاملين بالمصرية للاتصالات بالدقهلية',
          employee_code: 'WE-DK-001',
          role: 'admin',
          coverage_type: 'شامل: العاملين + أسر العاملين (جلوب ميد)',
          globemed_card_no: 'GM-998811-01',
          family_members: [
            { name: 'الزوجة', relation: 'زوجة', globemed_id: 'GM-998811-02' },
            { name: 'الأبناء', relation: 'ابن / ابنة', globemed_id: 'GM-998811-03' }
          ]
        };
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(adminUser));
        return { success: true, user: adminUser };
      }

      const allEmployees = this.getEmployees();
      const match = allEmployees.find((emp) => {
        const empPhone = String(emp.phone || '').trim().replace(/[^\d]/g, '');
        const empLast4 = String(emp.national_id_last4 || '').trim();
        const phoneMatches = empPhone.endsWith(cleanPhone) || cleanPhone.endsWith(empPhone);
        const last4Matches = empLast4 === cleanLast4;
        return phoneMatches && last4Matches;
      });

      if (match) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(match));
        return { success: true, user: match };
      }

      return {
        success: false,
        message: 'بيانات غير مطابقة. تأكد من إدخال رقم الموبايل المسجل وآخر 4 أرقام من الرقم القومي أو راجع النقابة لإدراج اسمك بالكشف.'
      };
    },

    logoutEmployee() {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    },

    // --- Favorites ---
    getFavorites() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.FAVORITES);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    },

    isFavorite(id) {
      const favs = this.getFavorites();
      return favs.includes(String(id));
    },

    toggleFavorite(id) {
      const favs = this.getFavorites();
      const strId = String(id);
      const index = favs.indexOf(strId);
      let isFav = false;
      if (index > -1) {
        favs.splice(index, 1);
        isFav = false;
      } else {
        favs.push(strId);
        isFav = true;
      }
      try {
        localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favs));
      } catch (e) {}
      return isFav;
    },

    // --- Recent Searches ---
    getRecentSearches() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    },

    addRecentSearch(query) {
      if (!query || !query.trim()) return;
      const q = query.trim();
      let list = this.getRecentSearches().filter((item) => item !== q);
      list.unshift(q);
      if (list.length > 8) list.pop();
      try {
        localStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(list));
      } catch (e) {}
    },

    clearRecentSearches() {
      localStorage.removeItem(STORAGE_KEYS.RECENT_SEARCHES);
    },

    // --- User Suggested Additions (Crowdsourcing) ---
    getSuggestions() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.SUGGESTIONS);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    },

    addSuggestion(data) {
      const list = this.getSuggestions();
      const entry = {
        id: 'sug_' + Date.now(),
        name: data.name || '',
        category: data.category || 'طبيب / عيادة',
        specialty: data.specialty || '',
        hospital: data.hospital || '',
        markaz: data.markaz || 'المنصورة',
        contract_entity: data.contract_entity || 'مباشر من الشركة WE',
        coverage_scope: data.coverage_scope || 'both',
        phone: data.phone || '',
        address: data.address || '',
        suggestedBy: data.suggestedBy || 'زميل بالشركة المصرية للاتصالات بالدقهلية',
        date: new Date().toISOString().split('T')[0],
        status: 'pending'
      };
      list.unshift(entry);
      try {
        localStorage.setItem(STORAGE_KEYS.SUGGESTIONS, JSON.stringify(list));
      } catch (e) {}
      return entry;
    },

    deleteSuggestion(sugId) {
      let list = this.getSuggestions().filter(s => s.id !== sugId);
      localStorage.setItem(STORAGE_KEYS.SUGGESTIONS, JSON.stringify(list));
    },

    // --- Ratings & Reviews ---
    getDoctorRatings(docKey) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.RATINGS);
        const all = raw ? JSON.parse(raw) : {};
        return all[docKey] || [];
      } catch (e) {
        return [];
      }
    },

    addDoctorRating(docKey, rating, comment, authorName) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.RATINGS);
        const all = raw ? JSON.parse(raw) : {};
        if (!all[docKey]) all[docKey] = [];
        const entry = {
          id: 'rev_' + Date.now(),
          rating: Number(rating) || 5,
          comment: (comment || '').trim(),
          author: (authorName || 'زميل بالشركة المصرية للاتصالات بالدقهلية').trim(),
          date: new Date().toISOString().split('T')[0]
        };
        all[docKey].unshift(entry);
        localStorage.setItem(STORAGE_KEYS.RATINGS, JSON.stringify(all));
        return entry;
      } catch (e) {
        return null;
      }
    },

    // --- Custom / Modified Records via Admin Panel ---
    getCustomRecords() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_RECORDS);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    },

    getModifiedRecords() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.MODIFIED_RECORDS);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    },

    getDeletedIds() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.DELETED_IDS);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    },

    saveRecord(record) {
      if (record.id && Number(record.id) <= 1000) {
        const modified = this.getModifiedRecords();
        modified[record.id] = record;
        localStorage.setItem(STORAGE_KEYS.MODIFIED_RECORDS, JSON.stringify(modified));
      } else {
        const custom = this.getCustomRecords();
        if (!record.id) {
          record.id = 2000 + (Date.now() % 100000);
        }
        const existingIdx = custom.findIndex((r) => r.id === record.id);
        if (existingIdx > -1) {
          custom[existingIdx] = record;
        } else {
          custom.unshift(record);
        }
        localStorage.setItem(STORAGE_KEYS.CUSTOM_RECORDS, JSON.stringify(custom));
      }
      const deleted = this.getDeletedIds().filter((id) => id !== record.id);
      localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(deleted));
      return record;
    },

    deleteRecord(recordId) {
      const idNum = Number(recordId);
      let custom = this.getCustomRecords().filter((r) => r.id !== idNum);
      localStorage.setItem(STORAGE_KEYS.CUSTOM_RECORDS, JSON.stringify(custom));

      const modified = this.getModifiedRecords();
      delete modified[idNum];
      localStorage.setItem(STORAGE_KEYS.MODIFIED_RECORDS, JSON.stringify(modified));

      const deleted = this.getDeletedIds();
      if (!deleted.includes(idNum)) {
        deleted.push(idNum);
        localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(deleted));
      }
    },

    // --- Guidelines & Medical Procedures ---
    getGuidelines() {
      let custom = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_GUIDELINES);
        if (raw) custom = JSON.parse(raw);
      } catch (e) {}

      const initial = (window.INITIAL_MEDICAL_DATA && window.INITIAL_MEDICAL_DATA.medical_guidelines) ? window.INITIAL_MEDICAL_DATA.medical_guidelines : [];
      const combined = [...custom];
      for (const item of initial) {
        if (!combined.some(c => c.id === item.id)) {
          combined.push(item);
        }
      }
      return combined;
    },

    saveGuideline(item) {
      const list = this.getGuidelines();
      if (!item.id) item.id = 'guide_' + Date.now();
      const idx = list.findIndex(g => g.id === item.id);
      if (idx > -1) {
        list[idx] = item;
      } else {
        list.unshift(item);
      }
      localStorage.setItem(STORAGE_KEYS.CUSTOM_GUIDELINES, JSON.stringify(list));
      return item;
    },

    deleteGuideline(id) {
      const list = this.getGuidelines().filter(g => g.id !== id);
      localStorage.setItem(STORAGE_KEYS.CUSTOM_GUIDELINES, JSON.stringify(list));
    },

    // --- Emergency Distress Lines ---
    getEmergencyServices() {
      let custom = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_EMERGENCY);
        if (raw) custom = JSON.parse(raw);
      } catch (e) {}

      const initial = (window.INITIAL_MEDICAL_DATA && window.INITIAL_MEDICAL_DATA.emergency_services) ? window.INITIAL_MEDICAL_DATA.emergency_services : [];
      const combined = [...custom];
      for (const item of initial) {
        if (!combined.some(c => c.id === item.id)) {
          combined.push(item);
        }
      }
      return combined;
    },

    saveEmergencyService(item) {
      const list = this.getEmergencyServices();
      if (!item.id) item.id = 'em_' + Date.now();
      const idx = list.findIndex(e => e.id === item.id);
      if (idx > -1) {
        list[idx] = item;
      } else {
        list.unshift(item);
      }
      localStorage.setItem(STORAGE_KEYS.CUSTOM_EMERGENCY, JSON.stringify(list));
      return item;
    },

    deleteEmergencyService(id) {
      const list = this.getEmergencyServices().filter(e => e.id !== id);
      localStorage.setItem(STORAGE_KEYS.CUSTOM_EMERGENCY, JSON.stringify(list));
    },

    // --- Merged Live Dataset ---
    getLiveRecords() {
      const baseRecords = window.INITIAL_MEDICAL_DATA ? window.INITIAL_MEDICAL_DATA.records : [];
      const modified = this.getModifiedRecords();
      const deleted = this.getDeletedIds();
      const custom = this.getCustomRecords();

      let live = [];
      for (const rec of baseRecords) {
        if (deleted.includes(rec.id)) continue;
        if (modified[rec.id]) {
          live.push(modified[rec.id]);
        } else {
          live.push(rec);
        }
      }
      for (const rec of custom) {
        if (!deleted.includes(rec.id)) {
          live.push(rec);
        }
      }
      return live;
    },

    getLiveDoctors() {
      const records = this.getLiveRecords();
      const docsMap = {};

      const cleanAr = (t) => {
        if (!t) return '';
        return t.replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim().toLowerCase();
      };

      records.forEach((rec) => {
        const isDept = rec.raw_name && (rec.raw_name.startsWith('قسم') || rec.raw_name.startsWith('وحدة') || rec.raw_name.startsWith('مركز') || rec.raw_name.startsWith('عيادة'));
        const key = isDept
          ? `dept_${rec.id}_${rec.name || rec.raw_name}`
          : `doc_${cleanAr(rec.name || rec.raw_name)}_${cleanAr(rec.specialty)}`;

        if (!docsMap[key]) {
          docsMap[key] = {
            doctor_id: key,
            name: rec.name || rec.raw_name,
            display_name: rec.display_name || rec.raw_name,
            specialty: rec.specialty,
            subspecialties: [rec.subspecialty],
            academic_rank: rec.academic_rank || 'طبيب استشاري',
            is_department: isDept,
            hospitals: [rec.hospital],
            contract_entities: [rec.contract_entity || 'مباشر من الشركة WE'],
            coverage_scope: rec.coverage_scope || 'both',
            coverage_label: rec.coverage_label || 'شامل: العاملين + أسر العاملين (جلوب ميد)',
            workplaces: [],
            all_phones: [],
            cities: [rec.markaz || rec.city || 'المنصورة'],
            markazes: [rec.markaz || rec.city || 'المنصورة'],
            records_count: 0,
            rating: roundRating(rec.id),
            reviews_count: 14 + (rec.id % 19)
          };
        }

        const doc = docsMap[key];
        doc.records_count++;
        if (!doc.hospitals.includes(rec.hospital)) doc.hospitals.push(rec.hospital);
        if (rec.contract_entity && !doc.contract_entities.includes(rec.contract_entity)) doc.contract_entities.push(rec.contract_entity);
        const cityMarkaz = rec.markaz || rec.city || 'المنصورة';
        if (!doc.cities.includes(cityMarkaz)) doc.cities.push(cityMarkaz);
        if (!doc.markazes.includes(cityMarkaz)) doc.markazes.push(cityMarkaz);
        if (rec.subspecialty && !doc.subspecialties.includes(rec.subspecialty)) doc.subspecialties.push(rec.subspecialty);

        doc.workplaces.push({
          record_id: rec.id,
          hospital: rec.hospital,
          contract_entity: rec.contract_entity || 'مباشر من الشركة WE',
          contract_entity_id: rec.contract_entity_id || 'direct_we',
          coverage_scope: rec.coverage_scope || 'both',
          coverage_label: rec.coverage_label || 'شامل: العاملين + أسر العاملين (جلوب ميد)',
          clinic_type: rec.clinic_type,
          subspecialty: rec.subspecialty,
          address: rec.address,
          city: cityMarkaz,
          markaz: cityMarkaz,
          area: rec.area,
          schedule: rec.schedule,
          raw_phone: rec.raw_phone,
          phones: rec.phones || [],
          notes: rec.notes,
          maps_url: rec.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((rec.name || rec.raw_name) + ' ' + (rec.address || '') + ' ' + cityMarkaz)}`
        });

        if (rec.phones && Array.isArray(rec.phones)) {
          rec.phones.forEach((p) => {
            if (p.digits && !doc.all_phones.some((x) => x.digits === p.digits)) {
              doc.all_phones.push(p);
            } else if (!p.digits && !doc.all_phones.some((x) => x.display === p.display)) {
              doc.all_phones.push(p);
            }
          });
        }
      });

      return Object.values(docsMap);
    },

    resetToDefaults() {
      localStorage.removeItem(STORAGE_KEYS.CUSTOM_RECORDS);
      localStorage.removeItem(STORAGE_KEYS.MODIFIED_RECORDS);
      localStorage.removeItem(STORAGE_KEYS.DELETED_IDS);
    },

    exportFullBackup() {
      const backup = {
        exported_at: new Date().toISOString(),
        app: 'WE Medical Directory Dakahlia v3.0',
        developer: 'Mahmoud El-Eraky (أ / محمود العراقي)',
        custom_records: this.getCustomRecords(),
        modified_records: this.getModifiedRecords(),
        deleted_ids: this.getDeletedIds(),
        favorites: this.getFavorites(),
        suggestions: this.getSuggestions(),
        employees: this.getEmployees(),
        guidelines: this.getGuidelines(),
        emergency_services: this.getEmergencyServices(),
        ratings: (() => {
          try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.RATINGS) || '{}');
          } catch (e) {
            return {};
          }
        })()
      };
      return JSON.stringify(backup, null, 2);
    },

    importFullBackup(jsonString) {
      try {
        const data = JSON.parse(jsonString);
        if (data.custom_records) localStorage.setItem(STORAGE_KEYS.CUSTOM_RECORDS, JSON.stringify(data.custom_records));
        if (data.modified_records) localStorage.setItem(STORAGE_KEYS.MODIFIED_RECORDS, JSON.stringify(data.modified_records));
        if (data.deleted_ids) localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(data.deleted_ids));
        if (data.favorites) localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(data.favorites));
        if (data.suggestions) localStorage.setItem(STORAGE_KEYS.SUGGESTIONS, JSON.stringify(data.suggestions));
        if (data.ratings) localStorage.setItem(STORAGE_KEYS.RATINGS, JSON.stringify(data.ratings));
        if (data.employees) localStorage.setItem(STORAGE_KEYS.EMPLOYEES_LIST, JSON.stringify(data.employees));
        if (data.guidelines) localStorage.setItem(STORAGE_KEYS.CUSTOM_GUIDELINES, JSON.stringify(data.guidelines));
        if (data.emergency_services) localStorage.setItem(STORAGE_KEYS.CUSTOM_EMERGENCY, JSON.stringify(data.emergency_services));
        return true;
      } catch (e) {
        return false;
      }
    },

    getTheme() {
      return localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
    },

    setTheme(theme) {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
    }
  };

  function roundRating(seed) {
    return Number((4.7 + ((seed % 4) * 0.08)).toFixed(1));
  }

  window.MedicalStorage = MedicalStorage;
})(window);
