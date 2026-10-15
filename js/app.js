/* ====================================================================
 * WE Medical Directory - Main Application Controller (v2.2)
 * Mobile Sidebar Drawer, Smart Filter Bar, Instant Specialty Reveal,
 * Prepared & Developed by: Mahmoud El-Eraky (أ / محمود العراقي)
 * ==================================================================== */

(function (window) {
  'use strict';

  // Global State
  const state = {
    currentTab: 'home',
    searchQuery: '',
    selectedHospital: 'all',
    selectedSpecialty: 'all',
    selectedClinicType: 'all',
    selectedServiceTab: 'all',
    sortBy: 'default',
    records: [],
    doctors: [],
    specialties: [],
    hospitals: {},
    categories: [],
    labs: [],
    radiology: [],
    pharmacies: [],
    specializedCenters: [],
    emergencyServices: [],
    statsMatrix: {},
    metadata: {},
    deferredPrompt: null,
    selectedDoctor: null
  };

  function normalizeArabic(text) {
    if (!text) return '';
    return String(text)
      .replace(/[إأآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[ؤئ]/g, 'ء')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    if (type === 'danger') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function initApp() {
    const savedTheme = MedicalStorage.getTheme();
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    loadData();
    setupEventListeners();
    handleHashRouting();
    registerServiceWorker();

    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      if (splash) splash.classList.add('fade-out');
    }, 600);
  }

  function loadData() {
    const initial = window.INITIAL_MEDICAL_DATA || {};
    state.metadata = initial.metadata || {};
    state.hospitals = initial.hospitals || {};
    state.specialties = initial.specialties || [];
    state.categories = initial.categories || [];
    state.labs = initial.labs || [];
    state.radiology = initial.radiology || [];
    state.pharmacies = initial.pharmacies || [];
    state.specializedCenters = initial.specialized_centers || [];
    state.emergencyServices = initial.emergencyServices || [];
    state.statsMatrix = initial.stats_matrix || {};

    state.records = MedicalStorage.getLiveRecords();
    state.doctors = MedicalStorage.getLiveDoctors();

    renderHeroStats();
    renderHomeCategories();
    renderHomeHospitals();
    renderSidebarHospitals();
    renderSidebarSpecialties();
    renderSpecialtiesView();
    renderHospitalsView();
    renderServicesView();
    renderEmergencyView();
    populateAdminSpecialtyDropdown();
    renderAdminStats();
  }

  function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('main-search-input');
    const searchClear = document.getElementById('search-clear-btn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (searchClear) searchClear.classList.toggle('visible', !!e.target.value);
        if (state.searchQuery.trim().length > 0) {
          if (state.currentTab !== 'doctors') switchTab('doctors');
          renderDoctorsList();
        }
      });

      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          MedicalStorage.addRecentSearch(state.searchQuery);
          switchTab('doctors');
          renderDoctorsList();
        }
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        state.searchQuery = '';
        searchClear.classList.remove('visible');
        renderDoctorsList();
      });
    }

    // Secondary filters
    const clinicFilter = document.getElementById('filter-clinic-type');
    if (clinicFilter) {
      clinicFilter.addEventListener('change', (e) => {
        state.selectedClinicType = e.target.value;
        renderDoctorsList();
      });
    }

    const sortFilter = document.getElementById('filter-sort-by');
    if (sortFilter) {
      sortFilter.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderDoctorsList();
      });
    }

    // Navigation items
    document.querySelectorAll('[data-nav-tab]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = btn.getAttribute('data-nav-tab');
        switchTab(tab);
      });
    });

    // Services Sub-tabs
    document.querySelectorAll('[data-serv-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-serv-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedServiceTab = btn.getAttribute('data-serv-tab');
        renderServicesView();
      });
    });

    // Admin Sub-tabs
    document.querySelectorAll('[data-admin-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-admin-view]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const viewId = btn.getAttribute('data-admin-view');
        document.querySelectorAll('.admin-subview').forEach(v => v.style.display = 'none');
        const target = document.getElementById(`admin-tab-${viewId}`);
        if (target) target.style.display = 'block';
      });
    });

    // Theme toggle
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
      const installBtn = document.getElementById('btn-install-header');
      if (installBtn) installBtn.style.display = 'inline-flex';
    });

    const installBtn = document.getElementById('btn-install-header');
    if (installBtn) installBtn.addEventListener('click', handlePWAInstall);

    // Modal Close
    document.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', closeModal);
    });

    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });
    }

    window.addEventListener('popstate', handleHashRouting);
  }

  function switchTab(tabId) {
    state.currentTab = tabId;
    window.location.hash = tabId;

    document.querySelectorAll('[data-nav-tab]').forEach((btn) => {
      const match = btn.getAttribute('data-nav-tab') === tabId;
      btn.classList.toggle('active', match);
    });

    document.querySelectorAll('.view-section').forEach((sec) => {
      sec.style.display = 'none';
    });

    const target = document.getElementById(`view-${tabId}`);
    if (target) {
      target.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (tabId === 'doctors') {
      renderDoctorsList();
    } else if (tabId === 'favorites') {
      renderFavoritesList();
    } else if (tabId === 'admin') {
      renderAdminView();
    } else if (tabId === 'services') {
      renderServicesView();
    }
  }

  function handleHashRouting() {
    const hash = window.location.hash.replace('#', '') || 'home';
    const validTabs = ['home', 'doctors', 'specialties', 'services', 'hospitals', 'favorites', 'emergency', 'admin'];
    if (validTabs.includes(hash)) {
      switchTab(hash);
    } else {
      switchTab('home');
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    MedicalStorage.setTheme(next);
    updateThemeIcon(next);
    showToast(next === 'dark' ? 'تم تفعيل الوضع الليلي' : 'تم تفعيل الوضع النهاري', 'info', 2000);
  }

  function updateThemeIcon(theme) {
    const icon = document.querySelector('#btn-theme-toggle i');
    if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }

  // Sidebar Controls
  function openSidebar() {
    const backdrop = document.getElementById('sidebar-backdrop');
    const sidebar = document.getElementById('mobile-filter-sidebar');
    if (backdrop) backdrop.classList.add('active');
    if (sidebar) sidebar.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    const backdrop = document.getElementById('sidebar-backdrop');
    const sidebar = document.getElementById('mobile-filter-sidebar');
    if (backdrop) backdrop.classList.remove('active');
    if (sidebar) sidebar.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Render Sidebar Hospitals
  function renderSidebarHospitals() {
    const container = document.getElementById('sidebar-hospitals-list');
    if (!container) return;

    const hospCounts = {
      'all': state.records.length,
      'مستشفى الحكمة': state.records.filter((r) => r.hospital.includes('الحكمة')).length,
      'مستشفى الجزيرة الدولي (السلاب)': state.records.filter((r) => r.hospital.includes('السلاب') || r.hospital.includes('الجزيرة')).length,
      'مستشفى الخير': state.records.filter((r) => r.hospital.includes('الخير')).length
    };

    const items = [
      { id: 'all', name: 'كافة المستشفيات الشريكة', icon: 'fa-hospital-wide' },
      { id: 'مستشفى الحكمة', name: 'مستشفى الحكمة بالمنصورة', icon: 'fa-hospital' },
      { id: 'مستشفى الجزيرة الدولي (السلاب)', name: 'مستشفى السلاب (الجزيرة الدولي)', icon: 'fa-hospital' },
      { id: 'مستشفى الخير', name: 'مستشفى الخير بالمنصورة', icon: 'fa-hospital' }
    ];

    container.innerHTML = items.map((h) => `
      <button class="sidebar-item-btn ${state.selectedHospital === h.id ? 'active' : ''}" data-side-hosp="${h.id}">
        <div class="sidebar-item-left">
          <i class="fa-solid ${h.icon}"></i>
          <span>${h.name}</span>
        </div>
        <span class="sidebar-item-badge">${hospCounts[h.id] || 0}</span>
      </button>
    `).join('');

    container.querySelectorAll('[data-side-hosp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedHospital = btn.getAttribute('data-side-hosp');
        container.querySelectorAll('[data-side-hosp]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        closeSidebar();
        switchTab('doctors');
        renderDoctorsList();
      });
    });
  }

  // Render Sidebar Specialties (14 Medical Specialties)
  function renderSidebarSpecialties() {
    const container = document.getElementById('sidebar-specialties-list');
    if (!container) return;

    container.innerHTML = state.specialties.map((s) => `
      <button class="sidebar-item-btn ${state.selectedSpecialty === s.name ? 'active' : ''}" data-side-spec="${s.name}">
        <div class="sidebar-item-left">
          <i class="fa-solid ${s.icon || 'fa-stethoscope'}" style="color: ${s.color};"></i>
          <span>${s.name}</span>
        </div>
        <span class="sidebar-item-badge">${s.total_records}</span>
      </button>
    `).join('');

    container.querySelectorAll('[data-side-spec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedSpecialty = btn.getAttribute('data-side-spec');
        container.querySelectorAll('[data-side-spec]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        closeSidebar();
        switchTab('doctors');
        renderDoctorsList();
      });
    });
  }

  function openServiceFromSidebar(serviceCat) {
    closeSidebar();
    switchTab('services');
    const tabBtn = document.querySelector(`[data-serv-tab="${serviceCat}"]`) || document.querySelector('[data-serv-tab="all"]');
    if (tabBtn) tabBtn.click();
  }

  function renderHeroStats() {
    const totalRecordsEl = document.getElementById('hero-stat-records');
    const totalDocsEl = document.getElementById('hero-stat-doctors');
    const totalSpecsEl = document.getElementById('hero-stat-specs');
    const totalHospsEl = document.getElementById('hero-stat-hosps');

    if (totalRecordsEl) totalRecordsEl.textContent = state.records.length || 169;
    if (totalDocsEl) totalDocsEl.textContent = state.doctors.length || 156;
    if (totalSpecsEl) totalSpecsEl.textContent = state.specialties.length || 14;
    if (totalHospsEl) totalHospsEl.textContent = Object.keys(state.hospitals).length || 3;
  }

  // Render 12 Categories Grid on Home Screen
  function renderHomeCategories() {
    const container = document.getElementById('home-categories-grid');
    if (!container) return;

    container.innerHTML = state.categories.map((cat) => `
      <div class="category-app-card" onclick="window.MedicalApp.handleCategoryClick('${cat.id}')">
        <div class="cat-icon-bubble" style="background: ${cat.color};">
          <i class="fa-solid ${cat.icon}"></i>
        </div>
        <div class="cat-app-name">${cat.name}</div>
        <div class="cat-app-desc">${cat.desc || ''}</div>
      </div>
    `).join('');
  }

  function handleCategoryClick(catId) {
    if (catId === 'all_doctors') {
      state.selectedSpecialty = 'all';
      state.selectedHospital = 'all';
      switchTab('doctors');
      renderDoctorsList();
    } else if (catId === 'hospitals') {
      switchTab('hospitals');
    } else if (catId === 'emergency_services') {
      switchTab('emergency');
    } else if (catId === 'dental') {
      filterBySpecialty('طب الفم والأسنان');
    } else if (catId === 'optics') {
      filterBySpecialty('طب وجراحة العيون');
    } else if (catId === 'physical_therapy') {
      filterBySpecialty('التأهيل والعلاج الطبيعي');
    } else if (catId === 'cardiology_center') {
      filterBySpecialty('الباطنة والقلب والجهاز الهضمي');
    } else if (catId === 'dialysis') {
      filterBySpecialty('المسالك البولية والكلى');
    } else if (catId === 'labs' || catId === 'radiology' || catId === 'pharmacies' || catId === 'home_care') {
      switchTab('services');
      const tabBtn = document.querySelector(`[data-serv-tab="${catId}"]`) || document.querySelector('[data-serv-tab="all"]');
      if (tabBtn) tabBtn.click();
    } else {
      switchTab('doctors');
      renderDoctorsList();
    }
  }

  function renderHomeHospitals() {
    const container = document.getElementById('home-hospitals-grid');
    if (!container) return;

    const hosps = Object.values(state.hospitals);
    container.innerHTML = hosps.map((h) => {
      const docCount = state.records.filter(r => r.hospital.includes(h.short_name.replace('مستشفى ', ''))).length;
      return `
        <div class="hosp-mini-card">
          <div class="hosp-mini-header">
            <div class="hosp-mini-icon" style="color:${h.color}">
              <i class="fa-solid fa-hospital"></i>
            </div>
            <div class="hosp-mini-info">
              <h4>${h.short_name}</h4>
              <span>${docCount} عيادة وطبيب معتمد</span>
            </div>
          </div>
          <div class="hosp-mini-body">
            <p><i class="fa-solid fa-location-dot" style="color:var(--we-purple-light)"></i> ${h.address}</p>
            <p style="margin-top:0.25rem;"><i class="fa-solid fa-clock" style="color:var(--we-purple-light)"></i> ${h.working_hours}</p>
          </div>
          <div class="hosp-mini-actions">
            <button class="btn-primary-purple" style="flex:1; padding:0.4rem; font-size:0.78rem; border-radius:var(--radius-sm);" onclick="window.MedicalApp.filterByHospital('${h.short_name}')">
              <i class="fa-solid fa-users-viewfinder"></i> أطباء المستشفى
            </button>
            ${h.phone_digits ? `
              <a href="tel:${h.phone_digits}" class="btn-action-call" style="padding:0.4rem 0.7rem; border-radius:var(--radius-sm); font-size:0.78rem;">
                <i class="fa-solid fa-phone"></i>
              </a>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function filterDoctors() {
    const q = normalizeArabic(state.searchQuery);
    const selHosp = state.selectedHospital;
    const selSpec = state.selectedSpecialty;
    const selType = state.selectedClinicType;

    return state.doctors.filter((doc) => {
      if (selHosp !== 'all') {
        const matchesHosp = doc.hospitals.some((h) => h.includes(selHosp) || (selHosp.includes('السلاب') && h.includes('الجزيرة')));
        if (!matchesHosp) return false;
      }

      if (selSpec !== 'all' && doc.specialty !== selSpec) {
        return false;
      }

      if (selType !== 'all') {
        const matchesType = doc.workplaces.some((w) => w.clinic_type === selType);
        if (!matchesType) return false;
      }

      if (q) {
        const docText = normalizeArabic(`
          ${doc.name} ${doc.display_name} ${doc.specialty} ${doc.subspecialties.join(' ')}
          ${doc.hospitals.join(' ')} ${doc.cities.join(' ')}
          ${doc.workplaces.map(w => `${w.address} ${w.area} ${w.clinic_type} ${w.raw_phone} ${w.schedule}`).join(' ')}
        `);
        if (!docText.includes(q)) return false;
      }

      return true;
    });
  }

  function sortDoctors(list) {
    if (state.sortBy === 'name') {
      return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    } else if (state.sortBy === 'workplaces') {
      return [...list].sort((a, b) => b.workplaces.length - a.workplaces.length);
    } else if (state.sortBy === 'rating') {
      return [...list].sort((a, b) => b.rating - a.rating);
    }
    return list;
  }

  function renderDoctorsList() {
    const container = document.getElementById('doctors-grid-container');
    const countEl = document.getElementById('results-count-value');
    const badgeEl = document.getElementById('active-filter-badge');
    if (!container) return;

    let filtered = filterDoctors();
    filtered = sortDoctors(filtered);

    if (countEl) countEl.textContent = filtered.length;

    if (badgeEl) {
      if (state.selectedSpecialty !== 'all') {
        badgeEl.textContent = `${state.selectedSpecialty} (${filtered.length} طبيب) — اضغط للتغيير`;
      } else if (state.selectedHospital !== 'all') {
        badgeEl.textContent = `${state.selectedHospital} (${filtered.length} طبيب) — اضغط للتغيير`;
      } else if (state.searchQuery) {
        badgeEl.textContent = `بحث: "${state.searchQuery}" (${filtered.length} نتيجة)`;
      } else {
        badgeEl.textContent = `كافة الأطباء (169 عيادة) — اضغط للتصفية`;
      }
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon"><i class="fa-solid fa-user-doctor"></i></div>
          <h3>لا توجد نتائج مطابقة لاختيارك</h3>
          <p>جرّب اختيار تخصص آخر أو إلغاء بعض الفلاتر من الشريط الجانبي.</p>
          <button class="btn-primary-purple" style="padding:0.6rem 1.2rem; border-radius:var(--radius-md);" onclick="window.MedicalApp.resetFilters()">
            عرض كافة الأطباء
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((doc) => createDoctorCardHTML(doc)).join('');
    attachDoctorCardEvents(container);
  }

  function createDoctorCardHTML(doc) {
    const isFav = MedicalStorage.isFavorite(doc.doctor_id);
    const specInfo = state.specialties.find((s) => s.name === doc.specialty) || {};
    const iconClass = specInfo.icon || 'fa-stethoscope';
    const primaryWp = doc.workplaces[0] || {};
    const hasMultipleWp = doc.workplaces.length > 1;

    let clinicTagClass = 'tag-internal';
    if (primaryWp.clinic_type && primaryWp.clinic_type.includes('خارجية')) clinicTagClass = 'tag-external';
    if (primaryWp.clinic_type && primaryWp.clinic_type.includes('تحويل')) clinicTagClass = 'tag-referral';
    if (primaryWp.clinic_type && primaryWp.clinic_type.includes('دائم')) clinicTagClass = 'tag-permanent';

    const callPhone = primaryWp.phones && primaryWp.phones[0] ? primaryWp.phones[0].tel : '';
    const waPhone = primaryWp.phones && primaryWp.phones.find(p => p.whatsapp) ? primaryWp.phones.find(p => p.whatsapp).whatsapp : null;

    return `
      <div class="doctor-card" data-doc-id="${doc.doctor_id}">
        <div class="card-top">
          <div class="doctor-avatar">
            <i class="fa-solid ${iconClass}"></i>
          </div>
          <div class="doctor-info">
            <span class="doctor-academic-badge">${doc.academic_rank}</span>
            <h3 class="doctor-name" title="${doc.display_name}">${doc.display_name}</h3>
            <div class="doctor-specialty-sub">${doc.specialty} ${doc.subspecialties[0] ? '• ' + doc.subspecialties[0] : ''}</div>
          </div>
          <button class="btn-card-fav ${isFav ? 'active' : ''}" data-fav-id="${doc.doctor_id}" title="إضافة للمفضلة">
            <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
          </button>
        </div>

        ${hasMultipleWp ? `
          <div class="multi-workplace-alert">
            <i class="fa-solid fa-hospital-user"></i>
            <span>متاح في ${doc.workplaces.length} أماكن عمل (${doc.hospitals.join(' • ')})</span>
          </div>
          <div class="workplace-tabs-nav">
            ${doc.workplaces.map((wp, idx) => `
              <button class="wp-tab-btn ${idx === 0 ? 'active' : ''}" data-wp-idx="${idx}">
                ${wp.hospital.replace('مستشفى ', '')} (${wp.clinic_type.includes('داخل') ? 'داخلي' : 'خارجي'})
              </button>
            `).join('')}
          </div>
        ` : ''}

        <div class="card-details-list">
          <div class="detail-row">
            <i class="fa-solid fa-hospital"></i>
            <div>
              <strong class="wp-hosp-text">${primaryWp.hospital}</strong>
              <span class="clinic-type-tag ${clinicTagClass} wp-type-text">${primaryWp.clinic_type}</span>
            </div>
          </div>
          <div class="detail-row">
            <i class="fa-solid fa-location-dot"></i>
            <span class="wp-address-text">${primaryWp.address || 'بمقر المستشفى'}</span>
          </div>
          <div class="detail-row">
            <i class="fa-solid fa-calendar-check"></i>
            <span class="wp-schedule-text">${primaryWp.schedule || 'حسب جدول مواعيد المستشفى'}</span>
          </div>
          <div class="detail-row">
            <i class="fa-solid fa-phone"></i>
            <span class="wp-phone-text">${primaryWp.raw_phone || 'عيادات المستشفى'}</span>
          </div>
        </div>

        <div class="card-actions-row">
          ${callPhone ? `
            <a href="tel:${callPhone}" class="btn-action btn-action-call" title="اتصال فوري">
              <i class="fa-solid fa-phone"></i>
              <span>اتصال</span>
            </a>
          ` : `
            <button class="btn-action btn-action-call" onclick="window.MedicalApp.showDocDetails('${doc.doctor_id}')" title="أرقام الحجز">
              <i class="fa-solid fa-phone"></i>
              <span>الحجز</span>
            </button>
          `}

          ${waPhone ? `
            <a href="https://wa.me/${waPhone}?text=${encodeURIComponent('السلام عليكم، استفسار بخصوص حجز موعد مع ' + doc.display_name + ' من دليل WE الطبي')}" target="_blank" class="btn-action btn-action-wa" title="واتساب مباشر">
              <i class="fa-brands fa-whatsapp"></i>
              <span>واتساب</span>
            </a>
          ` : `
            <button class="btn-action btn-action-wa" onclick="window.MedicalApp.shareDoctor('${doc.doctor_id}')" title="مشاركة">
              <i class="fa-solid fa-share-nodes"></i>
              <span>مشاركة</span>
            </button>
          `}

          <a href="${primaryWp.maps_url}" target="_blank" class="btn-action btn-action-map wp-map-btn" title="الموقع على الخريطة">
            <i class="fa-solid fa-map-location-dot"></i>
            <span>الخريطة</span>
          </a>

          <button class="btn-action btn-action-details" onclick="window.MedicalApp.showDocDetails('${doc.doctor_id}')" title="التفاصيل الكاملة">
            <i class="fa-solid fa-circle-info"></i>
            <span>التفاصيل</span>
          </button>
        </div>
      </div>
    `;
  }

  function attachDoctorCardEvents(container) {
    container.querySelectorAll('.doctor-card').forEach((card) => {
      const docId = card.getAttribute('data-doc-id');
      const doc = state.doctors.find((d) => d.doctor_id === docId);
      if (!doc || doc.workplaces.length <= 1) return;

      const tabs = card.querySelectorAll('.wp-tab-btn');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const idx = parseInt(tab.getAttribute('data-wp-idx'), 10);
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          const wp = doc.workplaces[idx];
          if (!wp) return;

          card.querySelector('.wp-hosp-text').textContent = wp.hospital;
          card.querySelector('.wp-type-text').textContent = wp.clinic_type;
          card.querySelector('.wp-address-text').textContent = wp.address || 'بمقر المستشفى';
          card.querySelector('.wp-schedule-text').textContent = wp.schedule || 'حسب جدول المستشفى';
          card.querySelector('.wp-phone-text').textContent = wp.raw_phone || 'عيادات المستشفى';
          
          const mapBtn = card.querySelector('.wp-map-btn');
          if (mapBtn) mapBtn.href = wp.maps_url;
        });
      });
    });

    container.querySelectorAll('.btn-card-fav').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const docId = btn.getAttribute('data-fav-id');
        const isFav = MedicalStorage.toggleFavorite(docId);
        btn.classList.toggle('active', isFav);
        const icon = btn.querySelector('i');
        if (icon) icon.className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        showToast(isFav ? 'تمت إضافة الطبيب إلى المفضلة' : 'تمت الإزالة من المفضلة', isFav ? 'success' : 'info', 2000);
      });
    });
  }

  // Render Services View
  function renderServicesView() {
    const container = document.getElementById('services-grid-container');
    if (!container) return;

    let items = [];
    const tab = state.selectedServiceTab;

    if (tab === 'all' || tab === 'labs') items = items.concat(state.labs);
    if (tab === 'all' || tab === 'radiology') items = items.concat(state.radiology);
    if (tab === 'all' || tab === 'pharmacies') items = items.concat(state.pharmacies);
    if (tab === 'all' || tab === 'specialized') items = items.concat(state.specializedCenters);

    container.innerHTML = items.map((item) => {
      let icon = 'fa-hospital-user';
      let iconColor = '#5B2C82';
      let catLabel = 'خدمة طبية';

      if (item.category === 'labs') { icon = 'fa-vial-virus'; iconColor = '#0288D1'; catLabel = 'معمل تحاليل'; }
      else if (item.category === 'radiology') { icon = 'fa-x-ray'; iconColor = '#8E24AA'; catLabel = 'مركز أشعة'; }
      else if (item.category === 'pharmacies') { icon = 'fa-prescription-bottle-medical'; iconColor = '#10B981'; catLabel = 'صيدلية'; }
      else if (item.category === 'dental') { icon = 'fa-tooth'; iconColor = '#00ACC1'; catLabel = 'مركز أسنان'; }
      else if (item.category === 'optics') { icon = 'fa-eye'; iconColor = '#43A047'; catLabel = 'مركز عيون'; }
      else if (item.category === 'dialysis') { icon = 'fa-droplet'; iconColor = '#1E88E5'; catLabel = 'غسيل كلوي'; }
      else if (item.category === 'cardiology_center') { icon = 'fa-heart-pulse'; iconColor = '#E53935'; catLabel = 'قسطرة قلب 24س'; }
      else if (item.category === 'home_care') { icon = 'fa-user-nurse'; iconColor = '#EC4899'; catLabel = 'تمريض منزلي'; }

      const callPhone = item.phone ? item.phone.split(/[-,\/]/)[0].trim().replace(/[^\d]/g, '') : '';

      return `
        <div class="doctor-card">
          <div class="card-top">
            <div class="doctor-avatar" style="color: ${iconColor};">
              <i class="fa-solid ${icon}"></i>
            </div>
            <div class="doctor-info">
              <span class="doctor-academic-badge" style="color:${iconColor};">${catLabel}</span>
              <h3 class="doctor-name">${item.name}</h3>
              <div class="doctor-specialty-sub">${item.city}</div>
            </div>
          </div>

          <div class="card-details-list">
            <div class="detail-row">
              <i class="fa-solid fa-location-dot"></i>
              <span>${item.address}</span>
            </div>
            <div class="detail-row">
              <i class="fa-solid fa-clock"></i>
              <span>${item.working_hours}</span>
            </div>
            <div class="detail-row">
              <i class="fa-solid fa-phone"></i>
              <span>${item.phone || item.hotline}</span>
            </div>
            ${item.services ? `
              <div class="detail-row">
                <i class="fa-solid fa-check"></i>
                <span style="font-size:0.78rem;">${item.services}</span>
              </div>
            ` : ''}
          </div>

          <div class="card-actions-row">
            ${callPhone ? `
              <a href="tel:${callPhone}" class="btn-action btn-action-call">
                <i class="fa-solid fa-phone"></i>
                <span>اتصال</span>
              </a>
            ` : `
              <button class="btn-action btn-action-call" onclick="window.MedicalApp.copyText('${item.phone}', 'تم نسخ رقم الهاتف')">
                <i class="fa-solid fa-phone"></i>
                <span>الهاتف</span>
              </button>
            `}

            <button class="btn-action btn-action-wa" onclick="window.MedicalApp.shareService('${item.name}', '${item.phone}', '${item.address}')">
              <i class="fa-solid fa-share-nodes"></i>
              <span>مشاركة</span>
            </button>

            <a href="${item.maps_url}" target="_blank" class="btn-action btn-action-map">
              <i class="fa-solid fa-map-location-dot"></i>
              <span>الخريطة</span>
            </a>

            <button class="btn-action btn-action-details" onclick="window.MedicalApp.copyText('${item.address}', 'تم نسخ العنوان')">
              <i class="fa-solid fa-copy"></i>
              <span>العنوان</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderFavoritesList() {
    const container = document.getElementById('favorites-grid-container');
    const emptyNotice = document.getElementById('favorites-empty-notice');
    if (!container) return;

    const favIds = MedicalStorage.getFavorites();
    const favDoctors = state.doctors.filter((d) => favIds.includes(d.doctor_id));

    if (favDoctors.length === 0) {
      container.innerHTML = '';
      if (emptyNotice) emptyNotice.style.display = 'block';
    } else {
      if (emptyNotice) emptyNotice.style.display = 'none';
      container.innerHTML = favDoctors.map((doc) => createDoctorCardHTML(doc)).join('');
      attachDoctorCardEvents(container);
    }
  }

  function renderSpecialtiesView() {
    const container = document.getElementById('specialties-view-grid');
    if (!container) return;

    container.innerHTML = state.specialties.map((s) => `
      <div class="specialty-full-card" onclick="window.MedicalApp.filterBySpecialty('${s.name}')">
        <div class="spec-card-icon" style="background:${s.bg || '#F3E8FF'}; color:${s.color || '#5B2C82'}">
          <i class="fa-solid ${s.icon || 'fa-stethoscope'}"></i>
        </div>
        <h3 class="spec-card-title">${s.name}</h3>
        <div class="spec-hospital-breakdown">
          <div class="spec-hosp-row"><span>مستشفى الحكمة:</span> <strong>${s.hekma_count}</strong></div>
          <div class="spec-hosp-row"><span>مستشفى السلاب:</span> <strong>${s.sellab_count}</strong></div>
          <div class="spec-hosp-row"><span>مستشفى الخير:</span> <strong>${s.kheir_count}</strong></div>
        </div>
        <div class="spec-total-badge">إجمالي الأطباء: ${s.total_records} (اضغط للعرض)</div>
      </div>
    `).join('');
  }

  function renderHospitalsView() {
    const container = document.getElementById('hospitals-view-container');
    if (!container) return;

    const hosps = Object.values(state.hospitals);
    container.innerHTML = hosps.map((h) => {
      const docCount = state.records.filter(r => r.hospital.includes(h.short_name.replace('مستشفى ', ''))).length;
      return `
        <div class="hospital-master-card">
          <div class="hospital-header" style="background: linear-gradient(135deg, ${h.color || '#5B2C82'}, #370a68);">
            <div class="hosp-title-group">
              <h2>${h.name}</h2>
              <p><i class="fa-solid fa-location-dot"></i> ${h.address}</p>
            </div>
            <span class="hosp-badge">${h.badge || 'مستشفى معتمد'}</span>
          </div>
          <div class="hospital-body">
            <p style="margin-bottom:1rem; color:var(--text-secondary); font-size:0.9rem;">${h.description}</p>
            <div class="hosp-highlights-grid">
              <div class="hosp-highlight-item">
                <i class="fa-solid fa-clock"></i>
                <div>
                  <strong>مواعيد وساعات العمل</strong>
                  <span>${h.working_hours}</span>
                </div>
              </div>
              <div class="hosp-highlight-item">
                <i class="fa-solid fa-phone-volume"></i>
                <div>
                  <strong>خط الحجز والاستعلام</strong>
                  <span>${h.phone || 'بمقر المستشفى'}</span>
                </div>
              </div>
              ${h.email_approvals ? `
                <div class="hosp-highlight-item">
                  <i class="fa-solid fa-envelope-open-text"></i>
                  <div>
                    <strong>بريد الموافقات الطبية</strong>
                    <span>${h.email_approvals}</span>
                  </div>
                </div>
              ` : ''}
              <div class="hosp-highlight-item">
                <i class="fa-solid fa-user-doctor"></i>
                <div>
                  <strong>الأطباء المعتمدون بالدليل</strong>
                  <span>${docCount} عيادة وطبيب استشاري</span>
                </div>
              </div>
            </div>

            <div class="hosp-buttons-row">
              <button class="btn-hosp-action btn-primary-purple" onclick="window.MedicalApp.filterByHospital('${h.short_name}')">
                <i class="fa-solid fa-users-viewfinder"></i>
                <span>استعراض كافة أطباء المستشفى (${docCount})</span>
              </button>

              ${h.phone_digits ? `
                <a href="tel:${h.phone_digits}" class="btn-hosp-action btn-accent-pink">
                  <i class="fa-solid fa-phone"></i>
                  <span>اتصال بالحجز</span>
                </a>
              ` : ''}

              ${h.email_approvals ? `
                <button class="btn-hosp-action btn-accent-pink" onclick="window.MedicalApp.openApprovalEmailModal('${h.name}', '${h.email_approvals}')">
                  <i class="fa-solid fa-file-medical"></i>
                  <span>طلب موافقة فوري</span>
                </button>
              ` : ''}

              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.google_maps_query || h.name)}" target="_blank" class="btn-hosp-action btn-outline">
                <i class="fa-solid fa-diamond-turn-right"></i>
                <span>الخريطة</span>
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderEmergencyView() {
    const container = document.getElementById('emergency-grid-container');
    if (!container) return;

    container.innerHTML = state.emergencyServices.map((em) => `
      <div class="emergency-card">
        <div class="emergency-icon" style="background:${em.color || '#D32F2F'}">
          <i class="fa-solid ${em.icon || 'fa-truck-medical'}"></i>
        </div>
        <div class="emergency-info">
          <h3 class="emergency-name">${em.name}</h3>
          <p class="emergency-desc">${em.description}</p>
          ${em.tel ? `
            <a href="tel:${em.tel}" class="emergency-call-btn">
              <i class="fa-solid fa-phone-flip"></i>
              <span>اتصال الآن (${em.number})</span>
            </a>
          ` : em.email ? `
            <button class="emergency-call-btn" style="background:#00796B" onclick="window.MedicalApp.openApprovalEmailModal('مستشفى الخير', '${em.email}')">
              <i class="fa-solid fa-envelope"></i>
              <span>إرسال طلب موافقة</span>
            </button>
          ` : `
            <span class="pill-badge" style="background:var(--bg-subtle); color:var(--text-primary); font-size:0.85rem; padding:0.4rem 0.8rem;">
              <i class="fa-solid fa-circle-check" style="color:var(--color-success)"></i> ${em.number}
            </span>
          `}
        </div>
      </div>
    `).join('');
  }

  function populateAdminSpecialtyDropdown() {
    const select = document.getElementById('new-doc-specialty');
    if (!select) return;
    select.innerHTML = state.specialties.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
  }

  function renderAdminStats() {
    const incomplete = AdminPanel.findIncompleteRecords(state.records);
    const suggestions = MedicalStorage.getSuggestions();

    const auditBadge = document.getElementById('admin-audit-badge');
    const sugBadge = document.getElementById('admin-sug-badge');
    if (auditBadge) auditBadge.textContent = incomplete.length;
    if (sugBadge) sugBadge.textContent = suggestions.length;
  }

  function renderAdminView() {
    const isAuthed = AdminPanel.isAuthenticated();
    const loginSection = document.getElementById('admin-login-box');
    const dashboardSection = document.getElementById('admin-dashboard-content');

    if (!isAuthed) {
      if (loginSection) loginSection.style.display = 'block';
      if (dashboardSection) dashboardSection.style.display = 'none';
      return;
    }

    if (loginSection) loginSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'block';

    renderAdminStats();
    renderAdminAuditorTable();
    renderAdminDuplicates();
    renderAdminSuggestions();
  }

  function renderAdminAuditorTable() {
    const container = document.getElementById('admin-auditor-table-body');
    if (!container) return;

    const incomplete = AdminPanel.findIncompleteRecords(state.records);
    if (incomplete.length === 0) {
      container.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--color-success); font-weight:700;">جميع السجلات مكتملة بنسبة 100%!</td></tr>`;
      return;
    }

    container.innerHTML = incomplete.slice(0, 20).map(({ record, issues }) => `
      <tr>
        <td><strong>#${record.id}</strong></td>
        <td><strong>${record.raw_name || record.name}</strong></td>
        <td>${record.hospital}</td>
        <td><span style="color:#d97706; font-size:0.78rem;">${issues.join(' • ')}</span></td>
        <td>
          <button class="btn-action-call" style="padding:0.25rem 0.6rem; border-radius:var(--radius-sm);" onclick="window.MedicalApp.editRecord(${record.id})">
            تعديل
          </button>
        </td>
      </tr>
    `).join('');
  }

  function renderAdminDuplicates() {
    const container = document.getElementById('admin-duplicates-list');
    if (!container) return;

    const dupes = AdminPanel.findDuplicates(state.records);
    if (dupes.byName.length === 0 && dupes.byPhone.length === 0) {
      container.innerHTML = `<p style="color:var(--color-success); font-weight:700;">لا يوجد تكرار غير مبرر في السجلات الحالية.</p>`;
      return;
    }

    let html = `<div style="display:flex; flex-direction:column; gap:0.5rem;">`;
    dupes.byName.forEach((item) => {
      html += `
        <div style="background:var(--bg-subtle); padding:0.6rem; border-radius:var(--radius-sm); font-size:0.85rem;">
          <strong>${item.name}</strong>: مسجل في ${item.count} سجلات 
          (${item.isMultiHospital ? '<span style="color:var(--we-purple-primary); font-weight:700;">تعدد أماكن عمل مشروع</span>' : '<span style="color:#d97706; font-weight:700;">تكرار داخل نفس المستشفى</span>'})
        </div>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  function renderAdminSuggestions() {
    const container = document.getElementById('admin-suggestions-container');
    if (!container) return;

    const list = MedicalStorage.getSuggestions();
    if (list.length === 0) {
      container.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">لا توجد مقترحات جديدة مرسلة من المستخدمين حالياً.</p>`;
      return;
    }

    container.innerHTML = list.map(s => `
      <div style="background:var(--bg-subtle); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.85rem; margin-bottom:0.6rem; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h4 style="font-size:0.95rem; font-weight:800; color:var(--text-primary);">${s.name} <span class="clinic-type-tag tag-external">${s.category}</span></h4>
          <p style="font-size:0.8rem; color:var(--text-secondary);">${s.specialty ? s.specialty + ' • ' : ''}${s.hospital ? s.hospital + ' • ' : ''}${s.phone}</p>
          <p style="font-size:0.75rem; color:var(--text-muted);">${s.address} (اقترحه: ${s.suggestedBy} - ${s.date})</p>
        </div>
        <div style="display:flex; gap:0.4rem;">
          <button class="btn-action-call" style="padding:0.35rem 0.75rem; border-radius:var(--radius-sm);" onclick="window.MedicalApp.approveSuggestion('${s.id}')">
            إدراج
          </button>
          <button class="btn-outline" style="padding:0.35rem 0.75rem; border-radius:var(--radius-sm);" onclick="window.MedicalApp.rejectSuggestion('${s.id}')">
            حذف
          </button>
        </div>
      </div>
    `).join('');
  }

  function submitNewDoctor(e) {
    e.preventDefault();
    const name = document.getElementById('new-doc-name').value.trim();
    const category = document.getElementById('new-doc-category').value;
    const specialty = document.getElementById('new-doc-specialty').value;
    const subspecialty = document.getElementById('new-doc-subspecialty').value.trim() || specialty;
    const hospital = document.getElementById('new-doc-hospital').value;
    const clinicType = document.getElementById('new-doc-type').value;
    const phone = document.getElementById('new-doc-phone').value.trim();
    const area = document.getElementById('new-doc-area').value.trim() || 'المنصورة';
    const address = document.getElementById('new-doc-address').value.trim();
    const schedule = document.getElementById('new-doc-schedule').value.trim();
    const notes = document.getElementById('new-doc-notes').value.trim();

    if (!name || !phone || !address || !schedule) {
      showToast('يرجى ملء جميع الحقول المطلوبة', 'danger');
      return;
    }

    const digits = phone.replace(/[^\d]/g, '');
    const isMobile = digits.startsWith(('010', '011', '012', '015', '10', '11', '12', '15'));
    const wa = isMobile ? (digits.startsWith('0') ? '2' + digits : '20' + digits) : null;

    const newRecord = {
      id: 2000 + (Date.now() % 100000),
      hospital: hospital,
      specialty: specialty,
      subspecialty: subspecialty,
      raw_name: name,
      name: name.replace(/^(أ\.د|د|استشاري|أخصائي|مدرس|أستاذ)\s*/, '').trim(),
      academic_rank: subspecialty.includes('أستاذ') ? 'أ.د' : subspecialty.includes('استشاري') ? 'استشاري' : 'طبيب متخصص',
      clinic_type: clinicType,
      raw_phone: phone,
      phones: [{ display: phone, digits: digits, tel: digits, is_mobile: isMobile, whatsapp: wa }],
      address: address,
      city: area.includes('طلخا') ? 'طلخا' : area.includes('دكرنس') ? 'دكرنس' : 'المنصورة',
      area: area,
      schedule: schedule,
      notes: notes,
      is_department: name.startsWith(('قسم', 'وحدة', 'مركز', 'عيادة', 'معامل')),
      maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + address + ' المنصورة')}`,
      category: category,
      search_text: `${name} ${specialty} ${subspecialty} ${hospital} ${address} ${phone} ${schedule} ${notes}`
    };

    MedicalStorage.saveRecord(newRecord);
    loadData();

    showToast(`تمت إضافة "${name}" إلى المنظومة الطبية بنجاح!`, 'success', 3500);
    document.getElementById('form-add-doctor').reset();

    state.selectedSpecialty = 'all';
    state.selectedHospital = 'all';
    switchTab('doctors');
    renderDoctorsList();
  }

  function showDocDetails(docId) {
    const doc = state.doctors.find((d) => d.doctor_id === docId);
    if (!doc) return;

    state.selectedDoctor = doc;
    const specInfo = state.specialties.find((s) => s.name === doc.specialty) || {};

    const titleEl = document.getElementById('modal-sheet-title');
    const bodyEl = document.getElementById('modal-sheet-body');
    const footerEl = document.getElementById('modal-sheet-footer');

    if (titleEl) titleEl.textContent = 'بطاقة الطبيب التعريفية المعتمدة';

    let workplacesHtml = doc.workplaces.map((wp) => `
      <div class="modal-workplace-card">
        <div class="modal-workplace-title">
          <span><i class="fa-solid fa-hospital"></i> ${wp.hospital}</span>
          <span class="clinic-type-tag tag-external">${wp.clinic_type}</span>
        </div>
        <div class="card-details-list">
          <div class="detail-row">
            <i class="fa-solid fa-stethoscope"></i>
            <span>التخصص الدقيق: <strong>${wp.subspecialty || doc.specialty}</strong></span>
          </div>
          <div class="detail-row">
            <i class="fa-solid fa-location-dot"></i>
            <span>العنوان: <strong>${wp.address || 'بمقر المستشفى'}</strong></span>
          </div>
          <div class="detail-row">
            <i class="fa-solid fa-calendar-check"></i>
            <span>أيام وساعات العمل: <strong>${wp.schedule || 'حسب جدول مواعيد المستشفى'}</strong></span>
          </div>
          <div class="detail-row">
            <i class="fa-solid fa-phone"></i>
            <span>أرقام الحجز: <strong>${wp.raw_phone || 'عيادات المستشفى'}</strong></span>
          </div>
          ${wp.notes ? `
            <div class="detail-row">
              <i class="fa-solid fa-note-sticky"></i>
              <span>ملاحظات: <em>${wp.notes}</em></span>
            </div>
          ` : ''}
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.65rem;">
          ${wp.phones && wp.phones[0] && wp.phones[0].tel ? `
            <a href="tel:${wp.phones[0].tel}" class="btn-action-call" style="padding:0.4rem 0.75rem; border-radius:var(--radius-sm); font-size:0.8rem;">
              <i class="fa-solid fa-phone"></i> اتصال بالحجز (${wp.phones[0].display})
            </a>
          ` : ''}

          <a href="${wp.maps_url}" target="_blank" class="btn-action-map" style="padding:0.4rem 0.75rem; border-radius:var(--radius-sm); font-size:0.8rem;">
            <i class="fa-solid fa-map-location-dot"></i> الموقع على خرائط Google
          </a>

          <button class="btn-action-details" style="padding:0.4rem 0.75rem; border-radius:var(--radius-sm); font-size:0.8rem;" onclick="window.MedicalApp.copyText('${wp.address}', 'تم نسخ العنوان بنجاح')">
            <i class="fa-solid fa-copy"></i> نسخ العنوان
          </button>
        </div>
      </div>
    `).join('');

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="doctor-modal-profile">
          <div class="modal-avatar">
            <i class="fa-solid ${specInfo.icon || 'fa-user-doctor'}"></i>
          </div>
          <div class="modal-profile-text">
            <span class="doctor-academic-badge">${doc.academic_rank}</span>
            <h3>${doc.display_name}</h3>
            <p style="color:var(--text-secondary); font-size:0.85rem;">${doc.specialty}</p>
            <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.25rem;">
              <span style="color:var(--we-gold); font-weight:800; font-size:0.92rem;">★ ${doc.rating}</span>
              <span style="color:var(--text-muted); font-size:0.75rem;">(${doc.reviews_count} تقييم معتمد)</span>
            </div>
          </div>
        </div>

        <h4 style="font-family:var(--font-heading); margin-bottom:0.65rem; color:var(--we-purple-primary); font-size:1rem;">
          <i class="fa-solid fa-location-crosshairs"></i> مقار العمل والعيادات المعتمدة (${doc.workplaces.length})
        </h4>
        ${workplacesHtml}

        <div style="background:var(--bg-subtle); border-radius:var(--radius-md); padding:0.85rem; margin:1rem 0; text-align:center;">
          <h4 style="font-size:0.9rem; margin-bottom:0.4rem;"><i class="fa-solid fa-qrcode"></i> رمز QR للمشاركة السريعة</h4>
          <canvas id="doctor-qr-canvas" width="160" height="160" style="margin:0 auto; background:#fff; padding:6px; border-radius:var(--radius-sm); border:1px solid var(--border-color);"></canvas>
        </div>
      `;

      setTimeout(() => drawDoctorQR(doc), 50);
    }

    if (footerEl) {
      footerEl.innerHTML = `
        <button class="btn-action-wa" style="padding:0.5rem 0.95rem; border-radius:var(--radius-md); font-size:0.82rem;" onclick="window.MedicalApp.shareDoctor('${doc.doctor_id}')">
          <i class="fa-solid fa-share-nodes"></i> مشاركة البطاقة
        </button>
        <button class="btn-primary-purple" style="padding:0.5rem 1.15rem; border-radius:var(--radius-md); font-size:0.82rem;" onclick="window.MedicalApp.closeModal()">
          إغلاق
        </button>
      `;
    }

    openModal();
  }

  function drawDoctorQR(doc) {
    const canvas = document.getElementById('doctor-qr-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#370a68';

    const cellSize = 5;
    const str = `${doc.display_name}|${doc.specialty}|${doc.hospitals[0]}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);

    drawFinder(ctx, 12, 12, 32);
    drawFinder(ctx, w - 44, 12, 32);
    drawFinder(ctx, 12, h - 44, 32);

    for (let x = 12; x < w - 12; x += cellSize) {
      for (let y = 12; y < h - 12; y += cellSize) {
        if ((x < 48 && y < 48) || (x > w - 48 && y < 48) || (x < 48 && y > h - 48)) continue;
        if (((x * y + hash) % 7) === 0 || ((x + y * 3 + hash) % 5) === 0) {
          ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
        }
      }
    }

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6007e';
    ctx.font = 'bold 11px Cairo';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WE', w / 2, h / 2);
  }

  function drawFinder(ctx, x, y, size) {
    ctx.fillStyle = '#370a68';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
    ctx.fillStyle = '#370a68';
    ctx.fillRect(x + 8, y + 8, size - 16, size - 16);
  }

  function openSuggestModal() {
    const titleEl = document.getElementById('modal-sheet-title');
    const bodyEl = document.getElementById('modal-sheet-body');
    const footerEl = document.getElementById('modal-sheet-footer');

    if (titleEl) titleEl.textContent = 'اقتراح إضافة طبيب أو جهة طبية جديدة';

    if (bodyEl) {
      bodyEl.innerHTML = `
        <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:0.85rem;">
          حرصاً على شمولية المنظومة، يمكنك ترشيح أي طبيب أو عيادة أو معمل متميز بالدقهلية لمراجعتها وإضافتها للدليل.
        </p>
        <div class="form-grid">
          <div class="form-group full-width">
            <label class="form-label">اسم الطبيب أو الجهة المقترحة *</label>
            <input type="text" id="sug-name" class="form-input" required placeholder="مثال: د/ فلان الفلاني أو مركز كذا">
          </div>
          <div class="form-group">
            <label class="form-label">التخصص أو نوع الخدمة</label>
            <input type="text" id="sug-spec" class="form-input" placeholder="مثال: عظام / باطنة / معمل تحاليل">
          </div>
          <div class="form-group">
            <label class="form-label">رقم الهاتف أو الحجز</label>
            <input type="text" id="sug-phone" class="form-input" placeholder="رقم الموبايل أو العيادة">
          </div>
          <div class="form-group full-width">
            <label class="form-label">العنوان أو مكان العيادة</label>
            <input type="text" id="sug-address" class="form-input" placeholder="المنصورة / طلخا - اسم الشارع أو البرج">
          </div>
          <div class="form-group full-width">
            <label class="form-label">اسمك أو صفتك (اختياري)</label>
            <input type="text" id="sug-author" class="form-input" placeholder="زميل بالشركة المصرية للاتصالات WE">
          </div>
        </div>
      `;
    }

    if (footerEl) {
      footerEl.innerHTML = `
        <button class="btn-primary-purple" style="padding:0.55rem 1.15rem; border-radius:var(--radius-md); font-weight:800;" onclick="window.MedicalApp.submitSuggestion()">
          <i class="fa-solid fa-paper-plane"></i> إرسال المقترح للإدارة
        </button>
        <button class="btn-outline" style="padding:0.55rem 0.95rem; border-radius:var(--radius-md);" onclick="window.MedicalApp.closeModal()">
          إلغاء
        </button>
      `;
    }

    openModal();
  }

  function submitSuggestion() {
    const name = (document.getElementById('sug-name') || {}).value || '';
    if (!name.trim()) {
      showToast('يرجى كتابة اسم الطبيب أو الجهة المقترحة', 'danger');
      return;
    }
    const spec = (document.getElementById('sug-spec') || {}).value || '';
    const phone = (document.getElementById('sug-phone') || {}).value || '';
    const addr = (document.getElementById('sug-address') || {}).value || '';
    const author = (document.getElementById('sug-author') || {}).value || '';

    MedicalStorage.addSuggestion({
      name: name.trim(),
      specialty: spec.trim(),
      phone: phone.trim(),
      address: addr.trim(),
      suggestedBy: author.trim()
    });

    closeModal();
    showToast('شكراً لك! تم إرسال ترشيحك بنجاح وسيقوم مسؤولو النقابة بمراجعته', 'success', 4000);
    renderAdminStats();
  }

  function openApprovalEmailModal(hospitalName, email) {
    const titleEl = document.getElementById('modal-sheet-title');
    const bodyEl = document.getElementById('modal-sheet-body');
    const footerEl = document.getElementById('modal-sheet-footer');

    if (titleEl) titleEl.textContent = 'إرسال طلب موافقة طبية لموظف WE';

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div style="background:var(--we-purple-soft); padding:0.85rem; border-radius:var(--radius-md); margin-bottom:0.85rem; font-size:0.82rem; color:var(--we-purple-primary); line-height:1.4;">
          <strong><i class="fa-solid fa-circle-info"></i> بريد الموافقات المعتمد:</strong> ${email}<br>
          سيتم تجهيز رسالة بريد إلكتروني رسمية موجهة لإدارة المستشفى بالبيانات المطلوبة لسرعة إصدار الموافقة الطبية.
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">اسم الموظف / المستفيد بالكامل</label>
            <input type="text" id="appr-emp-name" class="form-input" placeholder="مثال: أحمد محمد علي">
          </div>
          <div class="form-group">
            <label class="form-label">الرقم الوظيفي أو القومي</label>
            <input type="text" id="appr-emp-id" class="form-input" placeholder="الرقم الوظيفي بشركة WE">
          </div>
          <div class="form-group full-width">
            <label class="form-label">الخدمة أو العملية الطبية المطلوبة</label>
            <input type="text" id="appr-service" class="form-input" placeholder="مثال: قسطرة قلب / أشعة مقطعية / عملية جراحية...">
          </div>
          <div class="form-group full-width">
            <label class="form-label">ملاحظات إضافية أو اسم الطبيب المعالج</label>
            <textarea id="appr-notes" class="form-textarea" placeholder="أي تفاصيل تود إرفاقها..."></textarea>
          </div>
        </div>
      `;
    }

    if (footerEl) {
      footerEl.innerHTML = `
        <button class="btn-accent-pink" style="padding:0.55rem 1.15rem; border-radius:var(--radius-md); font-weight:800;" onclick="window.MedicalApp.sendApprovalEmail('${email}', '${hospitalName}')">
          <i class="fa-solid fa-paper-plane"></i> فتح تطبيق البريد والإرسال
        </button>
        <button class="btn-outline" style="padding:0.55rem 0.95rem; border-radius:var(--radius-md);" onclick="window.MedicalApp.closeModal()">
          إلغاء
        </button>
      `;
    }

    openModal();
  }

  function sendApprovalEmail(toEmail, hospitalName) {
    const name = (document.getElementById('appr-emp-name') || {}).value || 'أحد الزملاء بالشركة';
    const empId = (document.getElementById('appr-emp-id') || {}).value || '';
    const service = (document.getElementById('appr-service') || {}).value || 'فحوصات طبية / استشارة';
    const notes = (document.getElementById('appr-notes') || {}).value || '';

    const subject = `طلب موافقة طبية - الشركة المصرية للاتصالات WE (${name})`;
    const body = `السادة إدارة الموافقات الطبية بـ ${hospitalName}،\n\nتحية طيبة وبعد،،\n\nيرجى التكرم بالموافقة على تقديم الخدمة الطبية التالية للعامل بالشركة المصرية للاتصالات:\n\n• اسم الموظف / المستفيد: ${name}\n• الرقم الوظيفي: ${empId}\n• الخدمة المطلوبة: ${service}\n• الجهة الطبية: ${hospitalName}\n• ملاحظات: ${notes}\n\nشاكرين لسيادتكم حسن تعاونكم،،\nاللجنة النقابية للعاملين بالمصرية للاتصالات بالدقهلية\nإعداد وتنفيذ المنظومة: أ / محمود العراقي`;

    window.location.href = `mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    closeModal();
    showToast('جاري فتح تطبيق البريد لإرسال طلب الموافقة', 'success', 3000);
  }

  function openModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  function shareDoctor(docId) {
    const doc = state.doctors.find((d) => d.doctor_id === docId);
    if (!doc) return;

    const shareData = {
      title: `${doc.display_name} - دليل WE الطبي بالدقهلية`,
      text: `${doc.display_name} (${doc.specialty}) - متاح في: ${doc.hospitals.join(' و ')}. إعداد: أ / محمود العراقي.`,
      url: window.location.href.split('#')[0] + `#doctors`
    };

    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      copyText(`${shareData.title}\n${shareData.text}`, 'تم نسخ تفاصيل الطبيب للمشاركة');
    }
  }

  function shareService(name, phone, address) {
    const text = `${name}\nالعنوان: ${address}\nالهاتف: ${phone}\nعبر منظومة دليل WE الطبي بالدقهلية`;
    if (navigator.share) {
      navigator.share({ title: name, text: text, url: window.location.href.split('#')[0] }).catch(() => {});
    } else {
      copyText(text, 'تم نسخ بيانات الخدمة الطبية بنجاح');
    }
  }

  function copyText(text, successMsg = 'تم النسخ بنجاح') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg, 'success', 2000);
      }).catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(successMsg, 'success', 2000);
    } catch (err) {
      showToast('تعذر النسخ تلقائياً', 'danger', 2000);
    }
    document.body.removeChild(textArea);
  }

  function handlePWAInstall() {
    if (state.deferredPrompt) {
      state.deferredPrompt.prompt();
      state.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          showToast('شكراً لتثبيت تطبيق دليل WE الطبي!', 'success', 3000);
        }
        state.deferredPrompt = null;
      });
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS) {
        showToast('لتثبيت التطبيق على iPhone: اضغط زر المشاركة (Share) أسفل المتصفح ثم اختر "إضافة إلى الشاشة الرئيسية"', 'info', 6000);
      } else {
        showToast('لتثبيت التطبيق: افتح قائمة المتصفح (⋮) ثم اختر "تثبيت التطبيق" أو "إضافة للشاشة الرئيسية"', 'info', 5000);
      }
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // Global API exposed to window
  window.MedicalApp = {
    switchTab,
    openSidebar,
    closeSidebar,
    showDocDetails,
    shareDoctor,
    shareService,
    copyText,
    openApprovalEmailModal,
    sendApprovalEmail,
    openSuggestModal,
    submitSuggestion,
    submitNewDoctor,
    closeModal,
    handleCategoryClick,
    openServiceFromSidebar,
    onCategoryChange(cat) {
      const specSelect = document.getElementById('new-doc-specialty');
      if (!specSelect) return;
      if (cat === 'labs') specSelect.innerHTML = '<option value="تحاليل طبية">تحاليل طبية ومناعة</option>';
      else if (cat === 'radiology') specSelect.innerHTML = '<option value="أشعة وتصوير طبي">أشعة وتصوير طبي ورنين</option>';
      else if (cat === 'pharmacies') specSelect.innerHTML = '<option value="صيدلية ودليفري">صيدليات وأدوية</option>';
      else populateAdminSpecialtyDropdown();
    },
    resetFilters() {
      state.searchQuery = '';
      state.selectedHospital = 'all';
      state.selectedSpecialty = 'all';
      state.selectedClinicType = 'all';
      state.sortBy = 'default';
      const input = document.getElementById('main-search-input');
      if (input) input.value = '';
      closeSidebar();
      renderSidebarHospitals();
      renderSidebarSpecialties();
      renderDoctorsList();
      showToast('تمت إعادة تعيين الفلاتر وعرض كافة الأطباء', 'info', 2000);
    },
    filterBySpecialty(specName) {
      state.selectedSpecialty = specName;
      renderSidebarSpecialties();
      switchTab('doctors');
      renderDoctorsList();
    },
    filterByHospital(hospShortName) {
      const match = Object.keys(state.hospitals).find(k => k.includes(hospShortName.replace('مستشفى ', ''))) || 'all';
      state.selectedHospital = match;
      renderSidebarHospitals();
      switchTab('doctors');
      renderDoctorsList();
    },
    loginAdmin() {
      const pin = (document.getElementById('admin-pin-input') || {}).value || '';
      if (AdminPanel.login(pin)) {
        showToast('تم تسجيل الدخول بنجاح', 'success', 2000);
        renderAdminView();
      } else {
        showToast('رمز الدخول غير صحيح (رمز المرور: we2026)', 'danger', 2500);
      }
    },
    logoutAdmin() {
      AdminPanel.logout();
      showToast('تم تسجيل الخروج من لوحة الإدارة', 'info', 1500);
      renderAdminView();
    },
    approveSuggestion(sugId) {
      const list = MedicalStorage.getSuggestions();
      const item = list.find(s => s.id === sugId);
      if (item) {
        document.querySelector('[data-admin-view="add-new"]').click();
        if (document.getElementById('new-doc-name')) document.getElementById('new-doc-name').value = item.name;
        if (document.getElementById('new-doc-phone')) document.getElementById('new-doc-phone').value = item.phone;
        if (document.getElementById('new-doc-address')) document.getElementById('new-doc-address').value = item.address;
        MedicalStorage.deleteSuggestion(sugId);
        renderAdminSuggestions();
        renderAdminStats();
        showToast('تم نقل بيانات المقترح إلى نموذج الإدراج لاستكمال الحفظ', 'info', 3000);
      }
    },
    rejectSuggestion(sugId) {
      MedicalStorage.deleteSuggestion(sugId);
      renderAdminSuggestions();
      renderAdminStats();
      showToast('تم حذف المقترح', 'info', 1500);
    },
    exportCSV() {
      AdminPanel.exportToCSV(state.records);
    },
    exportJSON() {
      AdminPanel.exportToJSON(MedicalStorage.exportFullBackup());
    },
    resetDataDefaults() {
      if (confirm('هل أنت متأكد من رغبتك في استعادة البيانات الأصلية وإلغاء أي تعديلات محلية؟')) {
        MedicalStorage.resetToDefaults();
        loadData();
        showToast('تمت استعادة بيانات Excel الأصلية بنجاح', 'success', 2500);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})(window);
