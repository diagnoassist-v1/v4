window.I18N = window.I18N || {};

(function(){
  var currentLang = localStorage.getItem('diagLang') || 'ar';
  var reverseMap = { en: {}, fr: {} };
  var mapsBuilt = false;

  function norm(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function buildMaps() {
    if (mapsBuilt) return;
    var arDict = window.I18N.ar || {};
    var enDict = window.I18N.en || {};
    var frDict = window.I18N.fr || {};
    Object.keys(arDict).forEach(function(k) {
      var arVal = norm(arDict[k].replace(/<[^>]+>/g, ''));
      if (arVal) {
        if (enDict[k]) reverseMap.en[arVal] = norm(enDict[k].replace(/<[^>]+>/g, ''));
        if (frDict[k]) reverseMap.fr[arVal] = norm(frDict[k].replace(/<[^>]+>/g, ''));
      }
    });
    var phrases = window.I18N_PHRASES || {};
    Object.keys(phrases).forEach(function(arKey) {
      var nk = norm(arKey);
      var pair = phrases[arKey];
      if (pair && pair[0]) reverseMap.en[nk] = pair[0];
      if (pair && pair[1]) reverseMap.fr[nk] = pair[1];
    });
    mapsBuilt = true;
  }

  function translateTextString(rawAr, lang) {
    if (lang === 'ar') return rawAr;
    buildMaps();
    var dict = reverseMap[lang] || {};
    var trimmed = norm(rawAr);
    if (!trimmed) return rawAr;

    // 1. Direct match
    if (dict[trimmed]) {
      return rawAr.replace(trimmed, dict[trimmed]);
    }

    // 2. Match after stripping leading/trailing arrows, emojis, or punctuation
    var m = trimmed.match(/^([←→↔➕＋✕✖✓✔★⭐🔒🔐🪪✉️👤👥🔑🛡️🩺📍✍️📋📊📈📉📁🗂️🗓️💬🎭⚡🔥👑🎓🔎💡⏱⚙️🟢🧮🖨️⬇️📦🗑●•:\-\s]+)?([\s\S]*?)([←→↔➕＋✕✖✓✔★⭐🔒🔐:\-\s]+)?$/);
    if (m) {
      var pre = m[1] || '';
      var core = norm(m[2] || '');
      var suf = m[3] || '';
      if (core && dict[core]) {
        return pre + (pre && !pre.endsWith(' ') ? ' ' : '') + dict[core] + (suf && !suf.startsWith(' ') ? ' ' : '') + suf;
      }
    }

    // 3. Dynamic pattern translations (counts, sessions, dates, steps)
    var out = trimmed;
    if (lang === 'en') {
      out = out
        .replace(/(\d+)\s*\/\s*(\d+)\s*عرض/, '$1 / $2 symptoms')
        .replace(/(\d+)\s*جلسة تقييم/, '$1 Assessment Session(s)')
        .replace(/(\d+)\s*جلسات/, '$1 Sessions')
        .replace(/(\d+)\s*جلسة/, '$1 Session')
        .replace(/(\d+)\s*مريض مسجل/, '$1 Registered Patient(s)')
        .replace(/الإنشاء:\s*([^\s—]+)\s*—\s*آخر تحديث:\s*([^\s]+)/, 'Created: $1 — Updated: $2')
        .replace(/المقابلة الأولى/, 'First Interview')
        .replace(/المقابلة الثانية/, 'Second Interview')
        .replace(/المقابلة الثالثة/, 'Third Interview')
        .replace(/الخطوة\s*(\d+)\s*من\s*(\d+)/, 'Step $1 of $2')
        .replace(/الدرجة:\s*/, 'Score: ')
        .replace(/ذكر/, 'Male')
        .replace(/أنثى/, 'Female');
    } else if (lang === 'fr') {
      out = out
        .replace(/(\d+)\s*\/\s*(\d+)\s*عرض/, '$1 / $2 symptômes')
        .replace(/(\d+)\s*جلسة تقييم/, '$1 Séance(s) d\'évaluation')
        .replace(/(\d+)\s*جلسات/, '$1 Séances')
        .replace(/(\d+)\s*جلسة/, '$1 Séance')
        .replace(/(\d+)\s*مريض مسجل/, '$1 Patient(s) enregistré(s)')
        .replace(/الإنشاء:\s*([^\s—]+)\s*—\s*آخر تحديث:\s*([^\s]+)/, 'Créé : $1 — Mis à jour : $2')
        .replace(/المقابلة الأولى/, 'Premier Entretien')
        .replace(/المقابلة الثانية/, 'Deuxième Entretien')
        .replace(/المقابلة الثالثة/, 'Troisième Entretien')
        .replace(/الخطوة\s*(\d+)\s*من\s*(\d+)/, 'Étape $1 sur $2')
        .replace(/الدرجة:\s*/, 'Score : ')
        .replace(/ذكر/, 'Homme')
        .replace(/أنثى/, 'Femme');
    }
    return out;
  }

  window.t = function(key) {
    return (window.I18N[currentLang] && window.I18N[currentLang][key]) || key;
  };

  window.getLang = function() {
    return currentLang;
  };

  function injectLangStyles() {
    if (document.getElementById('i18n-pseudo-styles')) return;
    var st = document.createElement('style');
    st.id = 'i18n-pseudo-styles';
    st.textContent =
      'html[lang="en"] .file-card::before { content: "📁 Patient File" !important; }' +
      'html[lang="fr"] .file-card::before { content: "📁 Dossier Patient" !important; }' +
      'html[lang="en"] .file-shell::before { content: "🗂️ Patient File" !important; }' +
      'html[lang="fr"] .file-shell::before { content: "🗂️ Dossier Patient" !important; }' +
      '.nav-lang-switch { display:inline-flex; align-items:center; gap:3px; background:rgba(238,244,255,0.92); border:1.5px solid #c5d5f8; border-radius:999px; padding:3px; margin-inline-start:8px; }' +
      '.nav-lang-btn { border:none; background:transparent; color:#152f78; font-weight:800; font-size:11.5px; padding:5px 10px; border-radius:999px; cursor:pointer; font-family:inherit; transition:all .2s; }' +
      '.nav-lang-btn.active { background:linear-gradient(135deg,#193fa4,#2563eb); color:#fff; box-shadow:0 3px 10px rgba(25,63,164,0.28); }';
    if (document.head) document.head.appendChild(st);
  }

  function injectNavLangSwitcher() {
    if (typeof MutationObserver === 'undefined') return; // skip in headless unit-test harness if not needed
    var navInner = document.querySelector('header.nav .nav-inner');
    if (!navInner || document.getElementById('navLangSwitch')) return;
    var wrap = document.createElement('div');
    wrap.className = 'nav-lang-switch';
    wrap.id = 'navLangSwitch';
    ['ar', 'en', 'fr'].forEach(function(l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-lang-btn' + (currentLang === l ? ' active' : '');
      b.setAttribute('data-nav-lang', l);
      b.textContent = l.toUpperCase();
      b.onclick = function() { window.setLanguage(l); };
      wrap.appendChild(b);
    });
    var cta = navInner.querySelector('.nav-cta') || navInner.lastElementChild;
    if (cta && cta.parentNode === navInner) {
      var holder = document.createElement('div');
      holder.style.display = 'inline-flex';
      holder.style.alignItems = 'center';
      holder.style.gap = '8px';
      navInner.insertBefore(holder, cta);
      holder.appendChild(wrap);
      holder.appendChild(cta);
    } else {
      navInner.appendChild(wrap);
    }
  }

  var isApplying = false;

  function applyTranslations() {
    if (isApplying) return;
    isApplying = true;
    try {
      injectLangStyles();
      var dict = window.I18N[currentLang] || {};

      // 1. Explicit data-i18n attributes
      document.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        if (dict[key]) el.textContent = dict[key];
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-placeholder');
        if (dict[key]) el.placeholder = dict[key];
      });
      document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-html');
        if (dict[key]) el.innerHTML = dict[key];
      });

      // 2. Document Title
      if (document.title) {
        if (!document._origArTitle) document._origArTitle = document.title;
        document.title = currentLang === 'ar'
          ? document._origArTitle
          : translateTextString(document._origArTitle, currentLang);
      }

      // 3. Placeholders, titles, and aria-labels across all elements
      document.querySelectorAll('input[placeholder], textarea[placeholder], [title], [aria-label]').forEach(function(el) {
        if (el.hasAttribute('placeholder') && !el.hasAttribute('data-i18n-placeholder')) {
          if (el._origArPh === undefined) el._origArPh = el.getAttribute('placeholder') || '';
          if (el._origArPh) {
            el.setAttribute('placeholder', currentLang === 'ar' ? el._origArPh : translateTextString(el._origArPh, currentLang));
          }
        }
        if (el.hasAttribute('title')) {
          if (el._origArTitle === undefined) el._origArTitle = el.getAttribute('title') || '';
          if (el._origArTitle) {
            el.setAttribute('title', currentLang === 'ar' ? el._origArTitle : translateTextString(el._origArTitle, currentLang));
          }
        }
      });

      // 4. Universal Text Node Walker (translates all static & dynamic text nodes bidirectionally)
      if (document.body && document.createTreeWalker) {
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
          var parent = node.parentNode;
          if (!parent) continue;
          var tag = parent.tagName ? parent.tagName.toUpperCase() : '';
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
          if (parent.hasAttribute && (parent.hasAttribute('data-i18n') || parent.hasAttribute('data-i18n-html') || parent.hasAttribute('data-nav-lang'))) continue;

          var val = node.nodeValue || '';
          if (node._origAr === undefined) {
            if (/[\u0600-\u06FF]/.test(val)) {
              node._origAr = val;
            } else {
              continue;
            }
          }
          if (node._origAr !== undefined) {
            var targetVal = currentLang === 'ar' ? node._origAr : translateTextString(node._origAr, currentLang);
            if (node.nodeValue !== targetVal) {
              node.nodeValue = targetVal;
            }
          }
        }
      }

      // 5. Update active state on language buttons
      document.querySelectorAll('.lang-option').forEach(function(el) {
        el.classList.toggle('active', el.getAttribute('data-lang') === currentLang);
      });
      document.querySelectorAll('.nav-lang-btn').forEach(function(el) {
        el.classList.toggle('active', el.getAttribute('data-nav-lang') === currentLang);
      });
    } finally {
      isApplying = false;
    }
  }

  window.setLanguage = function(lang) {
    currentLang = lang;
    localStorage.setItem('diagLang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    applyTranslations();
    var toast = document.getElementById('i18n-toast');
    if (toast) {
      toast.textContent = window.t('toast_lang_changed');
      toast.classList.add('show');
      setTimeout(function() { toast.classList.remove('show'); }, 2500);
    }
  };


  function injectMobileAppTabBar() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    if (document.getElementById('mobileAppTabBar')) return;
    var path = (window.location.pathname || '').split('/').pop() || 'index.html';
    var nav = document.createElement('nav');
    nav.className = 'mobile-app-tabbar';
    nav.id = 'mobileAppTabBar';
    nav.setAttribute('aria-label', 'Mobile App Navigation');

    var tabs = [
      { href: 'index.html', ico: '🏠', label: 'الرئيسية', match: ['index.html', ''] },
      { href: 'tools.html', ico: '🧰', label: 'الأدوات', match: ['tools.html', 'tools-severity-scale.html', 'scale-builder.html', 'interview-questions.html', 'clinical-simulator.html', 'diagnosis.html', 'results.html', 'test.html', 'custom-test.html', 'charts.html', 'custom-results.html', 'patient.html', 'patient-severity.html'] },
      { href: 'patient-files.html', ico: '📁', label: 'الملفات', match: ['patient-files.html', 'patient-file.html'] },
      { href: 'appointments.html', ico: '🗓️', label: 'المواعيد', match: ['appointments.html'] },
      { href: 'pricing.html', ico: '💎', label: 'الباقات', match: ['pricing.html', 'payment.html', 'profile.html', 'login.html', 'register.html'] }
    ];

    tabs.forEach(function(tb) {
      var a = document.createElement('a');
      a.href = tb.href;
      var isAct = tb.match.indexOf(path) !== -1;
      a.className = 'mat-item' + (isAct ? ' active' : '');
      var sIco = document.createElement('span');
      sIco.className = 'mat-ico';
      sIco.textContent = tb.ico;
      var sLbl = document.createElement('span');
      sLbl.className = 'mat-lbl';
      sLbl.textContent = tb.label;
      a.appendChild(sIco);
      a.appendChild(sLbl);
      nav.appendChild(a);
    });
    document.body.appendChild(nav);
  }

  function enforceMobileResultsHarmony() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    var tc = document.querySelector("#resContent .two-col");
    if (!tc) return;
    var cm = document.querySelector("#resContent .col-main");
    var cs = document.querySelector("#resContent .col-side");
    if (window.innerWidth <= 960) {
      tc.style.setProperty("display", "flex", "important");
      tc.style.setProperty("flex-direction", "column", "important");
      tc.style.setProperty("grid-template-columns", "1fr", "important");
      tc.style.setProperty("gap", "14px", "important");
      tc.style.setProperty("width", "100%", "important");
      if (cm) { cm.style.setProperty("width", "100%", "important"); cm.style.setProperty("order", "1", "important"); }
      if (cs) { cs.style.setProperty("width", "100%", "important"); cs.style.setProperty("order", "2", "important"); }
    } else {
      tc.style.removeProperty("display");
      tc.style.removeProperty("flex-direction");
      tc.style.removeProperty("grid-template-columns");
      tc.style.removeProperty("gap");
      tc.style.removeProperty("width");
      if (cm) { cm.style.removeProperty("width"); cm.style.removeProperty("order"); }
      if (cs) { cs.style.removeProperty("width"); cs.style.removeProperty("order"); }
    }
  }

  window.applyLanguage = function() {
    injectMobileAppTabBar();
    enforceMobileResultsHarmony();
    currentLang = localStorage.getItem('diagLang') || 'ar';
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    applyTranslations();
  };

  function initI18n() {
    window.applyLanguage();
    if (typeof MutationObserver !== 'undefined' && document.body) {
      var moTimer = null;
      var mo = new MutationObserver(function() {
        if (isApplying || currentLang === 'ar') return;
        clearTimeout(moTimer);
        moTimer = setTimeout(function() {
          applyTranslations();
        }, 40);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
  } else {
    initI18n();
  }
})();
