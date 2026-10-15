/* ====================================================================
 * WE Medical Directory - Storage & Persistence Engine (v2.1)
 * Manages LocalStorage, Bookmarks, Custom Records, Suggestions,
 * Ratings, and Sync between initial Excel data and user changes.
 * Prepared & Developed by: Mahmoud El-Eraky (أ / محمود العراقي)
 * ==================================================================== */

(function (window) {
  'use strict';

  const STORAGE_KEYS = {
    FAVORITES: 'we_medical_favorites_v2',
    RECENT_SEARCHES: 'we_medical_recent_searches_v2',
    CUSTOM_RECORDS: 'we_medical_custom_records_v2',
    MODIFIED_RECORDS: 'we_medical_modified_records_v2',
    DELETED_IDS: 'we_medical_deleted_ids_v2',
    SUGGESTIONS: 'we_medical_user_suggestions_v2',
    RATINGS: 'we_medical_ratings_v2',
    THEME: 'we_medical_theme_v2',
    USER_NOTES: 'we_medical_user_notes_v2'
  };

  const MedicalStorage = {
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
        phone: data.phone || '',
        address: data.address || '',
        suggestedBy: data.suggestedBy || 'زميل بالشركة المصرية للاتصالات',
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
          author: (authorName || 'زميل بالشركة المصرية للاتصالات').trim(),
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
            display_name: rec.raw_name,
            specialty: rec.specialty,
            subspecialties: [rec.subspecialty],
            academic_rank: rec.academic_rank || 'طبيب استشاري',
            is_department: isDept,
            hospitals: [rec.hospital],
            workplaces: [],
            all_phones: [],
            cities: [rec.city || 'المنصورة'],
            records_count: 0,
            rating: roundRating(rec.id),
            reviews_count: 14 + (rec.id % 19)
          };
        }

        const doc = docsMap[key];
        doc.records_count++;
        if (!doc.hospitals.includes(rec.hospital)) doc.hospitals.push(rec.hospital);
        if (rec.city && !doc.cities.includes(rec.city)) doc.cities.push(rec.city);
        if (rec.subspecialty && !doc.subspecialties.includes(rec.subspecialty)) doc.subspecialties.push(rec.subspecialty);

        doc.workplaces.push({
          record_id: rec.id,
          hospital: rec.hospital,
          clinic_type: rec.clinic_type,
          subspecialty: rec.subspecialty,
          address: rec.address,
          city: rec.city,
          area: rec.area,
          schedule: rec.schedule,
          raw_phone: rec.raw_phone,
          phones: rec.phones || [],
          notes: rec.notes,
          maps_url: rec.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((rec.name || rec.raw_name) + ' ' + (rec.address || '') + ' ' + (rec.city || 'المنصورة'))}`
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
        app: 'WE Medical Directory Dakahlia',
        developer: 'Mahmoud El-Eraky (أ / محمود العراقي)',
        custom_records: this.getCustomRecords(),
        modified_records: this.getModifiedRecords(),
        deleted_ids: this.getDeletedIds(),
        favorites: this.getFavorites(),
        suggestions: this.getSuggestions(),
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
