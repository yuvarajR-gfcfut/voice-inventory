/**
 * StockSathi Text-To-Speech (TTS) Engine
 * Manages SpeechSynthesis voices with onvoiceschanged retry for Chrome/Android WebView.
 * Exposes hasVoice(lang) and non-blocking speak(text, lang).
 */

(function () {
  window.VI = window.VI || {};

  let voices = [];
  let voicesLoaded = false;
  const loadListeners = [];

  function updateVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const available = window.speechSynthesis.getVoices();
    if (Array.isArray(available) && available.length > 0) {
      voices = available;
      voicesLoaded = true;
      for (const cb of loadListeners) {
        try { cb(voices); } catch (_) {}
      }
      loadListeners.length = 0;
    }
  }

  // Chrome requires onvoiceschanged event
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    updateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }

  function normalizeLang(lang) {
    if (!lang) return 'hi';
    const lower = lang.toLowerCase().trim();
    if (lower.startsWith('te')) return 'te';
    if (lower.startsWith('en')) return 'en';
    return 'hi';
  }

  /**
   * Checks if an installed speech voice exists for the target language.
   * @param {string} lang - 'hi'|'te'|'en'|'hi-IN'|'te-IN'|'en-IN'
   * @returns {boolean}
   */
  function hasVoice(lang) {
    const target = normalizeLang(lang);
    if (!voices || voices.length === 0) {
      updateVoices();
    }
    return voices.some((v) => {
      const vLang = (v.lang || '').toLowerCase();
      return vLang.startsWith(target) || vLang.replace('_', '-').startsWith(target);
    });
  }

  /**
   * Finds the best matching voice object for the given language.
   */
  function findBestVoice(lang) {
    const target = normalizeLang(lang);
    const targetTag = `${target}-IN`;

    // 1. Exact match for regional Indian voice (e.g. hi-IN, te-IN, en-IN)
    let match = voices.find((v) => (v.lang || '').toLowerCase().replace('_', '-') === targetTag);
    if (match) return match;

    // 2. Prefix match (e.g. hi, te, en)
    match = voices.find((v) => (v.lang || '').toLowerCase().startsWith(target));
    if (match) return match;

    // 3. Fallback for English
    if (target === 'en') {
      match = voices.find((v) => (v.lang || '').toLowerCase().startsWith('en'));
      if (match) return match;
    }

    return null;
  }

  /**
   * Non-blocking speech synthesis.
   * @param {string} text - Spoken sentence
   * @param {string} [lang] - Language code
   */
  function speak(text, lang) {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Stop any overlapping previous utterance

      const targetLang = lang || (window.VI.i18n ? window.VI.i18n.getLang() : 'hi');
      const voice = findBestVoice(targetLang);

      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = `${normalizeLang(targetLang)}-IN`;
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[TTS] Speech synthesis error:', err);
    }
  }

  window.VI.tts = {
    hasVoice,
    speak,
    getVoices: () => voices,
    onVoicesLoaded: (cb) => {
      if (voicesLoaded && voices.length > 0) {
        cb(voices);
      } else {
        loadListeners.push(cb);
      }
    }
  };
})();
