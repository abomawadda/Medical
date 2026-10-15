/* ====================================================================
 * WE Medical Directory - Main Application Controller (v3.0)
 * Prepared & Developed by: Mahmoud El-Eraky (أ / محمود العراقي)
 * Features:
 * - Contract Entity (مباشر من الشركة WE / مستشفى الحكمة / السلاب / الخير)
 * - Coverage Scope (شامل: العاملين + أسر العاملين جلوب ميد / العاملين فقط / جلوب ميد فقط)
 * - Dakahlia Markaz & City Filtering (16 مركز)
 * - Medical Procedures & Guidelines Guide (دليل التعليمات والإجراءات الطبية)
 * - Smart Employee Authentication (رقم الموبايل + آخر 4 أرقام من الرقم القومي)
 * - Digital Medical ID Card Modal
 * - Floating SOS Emergency Sheet (استغاثة وطوارئ عاجلة 24س)
 * - Smart Auto-Enrichment & GPS Linking for Admin additions
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
    selectedCoverageScope: 'all',   // 'all', 'employee_only', 'family_globemed'
    selectedContractEntity: 'all',  // 'all', 'مباشر من الشركة WE', 'تابع لمستشفى الحكمة', etc.
    selectedMarkaz: 'all',          // 'all', 'المنصورة', 'طلخا', 'ميت غمر', etc.
    selectedGuidelineTab: 'all',
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
    guidelines: [],
    dakahliaMarkaz: [],
    contractEntities: [],
    statsMatrix: {},
    metadata: {},
    currentUser: null,
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

    state.currentUser = MedicalStorage.getCurrentUser();

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
    state.dakahliaMarkaz = state.metadata.dakahlia_markaz || [];
    state.contractEntities = state.metadata.contract_entities || [];

    state.records = MedicalStorage.getLiveRecords();
    state.doctors = MedicalStorage.getLiveDoctors();
    state.guidelines = MedicalStorage.getGuidelines();
    state.emergencyServices = MedicalStorage.getEmergencyServices();

    updateAuthUI();
    renderHeroStats();
    renderUserCardBanner();
    renderHomeCategories();
    renderHomeHospitals();
    renderSidebarHospitals();
    renderSidebarSpecialties();
    renderSidebarMarkaz();
    renderSidebarContracts();
    populateMarkazDropdowns();
    renderSpecialtiesView();
    renderHospitalsView();
    renderServicesView();
    renderGuidelinesView();
    renderEmergencyView();
    populateAdminSpecialtyDropdown();
    renderAdminStats();
  }

  function setupEventListeners() {
    // Search input (persistent & non-blurring)
    const searchInput = document.getElementById('main-search-input');
    const searchClear = document.getElementById('search-clear-btn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (searchClear) searchClear.classList.toggle('visible', !!e.target.value);
        if (state.searchQuery.trim().length > 0) {
          if (state.currentTab !== 'doctors') {
            switchTab('doctors', false);
          } else {
            renderDoctorsList();
          }
        } else {
          renderDoctorsList();
        }
      });

      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (state.searchQuery.trim()) {
            MedicalStorage.addRecentSearch(state.searchQuery.trim());
          }
          if (state.currentTab !== 'doctors') switchTab('doctors', false);
          renderDoctorsList();
        }
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
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

    // Guidelines Sub-tabs
    document.querySelectorAll('[data-guide-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-guide-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedGuidelineTab = btn.getAttribute('data-guide-tab');
        renderGuidelinesView();
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

        if (viewId === 'manage-distress') renderAdminDistressList();
        if (viewId === 'manage-guidelines') renderAdminGuidelinesList();
        if (viewId === 'manage-employees') renderAdminEmployeesList();
      });
    });

    // Theme toggle
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
    });

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

  function switchTab(tabId, shouldScroll = true) {
    state.currentTab = tabId;

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', `#${tabId}`);
    } else {
      window.location.hash = tabId;
    }

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
      if (shouldScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    // Toggle search section: hide on admin view, keep visible everywhere else
    const searchSec = document.querySelector('.search-section');
    if (searchSec) {
      searchSec.style.display = (tabId === 'admin') ? 'none' : 'block';
    }

    if (tabId === 'doctors') {
      renderDoctorsList();
    } else if (tabId === 'guidelines') {
      renderGuidelinesView();
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
    const validTabs = ['home', 'doctors', 'guidelines', 'specialties', 'services', 'hospitals', 'favorites', 'emergency', 'admin'];
    if (validTabs.includes(hash)) {
      switchTab(hash);
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    MedicalStorage.setTheme(next);
    updateThemeIcon(next);
    showToast(next === 'dark' ? 'تم تفعيل الوضع الليلي' : 'تم تفعيل الوضع النهاري', 'info', 1500);
  }

  function updateThemeIcon(theme) {
    const btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (!icon) return;
    if (theme === 'dark') {
      icon.className = 'fa-solid fa-sun';
      icon.style.color = '#F59E0B';
    } else {
      icon.className = 'fa-solid fa-moon';
      icon.style.color = '';
    }
  }

  // --- Authentication & User Profile UI ---
  function updateAuthUI() {
    const authBtn = document.getElementById('header-auth-btn');
    const authText = document.getElementById('header-auth-text');
    if (!authBtn || !authText) return;

    if (state.currentUser) {
      authBtn.classList.add('logged-in');
      const firstName = state.currentUser.name.split(' ')[0] || state.currentUser.name;
      authText.textContent = firstName;
      authBtn.title = `الموظف: ${state.currentUser.name} (${state.currentUser.sector || 'WE'}) - اضغط لعرض بطاقتك الطبية`;
    } else {
      authBtn.classList.remove('logged-in');
      authText.textContent = 'دخول العاملين';
      authBtn.title = 'تسجيل الدخول برقم الموبايل وآخر 4 أرقام قومي';
    }
  }

  function renderUserCardBanner() {
    const container = document.getElementById('home-user-card-banner');
    if (!container) return;

    if (!state.currentUser) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    const u = state.currentUser;
    container.style.display = 'block';
    container.innerHTML = `
      <div style="background: linear-gradient(135deg, var(--we-purple-dark), var(--we-purple-primary)); color:#fff; border-radius: var(--radius-lg); padding: 0.9rem 1.15rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.65rem; box-shadow: var(--shadow-sm); border:1px solid rgba(255,255,255,0.15);">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <div style="width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:1.15rem; color:#fff;">
            <i class="fa-solid fa-user-check"></i>
          </div>
          <div>
            <div style="font-size:0.75rem; opacity:0.85;">مرحباً بك زميلنا العزيز:</div>
            <strong style="font-size:0.95rem; font-family:var(--font-heading);">${u.name}</strong>
            <span style="font-size:0.72rem; opacity:0.85; margin-right:0.4rem;">(${u.sector || 'WE الدقهلية'})</span>
          </div>
        </div>
        <div style="display:flex; gap:0.4rem;">
          <button class="btn-accent-pink" style="padding:0.35rem 0.75rem; border-radius:var(--radius-full); font-size:0.75rem; font-weight:800;" onclick="window.MedicalApp.openEmployeeCardModal()">
            <i class="fa-solid fa-id-card"></i> بطاقتي الطبية
          </button>
          <button class="btn-outline" style="padding:0.35rem 0.6rem; border-radius:var(--radius-full); font-size:0.75rem; background:rgba(255,255,255,0.1); color:#fff; border-color:rgba(255,255,255,0.3);" onclick="window.MedicalApp.logoutEmployee()">
            <i class="fa-solid fa-right-from-bracket"></i>
          </button>
        </div>
      </div>
    `;
  }

  // --- Network Scope, Markaz & Contract Filters ---
  function setCoverageScope(scope) {
    state.selectedCoverageScope = scope;
    document.querySelectorAll('[data-scope]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-scope') === scope);
    });

    renderDoctorsList();
    renderServicesView();

    let label = 'كافة السجلات (شامل)';
    if (scope === 'employee_only') label = 'العاملين بالشركة فقط';
    if (scope === 'family_globemed') label = 'أسر العاملين (شبكة جلوب ميد)';
    showToast(`تم التصفية: ${label}`, 'info', 2000);
  }

  function onMarkazSelectChange(markaz) {
    state.selectedMarkaz = markaz;
    renderDoctorsList();
  }

  function onContractSelectChange(contract) {
    state.selectedContractEntity = contract;
    renderDoctorsList();
  }

  function populateMarkazDropdowns() {
    const filterSelect = document.getElementById('filter-markaz-select');
    const formSelect = document.getElementById('new-doc-markaz');

    const optionsHtml = state.dakahliaMarkaz.map(m => `<option value="${m}">${m}</option>`).join('');

    if (filterSelect) {
      filterSelect.innerHTML = `<option value="all">📍 كافة مراكز الدقهلية (${state.dakahliaMarkaz.length})</option>` + optionsHtml;
    }
    if (formSelect) {
      formSelect.innerHTML = optionsHtml;
    }
  }

  // Sidebar Renderers
  function openSidebar() {
    const sidebar = document.getElementById('mobile-filter-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.add('active');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    const sidebar = document.getElementById('mobile-filter-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  function renderSidebarHospitals() {
    const container = document.getElementById('sidebar-hospitals-list');
    if (!container) return;

    const hosps = Object.values(state.hospitals);
    container.innerHTML = hosps.map((h) => {
      const short = h.short_name.replace('مستشفى ', '');
      const count = state.records.filter(r => r.hospital.includes(short)).length;
      const isActive = state.selectedHospital.includes(short);
      return `
        <button class="sidebar-item-btn ${isActive ? 'active' : ''}" onclick="window.MedicalApp.filterByHospital('${h.short_name}'); window.MedicalApp.closeSidebar();">
          <div class="sidebar-item-left">
            <i class="fa-solid fa-hospital" style="color:${h.color}"></i>
            <span>${h.short_name}</span>
          </div>
          <span class="sidebar-item-badge">${count} طبيب</span>
        </button>
      `;
    }).join('');
  }

  function renderSidebarSpecialties() {
    const container = document.getElementById('sidebar-specialties-list');
    if (!container) return;

    container.innerHTML = state.specialties.map((s) => {
      const isActive = state.selectedSpecialty === s.name;
      return `
        <button class="sidebar-item-btn ${isActive ? 'active' : ''}" onclick="window.MedicalApp.filterBySpecialty('${s.name}'); window.MedicalApp.closeSidebar();">
          <div class="sidebar-item-left">
            <i class="fa-solid ${s.icon || 'fa-stethoscope'}" style="color:${s.color || '#5B2C82'}"></i>
            <span>${s.name}</span>
          </div>
          <span class="sidebar-item-badge">${s.total_records}</span>
        </button>
      `;
    }).join('');
  }

  function renderSidebarMarkaz() {
    const container = document.getElementById('sidebar-markaz-list');
    if (!container) return;

    container.innerHTML = state.dakahliaMarkaz.map((m) => {
      const count = state.records.filter(r => (r.markaz === m || r.city === m || (r.address && r.address.includes(m)))).length;
      const isActive = state.selectedMarkaz === m;
      return `
        <button class="sidebar-item-btn ${isActive ? 'active' : ''}" onclick="window.MedicalApp.filterByMarkaz('${m}'); window.MedicalApp.closeSidebar();">
          <div class="sidebar-item-left">
            <i class="fa-solid fa-location-dot" style="color:#0288d1"></i>
            <span>${m}</span>
          </div>
          <span class="sidebar-item-badge">${count || 'متاح'}</span>
        </button>
      `;
    }).join('');
  }

  function renderSidebarContracts() {
    const container = document.getElementById('sidebar-contracts-list');
    if (!container) return;

    const contracts = [
      { id: 'all', name: 'كافة جهات التعاقد', icon: 'fa-globe', color: '#5B2C82' },
      { id: 'مباشر من الشركة WE', name: 'مباشر من الشركة WE', icon: 'fa-building-shield', color: '#00838F' },
      { id: 'تابع لمستشفى الحكمة', name: 'مستشفى الحكمة', icon: 'fa-hospital', color: '#7B1FA2' },
      { id: 'تابع لمستشفى الجزيرة (السلاب)', name: 'مستشفى الجزيرة (السلاب)', icon: 'fa-hospital', color: '#5B2C82' },
      { id: 'تابع لمستشفى الخير', name: 'مستشفى الخير', icon: 'fa-hospital', color: '#4A148C' }
    ];

    container.innerHTML = contracts.map((c) => {
      const isActive = state.selectedContractEntity === c.id;
      return `
        <button class="sidebar-item-btn ${isActive ? 'active' : ''}" onclick="window.MedicalApp.filterByContract('${c.id}'); window.MedicalApp.closeSidebar();">
          <div class="sidebar-item-left">
            <i class="fa-solid ${c.icon}" style="color:${c.color}"></i>
            <span>${c.name}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  // --- Home Screen Stats & Categories ---
  function renderHeroStats() {
    const totalRecsEl = document.getElementById('hero-stat-records');
    const totalDocsEl = document.getElementById('hero-stat-doctors');
    const totalSpecsEl = document.getElementById('hero-stat-specs');
    const totalHospsEl = document.getElementById('hero-stat-hosps');

    if (totalRecsEl) totalRecsEl.textContent = state.records.length || 169;
    if (totalDocsEl) totalDocsEl.textContent = state.doctors.length || 156;
    if (totalSpecsEl) totalSpecsEl.textContent = state.specialties.length || 14;
    if (totalHospsEl) totalHospsEl.textContent = Object.keys(state.hospitals).length || 3;
  }

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

  // --- Doctor Filtering & Rendering ---
  function filterDoctors() {
    const q = normalizeArabic(state.searchQuery);
    const selHosp = state.selectedHospital;
    const selSpec = state.selectedSpecialty;
    const selType = state.selectedClinicType;
    const selScope = state.selectedCoverageScope;
    const selContract = state.selectedContractEntity;
    const selMarkaz = state.selectedMarkaz;

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

      // Coverage Scope Filter (العاملين / أسر جلوب ميد)
      if (selScope !== 'all') {
        const matchesScope = doc.workplaces.some((w) => {
          if (selScope === 'employee_only') return w.coverage_scope === 'both' || w.coverage_scope === 'employee_only';
          if (selScope === 'family_globemed') return w.coverage_scope === 'both' || w.coverage_scope === 'family_globemed';
          return true;
        });
        if (!matchesScope) return false;
      }

      // Contract Entity Filter
      if (selContract !== 'all') {
        const matchesContract = doc.workplaces.some((w) => {
          const ce = w.contract_entity || '';
          return ce.includes(selContract) || (selContract === 'direct_we' && ce.includes('مباشر'));
        });
        if (!matchesContract) return false;
      }

      // Markaz Filter
      if (selMarkaz !== 'all') {
        const matchesMarkaz = doc.workplaces.some((w) => (w.markaz === selMarkaz || w.city === selMarkaz || (w.address && w.address.includes(selMarkaz))));
        if (!matchesMarkaz) return false;
      }

      if (q) {
        const docText = normalizeArabic(`
          ${doc.name} ${doc.display_name} ${doc.specialty} ${doc.subspecialties.join(' ')}
          ${doc.hospitals.join(' ')} ${doc.cities.join(' ')} ${doc.contract_entities ? doc.contract_entities.join(' ') : ''}
          ${doc.workplaces.map(w => `${w.address} ${w.area} ${w.clinic_type} ${w.raw_phone} ${w.schedule} ${w.markaz || ''} ${w.contract_entity || ''}`).join(' ')}
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
      } else if (state.selectedMarkaz !== 'all') {
        badgeEl.textContent = `مركز ${state.selectedMarkaz} (${filtered.length} طبيب) — اضغط للتغيير`;
      } else if (state.searchQuery) {
        badgeEl.textContent = `بحث: "${state.searchQuery}" (${filtered.length} نتيجة)`;
      } else {
        badgeEl.textContent = `كافة الأطباء والعيادات (${filtered.length}) — اضغط للتصفية`;
      }
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon"><i class="fa-solid fa-user-doctor"></i></div>
          <h3>لا توجد نتائج مطابقة لاختيارك</h3>
          <p>جرّب اختيار مركز آخر أو إلغاء بعض الفلاتر من الشريط الجانبي.</p>
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

        <!-- Badges Row: Contract Entity, Coverage Scope & Markaz -->
        <div class="card-badges-row">
          <span class="badge-contract-entity wp-contract-badge"><i class="fa-solid fa-handshake"></i> ${primaryWp.contract_entity || 'مباشر من الشركة WE'}</span>
          <span class="badge-coverage-scope ${primaryWp.coverage_scope === 'family_globemed' ? 'family-only' : ''} wp-scope-badge">
            <i class="fa-solid ${primaryWp.coverage_scope === 'family_globemed' ? 'fa-people-roof' : (primaryWp.coverage_scope === 'employee_only' ? 'fa-user-tie' : 'fa-circle-check')}"></i>
            ${primaryWp.coverage_label || 'شامل: العاملين + أسر جلوب ميد'}
          </span>
          <span class="badge-markaz wp-markaz-badge"><i class="fa-solid fa-map-pin"></i> ${primaryWp.markaz || primaryWp.city || 'المنصورة'}</span>
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
            <button class="btn-action btn-action-call" onclick="window.MedicalApp.copyText('${primaryWp.raw_phone}', 'تم نسخ رقم الهاتف')" title="نسخ الرقم">
              <i class="fa-solid fa-phone"></i>
              <span>الهاتف</span>
            </button>
          `}

          ${waPhone ? `
            <a href="https://wa.me/${waPhone}" target="_blank" class="btn-action btn-action-wa" title="واتساب">
              <i class="fa-brands fa-whatsapp"></i>
              <span>واتساب</span>
            </a>
          ` : `
            <button class="btn-action btn-action-wa" onclick="window.MedicalApp.shareDoctor('${doc.doctor_id}')" title="مشاركة البطاقة">
              <i class="fa-solid fa-share-nodes"></i>
              <span>مشاركة</span>
            </button>
          `}

          <a href="${primaryWp.maps_url}" target="_blank" class="btn-action btn-action-map wp-map-link" title="الموقع على Google Maps">
            <i class="fa-solid fa-map-location-dot"></i>
            <span>الخريطة</span>
          </a>

          <button class="btn-action btn-action-details" onclick="window.MedicalApp.showDocDetails('${doc.doctor_id}')" title="تفاصيل كاملة">
            <i class="fa-solid fa-circle-info"></i>
            <span>التفاصيل</span>
          </button>
        </div>
      </div>
    `;
  }

  function attachDoctorCardEvents(container) {
    // Workplace tab switcher
    container.querySelectorAll('.workplace-tabs-nav').forEach((nav) => {
      const card = nav.closest('.doctor-card');
      const docId = card.getAttribute('data-doc-id');
      const doc = state.doctors.find((d) => d.doctor_id === docId);
      if (!doc) return;

      nav.querySelectorAll('.wp-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          nav.querySelectorAll('.wp-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const idx = Number(btn.getAttribute('data-wp-idx'));
          const wp = doc.workplaces[idx];
          if (!wp) return;

          card.querySelector('.wp-hosp-text').textContent = wp.hospital;
          card.querySelector('.wp-type-text').textContent = wp.clinic_type;
          card.querySelector('.wp-address-text').textContent = wp.address || 'بمقر المستشفى';
          card.querySelector('.wp-schedule-text').textContent = wp.schedule || 'حسب جدول المواعيد';
          card.querySelector('.wp-phone-text').textContent = wp.raw_phone || 'عيادات المستشفى';
          
          const contractBadge = card.querySelector('.wp-contract-badge');
          if (contractBadge) contractBadge.innerHTML = `<i class="fa-solid fa-handshake"></i> ${wp.contract_entity || 'مباشر من الشركة WE'}`;
          
          const scopeBadge = card.querySelector('.wp-scope-badge');
          if (scopeBadge) scopeBadge.innerHTML = `<i class="fa-solid ${wp.coverage_scope === 'family_globemed' ? 'fa-people-roof' : (wp.coverage_scope === 'employee_only' ? 'fa-user-tie' : 'fa-circle-check')}"></i> ${wp.coverage_label || 'شامل: العاملين + أسر جلوب ميد'}`;
          
          const markazBadge = card.querySelector('.wp-markaz-badge');
          if (markazBadge) markazBadge.innerHTML = `<i class="fa-solid fa-map-pin"></i> ${wp.markaz || wp.city || 'المنصورة'}`;

          const mapLink = card.querySelector('.wp-map-link');
          if (mapLink) mapLink.href = wp.maps_url;
        });
      });
    });

    // Favorite toggle button
    container.querySelectorAll('.btn-card-fav').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const docId = btn.getAttribute('data-fav-id');
        const isFav = MedicalStorage.toggleFavorite(docId);
        btn.classList.toggle('active', isFav);
        const icon = btn.querySelector('i');
        if (icon) icon.className = `fa-${isFav ? 'solid' : 'regular'} fa-heart`;
        showToast(isFav ? 'تمت إضافة الطبيب إلى المفضلة' : 'تمت الإزالة من المفضلة', isFav ? 'success' : 'info', 2000);
      });
    });
  }

  // --- Guidelines & Procedures View ---
  function renderGuidelinesView() {
    const container = document.getElementById('guidelines-view-container');
    if (!container) return;

    const tab = state.selectedGuidelineTab;
    let list = state.guidelines;
    if (tab !== 'all') {
      list = list.filter(g => g.category === tab);
    }

    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><h3>لا توجد نشرات مسجلة في هذا القسم</h3></div>`;
      return;
    }

    container.innerHTML = list.map((g) => `
      <div class="guideline-card">
        <div class="guideline-header">
          <div class="guideline-icon">
            <i class="fa-solid ${g.icon || 'fa-book-medical'}"></i>
          </div>
          <div class="guideline-title-group">
            <span class="guideline-badge">${g.badge || 'إجراء معتمد'}</span>
            <h3>${g.title}</h3>
          </div>
        </div>
        <p class="guideline-summary">${g.summary}</p>
        <div class="guideline-steps-list">
          ${(g.steps || []).map((step, idx) => `
            <div class="guideline-step-item">
              <span class="guideline-step-num">${idx + 1}</span>
              <div>${step}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  // --- Services View ---
  function renderServicesView() {
    const container = document.getElementById('services-grid-container');
    if (!container) return;

    let items = [];
    const tab = state.selectedServiceTab;
    const scope = state.selectedCoverageScope;

    if (tab === 'all' || tab === 'labs') items = items.concat(state.labs);
    if (tab === 'all' || tab === 'radiology') items = items.concat(state.radiology);
    if (tab === 'all' || tab === 'pharmacies') items = items.concat(state.pharmacies);
    if (tab === 'all' || tab === 'specialized') items = items.concat(state.specializedCenters);

    // Apply Scope Filter
    if (scope !== 'all') {
      items = items.filter(item => {
        if (scope === 'employee_only') return item.coverage_scope === 'both' || item.coverage_scope === 'employee_only';
        if (scope === 'family_globemed') return item.coverage_scope === 'both' || item.coverage_scope === 'family_globemed';
        return true;
      });
    }

    // Apply Markaz Filter
    if (state.selectedMarkaz !== 'all') {
      items = items.filter(item => item.markaz === state.selectedMarkaz || item.city === state.selectedMarkaz || (item.address && item.address.includes(state.selectedMarkaz)));
    }

    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><h3>لا توجد خدمات مطابقة للاختيار</h3></div>`;
      return;
    }

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
              <div class="doctor-specialty-sub">${item.markaz || item.city}</div>
            </div>
          </div>

          <div class="card-badges-row">
            <span class="badge-contract-entity"><i class="fa-solid fa-handshake"></i> ${item.contract_entity || 'مباشر من الشركة WE'}</span>
            <span class="badge-coverage-scope"><i class="fa-solid fa-circle-check"></i> ${item.coverage_label || 'شامل: العاملين + أسر جلوب ميد'}</span>
            <span class="badge-markaz"><i class="fa-solid fa-map-pin"></i> ${item.markaz || item.city || 'المنصورة'}</span>
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

  // --- Emergency View ---
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

  // --- Favorites & Hospitals Views ---
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
            <p class="hosp-desc-p">${h.description}</p>

            <div class="hosp-meta-grid">
              <div class="hosp-meta-item">
                <i class="fa-solid fa-clock"></i>
                <div>
                  <strong>مواعيد وساعات العمل</strong>
                  <span>${h.working_hours}</span>
                </div>
              </div>
              <div class="hosp-meta-item">
                <i class="fa-solid fa-user-doctor"></i>
                <div>
                  <strong>العيادات والأطباء بالدليل</strong>
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

  // --- Modals: Doctor Details, SOS, Login, Employee Card ---
  function showDocDetails(docId) {
    const doc = state.doctors.find((d) => d.doctor_id === docId);
    if (!doc) return;
    state.selectedDoctor = doc;

    const titleEl = document.getElementById('modal-sheet-title');
    const bodyEl = document.getElementById('modal-sheet-body');
    const footerEl = document.getElementById('modal-sheet-footer');

    if (titleEl) titleEl.textContent = doc.display_name;

    const workplacesHtml = doc.workplaces.map((wp, i) => `
      <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.85rem; margin-bottom:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
          <strong style="color:var(--we-purple-primary); font-size:0.95rem;">${wp.hospital}</strong>
          <span class="clinic-type-tag" style="font-size:0.72rem;">${wp.clinic_type}</span>
        </div>
        <div class="card-badges-row" style="margin-bottom:0.4rem;">
          <span class="badge-contract-entity">${wp.contract_entity}</span>
          <span class="badge-coverage-scope">${wp.coverage_label}</span>
          <span class="badge-markaz">${wp.markaz || wp.city}</span>
        </div>
        <div style="font-size:0.82rem; color:var(--text-secondary); line-height:1.45;">
          <div><i class="fa-solid fa-location-dot"></i> ${wp.address || 'بمقر المستشفى'}</div>
          <div><i class="fa-solid fa-calendar-days"></i> ${wp.schedule}</div>
          <div><i class="fa-solid fa-phone"></i> ${wp.raw_phone}</div>
          ${wp.notes ? `<div style="color:var(--we-pink-accent); font-weight:700;"><i class="fa-solid fa-circle-exclamation"></i> ${wp.notes}</div>` : ''}
        </div>
      </div>
    `).join('');

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div style="text-align:center; margin-bottom:1rem;">
          <div class="doctor-academic-badge" style="display:inline-block; margin-bottom:0.35rem;">${doc.academic_rank}</div>
          <h2 style="font-family:var(--font-heading); font-size:1.35rem; color:var(--we-purple-dark);">${doc.display_name}</h2>
          <div style="color:var(--we-pink-accent); font-weight:700; font-size:0.9rem;">${doc.specialty}</div>
        </div>

        <h4 style="font-family:var(--font-heading); margin-bottom:0.65rem; color:var(--we-purple-primary); font-size:1rem;">
          <i class="fa-solid fa-location-crosshairs"></i> مقار العمل والعيادات المعتمدة (${doc.workplaces.length})
        </h4>
        ${workplacesHtml}
      `;
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

  // --- SOS Emergency Modal ---
  function openSOSModal() {
    const titleEl = document.getElementById('modal-sheet-title');
    const bodyEl = document.getElementById('modal-sheet-body');
    const footerEl = document.getElementById('modal-sheet-footer');

    if (titleEl) titleEl.innerHTML = '<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> خطوط الاستغاثة والطوارئ العاجلة 24س</span>';

    if (bodyEl) {
      bodyEl.innerHTML = `
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.75rem;">
          خدمة طارئة مخصصة لإنقاذ الزملاء وأسرهم في الحالات الحرجة. اضغط على أي جهة للاتصال المباشر فوراً:
        </p>

        <div class="sos-actions-grid">
          <a href="tel:123" class="sos-action-card hot">
            <div class="sos-card-icon" style="background:#dc2626;"><i class="fa-solid fa-truck-medical"></i></div>
            <div class="sos-card-info">
              <h4>إسعاف مصر المركزي (123)</h4>
              <p>طلب سيارة إسعاف مجهزة فوري للحالات الحرجة</p>
            </div>
          </a>

          <a href="tel:01000000001" class="sos-action-card hot">
            <div class="sos-card-icon" style="background:#5B2C82;"><i class="fa-solid fa-user-shield"></i></div>
            <div class="sos-card-info">
              <h4>مسؤول الرعاية بالنقابة (أ / محمود العراقي)</h4>
              <p>تسهيل الدخول وحل معوقات التأمين والمستشفيات</p>
            </div>
          </a>

          <a href="tel:0502301555" class="sos-action-card">
            <div class="sos-card-icon" style="background:#C2185B;"><i class="fa-solid fa-heart-pulse"></i></div>
            <div class="sos-card-info">
              <h4>طوارئ قسطرة القلب 24س (مستشفى الخير)</h4>
              <p>الدور التاسع - فريق استشاري متأهب 24 ساعة</p>
            </div>
          </a>

          <a href="tel:0502209112" class="sos-action-card">
            <div class="sos-card-icon" style="background:#5B2C82;"><i class="fa-solid fa-hospital"></i></div>
            <div class="sos-card-info">
              <h4>طوارئ مستشفى السلاب (050/2209112)</h4>
              <p>استقبال طوارئ وعناية مركزة واستعلام موحد</p>
            </div>
          </a>

          <a href="tel:0502260709" class="sos-action-card">
            <div class="sos-card-icon" style="background:#7B1FA2;"><i class="fa-solid fa-hospital-user"></i></div>
            <div class="sos-card-info">
              <h4>طوارئ واستقبال مستشفى الحكمة</h4>
              <p>طوارئ واستعلام عيادات مستشفى الحكمة بالمنصورة</p>
            </div>
          </a>

          <a href="tel:0502250100" class="sos-action-card">
            <div class="sos-card-icon" style="background:#10B981;"><i class="fa-solid fa-prescription-bottle-medical"></i></div>
            <div class="sos-card-info">
              <h4>صيدلية الإسعاف طوارئ 24س بالمنصورة</h4>
              <p>أدوية طوارئ وأمصال نادرة على مدار الساعة</p>
            </div>
          </a>

          <a href="tel:16120" class="sos-action-card">
            <div class="sos-card-icon" style="background:#0288D1;"><i class="fa-solid fa-id-card"></i></div>
            <div class="sos-card-info">
              <h4>خط ساخن جلوب ميد للأسرة (16120)</h4>
              <p>استعلام وموافقات شبكة أسر العاملين المعتمدة</p>
            </div>
          </a>

          <a href="tel:0502301980" class="sos-action-card">
            <div class="sos-card-icon" style="background:#B71C1C;"><i class="fa-solid fa-droplet"></i></div>
            <div class="sos-card-info">
              <h4>بنك الدم الإقليمي بالمنصورة</h4>
              <p>توفير فصائل الدم ومشتقات البلازما للحالات العاجلة</p>
            </div>
          </a>
        </div>
      `;
    }

    if (footerEl) {
      footerEl.innerHTML = `
        <button class="btn-outline" style="padding:0.55rem 1.25rem; border-radius:var(--radius-md);" onclick="window.MedicalApp.closeModal()">
          إغلاق
        </button>
      `;
    }

    openModal();
  }

  // --- Authentication Modal (Mobile + Last 4 Digits of National ID) ---
  function openAuthModal() {
    if (state.currentUser) {
      openEmployeeCardModal();
      return;
    }

    const titleEl = document.getElementById('modal-sheet-title');
    const bodyEl = document.getElementById('modal-sheet-body');
    const footerEl = document.getElementById('modal-sheet-footer');

    if (titleEl) titleEl.textContent = 'تسجيل دخول العاملين بالشركة المصرية للاتصالات بالدقهلية';

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div style="background:var(--we-purple-soft); padding:0.85rem; border-radius:var(--radius-md); margin-bottom:1rem; font-size:0.82rem; color:var(--we-purple-primary); line-height:1.45;">
          <strong><i class="fa-solid fa-shield-halved"></i> تسجيل فوري بدون إنشاء حساب:</strong><br>
          الدخول مخصص للزملاء العاملين وأعضاء النقابة بالدقهلية برقم الموبايل المسجل وآخر 4 أرقام من الرقم القومي للاطلاع على بطاقة التغطية الطبية والخدمات المخصصة.
        </div>

        <div class="form-grid">
          <div class="form-group full-width">
            <label class="form-label">رقم الموبايل المسجل بالمنظومة *</label>
            <input type="tel" id="auth-phone-input" class="form-input" placeholder="مثال: 01012345678" style="font-size:1rem; letter-spacing:1px; text-align:center;">
          </div>
          <div class="form-group full-width">
            <label class="form-label">آخر 4 أرقام من الرقم القومي للموظف *</label>
            <input type="password" maxlength="4" id="auth-national-input" class="form-input" placeholder="••••" style="font-size:1.25rem; letter-spacing:4px; text-align:center;">
          </div>
        </div>

        <div style="margin-top:1.15rem; background:var(--bg-subtle); padding:0.85rem; border-radius:var(--radius-md); border:1px solid var(--border-color);">
          <div style="font-size:0.75rem; font-weight:800; color:var(--text-secondary); margin-bottom:0.45rem;">
            ⚡ تجربة سريعة بنقرة واحدة (حسابات تجريبية معتمدة):
          </div>
          <div style="display:flex; flex-direction:column; gap:0.4rem;">
            <button class="btn-outline" style="text-align:right; padding:0.4rem 0.65rem; font-size:0.75rem; border-radius:var(--radius-sm);" onclick="window.MedicalApp.fillDemoLogin('01000000001', '2026')">
              👑 <strong>أ / محمود العراقي</strong> (مسؤول النقابة والرعاية الطبية - صلاحيات كاملة)
            </button>
            <button class="btn-outline" style="text-align:right; padding:0.4rem 0.65rem; font-size:0.75rem; border-radius:var(--radius-sm);" onclick="window.MedicalApp.fillDemoLogin('01012345678', '1234')">
              👔 <strong>م / أحمد إبراهيم السيد</strong> (سنترال المنصورة غرب - تغطية شاملة وأسرة جلوب ميد)
            </button>
            <button class="btn-outline" style="text-align:right; padding:0.4rem 0.65rem; font-size:0.75rem; border-radius:var(--radius-sm);" onclick="window.MedicalApp.fillDemoLogin('01098765432', '5678')">
              👔 <strong>أ / محمد حسن الشربيني</strong> (سنترال ميت غمر - خدمة عملاء)
            </button>
          </div>
        </div>
      `;
    }

    if (footerEl) {
      footerEl.innerHTML = `
        <button class="btn-primary-purple" style="padding:0.6rem 1.35rem; border-radius:var(--radius-md); font-weight:800;" onclick="window.MedicalApp.loginEmployeeFromModal()">
          <i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول والتحقق
        </button>
        <button class="btn-outline" style="padding:0.6rem 1rem; border-radius:var(--radius-md);" onclick="window.MedicalApp.closeModal()">
          إلغاء
        </button>
      `;
    }

    openModal();
  }

  function fillDemoLogin(phone, last4) {
    const p = document.getElementById('auth-phone-input');
    const n = document.getElementById('auth-national-input');
    if (p) p.value = phone;
    if (n) n.value = last4;
  }

  function loginEmployeeFromModal() {
    const phone = (document.getElementById('auth-phone-input') || {}).value || '';
    const last4 = (document.getElementById('auth-national-input') || {}).value || '';

    const res = MedicalStorage.loginEmployee(phone, last4);
    if (res.success) {
      state.currentUser = res.user;
      updateAuthUI();
      renderUserCardBanner();
      closeModal();
      showToast(`مرحباً بك زميلنا العزيز: ${res.user.name}`, 'success', 3000);

      if (res.user.role === 'admin') {
        AdminPanel.login('we2026');
        switchTab('admin');
      }
    } else {
      showToast(res.message, 'danger', 3500);
    }
  }

  function logoutEmployee() {
    MedicalStorage.logoutEmployee();
    state.currentUser = null;
    updateAuthUI();
    renderUserCardBanner();
    showToast('تم تسجيل الخروج بنجاح', 'info', 2000);
  }

  // --- Employee Digital Card Modal ---
  function openEmployeeCardModal() {
    if (!state.currentUser) {
      openAuthModal();
      return;
    }

    const u = state.currentUser;
    const titleEl = document.getElementById('modal-sheet-title');
    const bodyEl = document.getElementById('modal-sheet-body');
    const footerEl = document.getElementById('modal-sheet-footer');

    if (titleEl) titleEl.textContent = 'بطاقة الرعاية الطبية الرقمية الموحدة';

    const familyHtml = (u.family_members && u.family_members.length > 0) ? `
      <div style="margin-top:1rem; border-top:1px dashed var(--border-color); padding-top:0.75rem;">
        <h4 style="font-size:0.85rem; color:var(--we-purple-primary); margin-bottom:0.4rem;">
          <i class="fa-solid fa-users"></i> أفراد الأسرة المستفيدون من شبكة جلوب ميد (${u.family_members.length}):
        </h4>
        <div style="display:flex; flex-direction:column; gap:0.35rem;">
          ${u.family_members.map(f => `
            <div style="background:var(--bg-subtle); padding:0.4rem 0.75rem; border-radius:var(--radius-sm); font-size:0.78rem; display:flex; justify-content:space-between;">
              <strong>${f.name} (${f.relation})</strong>
              <span style="color:var(--text-secondary); font-family:monospace;">${f.globemed_id || ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="medical-id-card">
          <div class="card-header-row">
            <div>
              <span style="font-size:0.75rem; background:rgba(255,255,255,0.2); padding:0.2rem 0.6rem; border-radius:var(--radius-full);">
                المصرية للاتصالات WE — فرع الدقهلية
              </span>
              <div class="card-emp-name" style="margin-top:0.4rem;">${u.name}</div>
              <div class="card-emp-meta">${u.title || 'موظف بالشركة'}</div>
            </div>
            <img src="img/nekaba_logo.png" alt="النقابة" style="width:50px; height:50px; background:#fff; border-radius:50%; padding:4px;">
          </div>

          <div class="card-details-grid">
            <div><strong>الكود الوظيفي:</strong><br>${u.employee_code || 'WE-DK-100'}</div>
            <div><strong>قطاع العمل:</strong><br>${u.sector || 'المنصورة'}</div>
            <div><strong>نطاق التغطية:</strong><br>${u.coverage_type || 'شامل'}</div>
            <div><strong>كارنيه جلوب ميد:</strong><br>${u.globemed_card_no || 'غير متوفر'}</div>
          </div>
        </div>

        ${familyHtml}

        <div style="background:var(--bg-subtle); padding:0.75rem; border-radius:var(--radius-md); font-size:0.78rem; color:var(--text-secondary); line-height:1.45; margin-top:0.85rem;">
          <i class="fa-solid fa-circle-info" style="color:var(--we-purple-primary)"></i>
          <strong>إرشاد:</strong> يمكنك إبراز هذه الشاشة لمكاتب استقبال مستشفيات الحكمة والسلاب والخير أو معامل التحاليل لإثبات تبعيتك للشركة والاستفادة من خدمات التعاقد.
        </div>
      `;
    }

    if (footerEl) {
      footerEl.innerHTML = `
        <button class="btn-action-call" style="padding:0.5rem 1rem; border-radius:var(--radius-md); font-size:0.82rem;" onclick="window.print()">
          <i class="fa-solid fa-print"></i> طباعة البطاقة
        </button>
        <button class="btn-outline" style="padding:0.5rem 1rem; border-radius:var(--radius-md); color:#dc2626;" onclick="window.MedicalApp.logoutEmployee(); window.MedicalApp.closeModal();">
          تسجيل الخروج
        </button>
      `;
    }

    openModal();
  }

  // --- Smart Auto-Enrichment for Admin additions ---
  function autoEnrichNewProvider() {
    const nameInput = document.getElementById('new-doc-name');
    const addrInput = document.getElementById('new-doc-address');
    if (!nameInput) return;

    const rawName = nameInput.value.trim();
    const rawAddr = addrInput ? addrInput.value.trim() : '';

    if (!rawName) {
      showToast('يرجى كتابة اسم الطبيب أو الجهة أولاً لتنفيذ الكشف الذكي', 'danger', 2500);
      return;
    }

    const res = AdminPanel.smartDetectProvider(rawName, rawAddr);
    nameInput.value = res.correctedName;

    const catSelect = document.getElementById('new-doc-category');
    if (catSelect && res.category) {
      if (res.category === 'معمل تحاليل') catSelect.value = 'labs';
      else if (res.category === 'مركز أشعة') catSelect.value = 'radiology';
      else if (res.category === 'صيدلية') catSelect.value = 'pharmacies';
      else if (res.category === 'مركز أسنان') catSelect.value = 'dental';
      else if (res.category === 'مركز عيون') catSelect.value = 'optics';
      else if (res.category === 'علاج طبيعي وتأهيل') catSelect.value = 'physical_therapy';
      else if (res.category === 'مستشفى / مجمع طبي') catSelect.value = 'hospitals';
      else catSelect.value = 'doctors';
    }

    const specSelect = document.getElementById('new-doc-specialty');
    if (specSelect && res.specialtySuggestion) {
      specSelect.value = res.specialtySuggestion;
    }

    const markazSelect = document.getElementById('new-doc-markaz');
    if (markazSelect && res.markaz) {
      markazSelect.value = res.markaz;
    }

    const notesInput = document.getElementById('new-doc-notes');
    if (notesInput && !notesInput.value) {
      notesInput.value = `خرائط GPS: ${res.mapsUrl}`;
    }

    showToast(`تم التصحيح الإملائي وضبط التخصص والمركز (${res.markaz}) ورابط GPS بنجاح!`, 'success', 3000);
  }

  // --- Admin Form & CRUD Operations ---
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
    renderAdminDistressList();
    renderAdminGuidelinesList();
    renderAdminEmployeesList();
  }

  function renderAdminAuditorTable() {
    const container = document.getElementById('admin-auditor-table-body');
    if (!container) return;

    const incomplete = AdminPanel.findIncompleteRecords(state.records);
    if (incomplete.length === 0) {
      container.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--color-success); font-weight:700;">جميع السجلات مكتملة بنسبة 100%!</td></tr>`;
      return;
    }

    container.innerHTML = incomplete.slice(0, 30).map((item) => `
      <tr>
        <td>#${item.record.id}</td>
        <td><strong>${item.record.name || item.record.raw_name}</strong></td>
        <td>${item.record.hospital}</td>
        <td style="color:#dc2626; font-size:0.8rem;">${item.issues.join(' • ')}</td>
        <td>
          <button class="btn-action btn-action-details" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="window.MedicalApp.editRecordFromAdmin(${item.record.id})">
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
    if (dupes.byName.length === 0) {
      container.innerHTML = `<p style="padding:1rem; color:var(--color-success); font-weight:700;">لا توجد أي تكرارات غير مبررة بالبيانات.</p>`;
      return;
    }

    container.innerHTML = dupes.byName.map((d) => `
      <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.75rem; margin-bottom:0.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${d.name}</strong>
          <span class="pill-badge" style="background:var(--we-purple-soft); color:var(--we-purple-primary);">${d.count} سجلات</span>
        </div>
        <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.3rem;">
          المستشفيات: ${d.records.map(r => r.hospital).join(' ، ')}
        </div>
      </div>
    `).join('');
  }

  function renderAdminSuggestions() {
    const container = document.getElementById('admin-suggestions-container');
    if (!container) return;

    const list = MedicalStorage.getSuggestions();
    if (list.length === 0) {
      container.innerHTML = `<p style="padding:1rem; color:var(--text-secondary);">لا توجد مقترحات جديدة مرسلة من الزملاء حالياً.</p>`;
      return;
    }

    container.innerHTML = list.map((s) => `
      <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.85rem; margin-bottom:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.4rem;">
          <div>
            <h4 style="font-size:0.95rem; font-weight:800; color:var(--we-purple-primary);">${s.name}</h4>
            <span style="font-size:0.75rem; color:var(--text-secondary);">التخصص: ${s.specialty || 'عام'} • بواسطة: ${s.suggestedBy}</span>
          </div>
          <span class="pill-badge" style="font-size:0.7rem; background:#fef3c7; color:#92400e;">معلق للمراجعة</span>
        </div>
        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.6rem;">
          <div><i class="fa-solid fa-phone"></i> ${s.phone || 'غير مسجل'}</div>
          <div><i class="fa-solid fa-location-dot"></i> ${s.address || 'غير مسجل'}</div>
        </div>
        <div style="display:flex; gap:0.4rem;">
          <button class="btn-primary-purple" style="padding:0.35rem 0.75rem; font-size:0.78rem; border-radius:var(--radius-sm);" onclick="window.MedicalApp.approveSuggestion('${s.id}')">
            <i class="fa-solid fa-check"></i> اعتماد وإدراج
          </button>
          <button class="btn-outline" style="padding:0.35rem 0.65rem; font-size:0.78rem; border-radius:var(--radius-sm); color:#dc2626;" onclick="window.MedicalApp.rejectSuggestion('${s.id}')">
            حذف
          </button>
        </div>
      </div>
    `).join('');
  }

  function renderAdminDistressList() {
    const container = document.getElementById('admin-distress-list-container');
    if (!container) return;

    container.innerHTML = state.emergencyServices.map(em => `
      <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.75rem; margin-bottom:0.5rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
        <div>
          <strong style="color:var(--text-primary);">${em.name}</strong>
          <span style="font-size:0.8rem; color:var(--we-pink-accent); margin-right:0.5rem;">${em.number}</span>
          <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.2rem;">${em.description}</p>
        </div>
        <button class="btn-outline" style="padding:0.3rem 0.6rem; font-size:0.75rem; color:#dc2626;" onclick="window.MedicalApp.deleteDistressService('${em.id}')">
          حذف
        </button>
      </div>
    `).join('');
  }

  function renderAdminGuidelinesList() {
    const container = document.getElementById('admin-guidelines-list-container');
    if (!container) return;

    container.innerHTML = state.guidelines.map(g => `
      <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.75rem; margin-bottom:0.5rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
        <div>
          <strong style="color:var(--we-purple-primary);">${g.title}</strong>
          <span class="pill-badge" style="font-size:0.7rem; background:var(--we-pink-soft); color:var(--we-pink-accent); margin-right:0.4rem;">${g.badge || 'نشرة'}</span>
          <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.2rem;">${g.summary}</p>
        </div>
        <button class="btn-outline" style="padding:0.3rem 0.6rem; font-size:0.75rem; color:#dc2626;" onclick="window.MedicalApp.deleteAdminGuideline('${g.id}')">
          حذف
        </button>
      </div>
    `).join('');
  }

  function renderAdminEmployeesList() {
    const container = document.getElementById('admin-employees-list-container');
    if (!container) return;

    const list = MedicalStorage.getEmployees();
    container.innerHTML = `
      <div style="font-size:0.85rem; font-weight:800; margin-bottom:0.5rem;">إجمالي المسجلين بكشف العاملين: ${list.length} زميل</div>
      <div style="display:flex; flex-direction:column; gap:0.4rem;">
        ${list.map(emp => `
          <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.6rem 0.85rem; font-size:0.8rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
            <div>
              <strong>${emp.name}</strong> • ${emp.sector || 'WE'} • كود: ${emp.employee_code || '-'}
            </div>
            <div style="color:var(--text-secondary); font-family:monospace;">
              موبايل: ${emp.phone} | قومي: ••••${emp.national_id_last4}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function submitNewDoctor(e) {
    e.preventDefault();
    const name = (document.getElementById('new-doc-name') || {}).value || '';
    const hosp = (document.getElementById('new-doc-hospital') || {}).value || 'مستشفى الحكمة';
    const spec = (document.getElementById('new-doc-specialty') || {}).value || 'الجراحة العامة';
    const subspec = (document.getElementById('new-doc-subspecialty') || {}).value || '';
    const contract = (document.getElementById('new-doc-contract-entity') || {}).value || 'مباشر من الشركة WE';
    const scope = (document.getElementById('new-doc-coverage-scope') || {}).value || 'both';
    const markaz = (document.getElementById('new-doc-markaz') || {}).value || 'المنصورة';
    const clinicType = (document.getElementById('new-doc-type') || {}).value || 'عيادات داخلية';
    const phone = (document.getElementById('new-doc-phone') || {}).value || '';
    const address = (document.getElementById('new-doc-address') || {}).value || '';
    const schedule = (document.getElementById('new-doc-schedule') || {}).value || '';
    const notes = (document.getElementById('new-doc-notes') || {}).value || '';

    let coverageLabel = 'شامل: العاملين + أسر العاملين (جلوب ميد)';
    if (scope === 'employee_only') coverageLabel = 'العاملين بالشركة فقط';
    if (scope === 'family_globemed') coverageLabel = 'أسر العاملين (شبكة جلوب ميد)';

    const newRecord = {
      id: 2000 + (Date.now() % 100000),
      hospital: hosp,
      contract_entity: contract,
      contract_entity_id: contract.includes('الحكمة') ? 'hosp_hekma' : (contract.includes('السلاب') ? 'hosp_sellab' : (contract.includes('الخير') ? 'hosp_kheir' : 'direct_we')),
      coverage_scope: scope,
      coverage_label: coverageLabel,
      specialty: spec,
      subspecialty: subspec,
      raw_name: name,
      name: AdminPanel.correctArabicNameSpelling(name),
      display_name: name.startsWith('د/') ? name : `د/ ${AdminPanel.correctArabicNameSpelling(name)}`,
      academic_rank: 'طبيب استشاري',
      clinic_type: clinicType,
      raw_phone: phone,
      phones: [{ display: phone, digits: phone.replace(/[^\d]/g, ''), tel: phone.replace(/[^\d]/g, ''), is_mobile: phone.startsWith('01') }],
      address: address,
      city: markaz,
      markaz: markaz,
      area: markaz,
      schedule: schedule,
      notes: notes,
      is_department: false,
      maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + address + ' ' + markaz)}`
    };

    MedicalStorage.saveRecord(newRecord);
    loadData();
    showToast(`تمت إضافة ${name} إلى المنظومة بنجاح`, 'success', 3000);
    document.getElementById('form-add-doctor').reset();
    switchTab('doctors');
  }

  function editRecordFromAdmin(recordId) {
    const rec = state.records.find(r => r.id === recordId);
    if (!rec) return;

    document.querySelector('[data-admin-view="add-new"]').click();
    if (document.getElementById('new-doc-name')) document.getElementById('new-doc-name').value = rec.name || rec.raw_name;
    if (document.getElementById('new-doc-specialty')) document.getElementById('new-doc-specialty').value = rec.specialty;
    if (document.getElementById('new-doc-hospital')) document.getElementById('new-doc-hospital').value = rec.hospital;
    if (document.getElementById('new-doc-phone')) document.getElementById('new-doc-phone').value = rec.raw_phone;
    if (document.getElementById('new-doc-address')) document.getElementById('new-doc-address').value = rec.address;
    if (document.getElementById('new-doc-schedule')) document.getElementById('new-doc-schedule').value = rec.schedule;
    if (document.getElementById('new-doc-notes')) document.getElementById('new-doc-notes').value = rec.notes;
    showToast(`تم تحميل بيانات #${recordId} في نموذج الإدخال للتعديل`, 'info', 2500);
  }

  function openAddDistressModal() {
    const titleEl = document.getElementById('modal-sheet-title');
    const bodyEl = document.getElementById('modal-sheet-body');
    const footerEl = document.getElementById('modal-sheet-footer');

    if (titleEl) titleEl.textContent = 'إضافة خط استغاثة أو طوارئ عاجل';

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="form-grid">
          <div class="form-group full-width">
            <label class="form-label">اسم جهة الاستغاثة / الخط الساخن *</label>
            <input type="text" id="new-em-name" class="form-input" placeholder="مثال: طوارئ مستشفى الطوارئ الجامعي">
          </div>
          <div class="form-group full-width">
            <label class="form-label">رقم الهاتف / الخط المختصر *</label>
            <input type="tel" id="new-em-num" class="form-input" placeholder="مثال: 050/2200000 أو 19000">
          </div>
          <div class="form-group full-width">
            <label class="form-label">الوصف والخدمة المقدمة</label>
            <textarea id="new-em-desc" class="form-textarea" placeholder="مثال: استقبال حوادث وطوارئ على مدار 24 ساعة"></textarea>
          </div>
        </div>
      `;
    }

    if (footerEl) {
      footerEl.innerHTML = `
        <button class="btn-primary-purple" style="padding:0.55rem 1.2rem; border-radius:var(--radius-md); font-weight:800;" onclick="window.MedicalApp.saveDistressService()">
          <i class="fa-solid fa-save"></i> حفظ في المنظومة
        </button>
        <button class="btn-outline" style="padding:0.55rem 0.95rem; border-radius:var(--radius-md);" onclick="window.MedicalApp.closeModal()">
          إلغاء
        </button>
      `;
    }

    openModal();
  }

  function saveDistressService() {
    const name = (document.getElementById('new-em-name') || {}).value || '';
    const num = (document.getElementById('new-em-num') || {}).value || '';
    const desc = (document.getElementById('new-em-desc') || {}).value || '';

    if (!name || !num) {
      showToast('يرجى ملء الاسم ورقم الهاتف', 'danger');
      return;
    }

    const item = {
      id: 'em_' + Date.now(),
      name: name.trim(),
      number: num.trim(),
      tel: num.trim().replace(/[^\d]/g, ''),
      description: desc.trim(),
      category: 'طوارئ معتمدة',
      icon: 'fa-phone-flip',
      color: '#dc2626'
    };

    MedicalStorage.saveEmergencyService(item);
    state.emergencyServices = MedicalStorage.getEmergencyServices();
    renderEmergencyView();
    renderAdminDistressList();
    closeModal();
    showToast('تمت إضافة خط الاستغاثة بنجاح', 'success', 2500);
  }

  function deleteDistressService(id) {
    if (confirm('هل أنت متأكد من حذف هذا الرقم؟')) {
      MedicalStorage.deleteEmergencyService(id);
      state.emergencyServices = MedicalStorage.getEmergencyServices();
      renderEmergencyView();
      renderAdminDistressList();
      showToast('تم الحذف', 'info', 1500);
    }
  }

  function openAddGuidelineModal() {
    const titleEl = document.getElementById('modal-sheet-title');
    const bodyEl = document.getElementById('modal-sheet-body');
    const footerEl = document.getElementById('modal-sheet-footer');

    if (titleEl) titleEl.textContent = 'إضافة نشرة أو تعليمات طبية جديدة';

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="form-grid">
          <div class="form-group full-width">
            <label class="form-label">عنوان النشرة أو الإجراء *</label>
            <input type="text" id="new-guide-title" class="form-input" placeholder="مثال: ضوابط صرف الأدوية في شهر رمضان المبارك">
          </div>
          <div class="form-group">
            <label class="form-label">القسم *</label>
            <select id="new-guide-cat" class="form-select">
              <option value="emergency">دخول الطوارئ</option>
              <option value="approvals">الموافقات الطبية</option>
              <option value="globemed">أسر العاملين (جلوب ميد)</option>
              <option value="medications">أدوية الأمراض المزمنة</option>
              <option value="benefits">أسنان ونظارات</option>
              <option value="referrals">عيادات خارجية</option>
              <option value="union">دعم النقابة</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">شارة التمييز</label>
            <input type="text" id="new-guide-badge" class="form-input" placeholder="مثال: هام وعاجل">
          </div>
          <div class="form-group full-width">
            <label class="form-label">الموجز *</label>
            <textarea id="new-guide-summary" class="form-textarea" placeholder="ملخص سريع للموظف..."></textarea>
          </div>
          <div class="form-group full-width">
            <label class="form-label">الخطوات والإجراءات (اكتب كل خطوة في سطر منفصل)</label>
            <textarea id="new-guide-steps" class="form-textarea" rows="4" placeholder="الخطوة الأولى...\nالخطوة الثانية...\nالخطوة الثالثة..."></textarea>
          </div>
        </div>
      `;
    }

    if (footerEl) {
      footerEl.innerHTML = `
        <button class="btn-primary-purple" style="padding:0.55rem 1.2rem; border-radius:var(--radius-md); font-weight:800;" onclick="window.MedicalApp.saveAdminGuideline()">
          <i class="fa-solid fa-save"></i> حفظ ونشر الدليل
        </button>
        <button class="btn-outline" style="padding:0.55rem 0.95rem; border-radius:var(--radius-md);" onclick="window.MedicalApp.closeModal()">
          إلغاء
        </button>
      `;
    }

    openModal();
  }

  function saveAdminGuideline() {
    const title = (document.getElementById('new-guide-title') || {}).value || '';
    const cat = (document.getElementById('new-guide-cat') || {}).value || 'union';
    const badge = (document.getElementById('new-guide-badge') || {}).value || 'نشرة معتمدة';
    const summary = (document.getElementById('new-guide-summary') || {}).value || '';
    const stepsRaw = (document.getElementById('new-guide-steps') || {}).value || '';

    if (!title || !summary) {
      showToast('يرجى ملء العنوان والموجز', 'danger');
      return;
    }

    const steps = stepsRaw.split('\n').map(s => s.trim()).filter(Boolean);

    const item = {
      id: 'guide_' + Date.now(),
      title: title.trim(),
      category: cat,
      badge: badge.trim(),
      icon: 'fa-book-medical',
      summary: summary.trim(),
      steps: steps.length > 0 ? steps : [summary.trim()]
    };

    MedicalStorage.saveGuideline(item);
    state.guidelines = MedicalStorage.getGuidelines();
    renderGuidelinesView();
    renderAdminGuidelinesList();
    closeModal();
    showToast('تم حفظ ونشر الدليل بنجاح', 'success', 2500);
  }

  function deleteAdminGuideline(id) {
    if (confirm('هل أنت متأكد من حذف هذه النشرة؟')) {
      MedicalStorage.deleteGuideline(id);
      state.guidelines = MedicalStorage.getGuidelines();
      renderGuidelinesView();
      renderAdminGuidelinesList();
      showToast('تم الحذف', 'info', 1500);
    }
  }

  function importEmployeesFromAdmin() {
    const input = document.getElementById('admin-employees-json-input');
    if (!input || !input.value.trim()) {
      showToast('يرجى لصق بيانات العاملين بصيغة JSON', 'danger');
      return;
    }

    try {
      const data = JSON.parse(input.value.trim());
      if (!Array.isArray(data)) {
        showToast('يجب أن تكون البيانات عبارة عن مصفوفة JSON [ ... ]', 'danger');
        return;
      }
      MedicalStorage.saveEmployees(data);
      renderAdminEmployeesList();
      input.value = '';
      showToast(`تم حفظ وتحديث ${data.length} موظف بنجاح!`, 'success', 3000);
    } catch (err) {
      showToast('خطأ في صيغة JSON. تأكد من صحة التنسيق.', 'danger', 3000);
    }
  }

  // --- User Suggestion Modal ---
  function openSuggestModal() {
    const titleEl = document.getElementById('modal-sheet-title');
    const bodyEl = document.getElementById('modal-sheet-body');
    const footerEl = document.getElementById('modal-sheet-footer');

    if (titleEl) titleEl.textContent = 'ترشيح طبيب أو جهة جديدة للدليل';

    if (bodyEl) {
      bodyEl.innerHTML = `
        <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:0.85rem;">
          حرصاً على شمولية المنظومة، يمكنك ترشيح أي طبيب أو عيادة أو معمل متميز بالدقهلية لمراجعتها وإضافتها للدليل.
        </p>
        <div class="form-grid">
          <div class="form-group full-width">
            <label class="form-label">اسم الطبيب أو المركز الطبي المقترح *</label>
            <input type="text" id="sug-name" class="form-input" placeholder="مثال: د/ أحمد ممدوح أو مركز الشروق للعيون">
          </div>
          <div class="form-group">
            <label class="form-label">التخصص الطبي</label>
            <input type="text" id="sug-spec" class="form-input" placeholder="مثال: جراحة العظام">
          </div>
          <div class="form-group">
            <label class="form-label">المركز / المدينة</label>
            <select id="sug-markaz" class="form-select">
              ${state.dakahliaMarkaz.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">رقم الهاتف أو الحجز إن وجد</label>
            <input type="text" id="sug-phone" class="form-input" placeholder="010...">
          </div>
          <div class="form-group full-width">
            <label class="form-label">العنوان أو مكان التواجد بالدقهلية</label>
            <input type="text" id="sug-address" class="form-input" placeholder="مثال: طلخا - شارع البحر أو المنصورة حي الجامعة">
          </div>
          <div class="form-group full-width">
            <label class="form-label">اسم الزميل المقترح وجهة العمل</label>
            <input type="text" id="sug-author" class="form-input" value="${state.currentUser ? state.currentUser.name : ''}" placeholder="اسمك والسنترال التابع له">
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
    const markaz = (document.getElementById('sug-markaz') || {}).value || 'المنصورة';
    const phone = (document.getElementById('sug-phone') || {}).value || '';
    const addr = (document.getElementById('sug-address') || {}).value || '';
    const author = (document.getElementById('sug-author') || {}).value || '';

    MedicalStorage.addSuggestion({
      name: name.trim(),
      specialty: spec.trim(),
      markaz: markaz,
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
            <input type="text" id="appr-emp-name" class="form-input" value="${state.currentUser ? state.currentUser.name : ''}" placeholder="مثال: أحمد محمد علي">
          </div>
          <div class="form-group">
            <label class="form-label">الرقم الوظيفي أو القومي</label>
            <input type="text" id="appr-emp-id" class="form-input" value="${state.currentUser ? state.currentUser.employee_code : ''}" placeholder="الرقم الوظيفي بشركة WE">
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
    setCoverageScope,
    onMarkazSelectChange,
    onContractSelectChange,
    showDocDetails,
    openSOSModal,
    openAuthModal,
    fillDemoLogin,
    loginEmployeeFromModal,
    logoutEmployee,
    openEmployeeCardModal,
    autoEnrichNewProvider,
    shareDoctor,
    shareService,
    copyText,
    openApprovalEmailModal,
    sendApprovalEmail,
    openSuggestModal,
    submitSuggestion,
    submitNewDoctor,
    editRecordFromAdmin,
    openAddDistressModal,
    saveDistressService,
    deleteDistressService,
    openAddGuidelineModal,
    saveAdminGuideline,
    deleteAdminGuideline,
    importEmployeesFromAdmin,
    closeModal,
    handleCategoryClick,
    openServiceFromSidebar(cat) {
      closeSidebar();
      switchTab('services');
      const tabBtn = document.querySelector(`[data-serv-tab="${cat}"]`);
      if (tabBtn) tabBtn.click();
    },
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
      state.selectedCoverageScope = 'all';
      state.selectedContractEntity = 'all';
      state.selectedMarkaz = 'all';
      state.sortBy = 'default';

      const input = document.getElementById('main-search-input');
      if (input) input.value = '';

      const markazSelect = document.getElementById('filter-markaz-select');
      if (markazSelect) markazSelect.value = 'all';

      const contractSelect = document.getElementById('filter-contract-select');
      if (contractSelect) contractSelect.value = 'all';

      document.querySelectorAll('[data-scope]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-scope') === 'all');
      });

      closeSidebar();
      renderSidebarHospitals();
      renderSidebarSpecialties();
      renderSidebarMarkaz();
      renderSidebarContracts();
      renderDoctorsList();
      showToast('تمت إعادة تعيين كافة الفلاتر وعرض كافة السجلات', 'info', 2000);
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
    filterByMarkaz(markaz) {
      state.selectedMarkaz = markaz;
      const select = document.getElementById('filter-markaz-select');
      if (select) select.value = markaz;
      renderSidebarMarkaz();
      switchTab('doctors');
      renderDoctorsList();
    },
    filterByContract(contract) {
      state.selectedContractEntity = contract;
      const select = document.getElementById('filter-contract-select');
      if (select) select.value = contract;
      renderSidebarContracts();
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
        if (document.getElementById('new-doc-markaz')) document.getElementById('new-doc-markaz').value = item.markaz || 'المنصورة';
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
