/**
 * StockSathi Client-Side i18n Manager
 * Supports English (en), Hindi (hi), and Telugu (te).
 * Persists selection in localStorage and syncs with PATCH /api/me.
 */

(function () {
  window.VI = window.VI || {};

  const SUPPORTED_LANGS = ['hi', 'en', 'te'];
  const DEFAULT_LANG = 'hi';
  const STORAGE_KEY = 'stocksathi_lang';

  const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
  const urlLang = urlParams ? urlParams.get('lang') : null;
  let currentLang = (urlLang && SUPPORTED_LANGS.includes(urlLang))
    ? urlLang
    : (localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG);
  if (!SUPPORTED_LANGS.includes(currentLang)) {
    currentLang = DEFAULT_LANG;
  }
  if (urlLang && SUPPORTED_LANGS.includes(urlLang)) {
    try { localStorage.setItem(STORAGE_KEY, currentLang); } catch (_) {}
  }

  let translations = {};
  const listeners = [];

  // Speech tag mapping
  const SPEECH_LANG_MAP = {
    hi: 'hi-IN',
    en: 'en-IN',
    te: 'te-IN'
  };

  async function loadTranslations(lang) {
    try {
      const res = await fetch(`/i18n/${lang}.json?v=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      translations = await res.json();
    } catch (err) {
      console.warn(`[i18n] Failed to load /i18n/${lang}.json, fallback to empty:`, err);
      translations = {};
    }
  }

  function getNestedValue(obj, path) {
    if (!obj) return null;
    const keys = path.split('.');
    let curr = obj;
    for (const k of keys) {
      if (curr && typeof curr === 'object' && k in curr) {
        curr = curr[k];
      } else {
        return null;
      }
    }
    return typeof curr === 'string' ? curr : null;
  }

  function t(key, params = {}) {
    let str = getNestedValue(translations, key);
    if (!str) {
      return key; // Fallback to key
    }
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v !== null && v !== undefined ? v : '');
    }
    return str;
  }

  function applyFontClass(lang) {
    document.documentElement.lang = lang;
    const body = document.body;
    if (!body) return;

    body.classList.remove('font-devanagari', 'font-telugu');
    if (lang === 'hi') {
      body.classList.add('font-devanagari');
    } else if (lang === 'te') {
      body.classList.add('font-telugu');
    }
  }

  function applyTranslations(root = document) {
    const elements = root.querySelectorAll('[data-i18n]');
    for (const el of elements) {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = t(key);
      }
    }

    const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
    for (const el of placeholders) {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.placeholder = t(key);
      }
    }

    const titles = root.querySelectorAll('[data-i18n-title]');
    for (const el of titles) {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        el.title = t(key);
      }
    }
  }

  async function setLang(lang, syncServer = true) {
    if (!SUPPORTED_LANGS.includes(lang)) {
      lang = DEFAULT_LANG;
    }
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);

    await loadTranslations(lang);
    applyFontClass(lang);
    applyTranslations();

    // Update active state in UI buttons if present
    updateButtons(lang);

    // Sync with backend if user is logged in
    if (syncServer && window.VI && window.VI.api) {
      try {
        await window.VI.api('/me', {
          method: 'PATCH',
          body: { language: lang }
        });
      } catch (err) {
        // Silently tolerate if offline or unauthenticated
      }
    }

    // Notify listeners
    for (const fn of listeners) {
      try {
        fn(lang, SPEECH_LANG_MAP[lang]);
      } catch (e) {
        console.error('[i18n] Listener error:', e);
      }
    }
  }

  function updateButtons(lang) {
    for (const l of SUPPORTED_LANGS) {
      const btn = document.getElementById(`lang-btn-${l}`) || document.getElementById(`lang-${l}`);
      if (btn) {
        if (l === lang) {
          btn.className = 'py-2 rounded-xl bg-white shadow-sm text-blue-900 font-black cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1';
        } else {
          btn.className = 'py-2 rounded-xl text-slate-700 font-semibold cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1';
        }
      }
    }
  }

  async function init() {
    // 1. Immediately apply cached language and update buttons
    applyFontClass(currentLang);
    updateButtons(currentLang);
    await loadTranslations(currentLang);
    applyTranslations();
    updateButtons(currentLang);

    // 2. Reconcile with server profile once /api/me is accessible
    if (window.VI && window.VI.api) {
      try {
        const me = await window.VI.api('/me');
        if (me && me.language && SUPPORTED_LANGS.includes(me.language)) {
          if (me.language !== currentLang) {
            await setLang(me.language, false);
          } else {
            updateButtons(me.language);
          }
        }
      } catch (_) {}
    }
  }

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.VI.i18n = {
    getLang: () => currentLang,
    getSpeechLang: () => SPEECH_LANG_MAP[currentLang] || 'hi-IN',
    setLang,
    t,
    applyTranslations,
    updateButtons,
    onLangChange: (fn) => listeners.push(fn)
  };
})();
