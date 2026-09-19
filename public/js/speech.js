/**
 * StockSathi Voice Recognition Module
 * Wraps SpeechRecognition / webkitSpeechRecognition with Pub/Sub events,
 * auto-stop silence timer, and comprehensive error code mapping.
 */

class SpeechManager {
  constructor(customRecognitionClass = null) {
    this.customRecognitionClass = customRecognitionClass;
    this.recognition = null;
    this.listening = false;
    this.activeLang = 'hi-IN'; // Default Hindi (India)
    this.silenceTimer = null;
    this.silenceLimitMs = 8000; // 8s auto-stop
    this.hasReceivedSpeech = false;
    this.lastTranscript = '';

    // Event subscribers
    this.subscribers = {
      partial: [],
      final: [],
      error: [],
      end: [],
      start: []
    };
  }

  getRecognitionConstructor() {
    if (this.customRecognitionClass) {
      return this.customRecognitionClass;
    }
    if (typeof window !== 'undefined') {
      return window.SpeechRecognition || window.webkitSpeechRecognition || null;
    }
    return null;
  }

  /**
   * Feature detect whether Web Speech API is supported.
   * @returns {boolean}
   */
  isSupported() {
    return Boolean(this.getRecognitionConstructor());
  }

  /**
   * Subscribe to speech events.
   * @param {'partial'|'final'|'error'|'end'|'start'} event
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this.subscribers[event]) {
      this.subscribers[event] = [];
    }
    this.subscribers[event].push(callback);
    return () => {
      this.subscribers[event] = this.subscribers[event].filter(cb => cb !== callback);
    };
  }

  onPartial(cb) { return this.on('partial', cb); }
  onFinal(cb) { return this.on('final', cb); }
  onError(cb) { return this.on('error', cb); }
  onEnd(cb) { return this.on('end', cb); }
  onStart(cb) { return this.on('start', cb); }

  emit(event, ...args) {
    const cbs = this.subscribers[event] || [];
    for (const cb of cbs) {
      try {
        cb(...args);
      } catch (err) {
        console.error(`Error in speech listener for ${event}:`, err);
      }
    }
  }

  /**
   * Start listening for voice input.
   * @param {'en-IN'|'hi-IN'|'te-IN'|string} [lang='hi-IN']
   * @returns {boolean} True if started successfully
   */
  startListening(lang = 'hi-IN') {
    if (!this.isSupported()) {
      this.emit('error', 'not-supported', {
        code: 'not-supported',
        message: 'Voice recognition is not supported on this browser. Please type below.'
      });
      return false;
    }

    // Stop any running recognition before re-starting
    if (this.listening) {
      this.stopListening();
    }

    this.activeLang = lang || 'hi-IN';
    this.hasReceivedSpeech = false;
    this.lastTranscript = '';

    const RecognitionClass = this.getRecognitionConstructor();

    try {
      this.recognition = new RecognitionClass();
      this.recognition.lang = this.activeLang;
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.listening = true;
        this.resetSilenceTimer();
        this.emit('start', { lang: this.activeLang });
      };

      this.recognition.onresult = (event) => {
        this.resetSilenceTimer();
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const transcript = result[0]?.transcript || '';
          if (result.isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        if (interimText) {
          this.hasReceivedSpeech = true;
          this.lastTranscript = interimText;
          this.emit('partial', interimText);
        }

        if (finalText) {
          this.hasReceivedSpeech = true;
          this.lastTranscript = finalText.trim();
          this.emit('final', finalText.trim());
        }
      };

      this.recognition.onerror = (event) => {
        this.clearSilenceTimer();
        const rawCode = event.error || '';
        const mappedCode = this.mapErrorCode(rawCode);

        this.emit('error', mappedCode, {
          code: mappedCode,
          rawError: rawCode,
          message: this.getErrorMessage(mappedCode)
        });
      };

      this.recognition.onend = () => {
        this.clearSilenceTimer();
        const wasListening = this.listening;
        this.listening = false;

        // If session ended without any speech and no error was emitted yet
        if (wasListening && !this.hasReceivedSpeech && !this.lastTranscript) {
          this.emit('error', 'no-speech', {
            code: 'no-speech',
            message: this.getErrorMessage('no-speech')
          });
        }

        this.emit('end');
      };

      this.recognition.start();
      return true;
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      const mappedCode = this.mapErrorCode(err.name || err.message);
      this.emit('error', mappedCode, {
        code: mappedCode,
        rawError: err,
        message: this.getErrorMessage(mappedCode)
      });
      this.cleanup();
      return false;
    }
  }

  /**
   * Stop listening and finalize current speech.
   */
  stopListening() {
    this.clearSilenceTimer();
    if (this.recognition && this.listening) {
      try {
        this.recognition.stop();
      } catch (_) {
        try {
          this.recognition.abort();
        } catch (__) {}
      }
    }
    this.listening = false;
  }

  /**
   * Abort listening immediately.
   */
  abort() {
    this.clearSilenceTimer();
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (_) {}
    }
    this.listening = false;
    this.emit('end');
  }

  isListening() {
    return this.listening;
  }

  resetSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.listening) {
        if (!this.hasReceivedSpeech) {
          this.emit('error', 'no-speech', {
            code: 'no-speech',
            message: this.getErrorMessage('no-speech')
          });
        }
        this.stopListening();
      }
    }, this.silenceLimitMs);
  }

  clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  cleanup() {
    this.clearSilenceTimer();
    this.listening = false;
    this.recognition = null;
  }

  mapErrorCode(raw) {
    if (!raw) return 'unknown';
    const str = String(raw).toLowerCase();

    if (
      str.includes('not-allowed') ||
      str.includes('permission') ||
      str.includes('denied')
    ) {
      return 'not-allowed';
    }
    if (str.includes('no-speech')) {
      return 'no-speech';
    }
    if (str.includes('network')) {
      return 'network';
    }
    if (str.includes('audio-capture')) {
      return 'audio-capture';
    }
    if (str.includes('not-supported')) {
      return 'not-supported';
    }
    return 'unknown';
  }

  getErrorMessage(code) {
    switch (code) {
      case 'not-allowed':
        return 'Microphone permission denied. Please allow microphone access or type below.';
      case 'no-speech':
        return "Didn't catch any speech. Tap mic and try again, or type below.";
      case 'network':
        return 'Network error connecting to speech service. Check internet/airplane mode or type below.';
      case 'audio-capture':
        return 'No microphone found or audio capture failed. Please type below.';
      case 'not-supported':
        return 'Voice recognition is not supported on this browser. Please type below.';
      default:
        return 'Speech recognition error occurred. Please try again or type below.';
    }
  }
}

// Browser attachment
if (typeof window !== 'undefined') {
  window.VI = window.VI || {};
  window.VI.SpeechManager = SpeechManager;
  window.VI.speech = new SpeechManager();
}

// Node.js ESM/CJS export
export { SpeechManager };
export default SpeechManager;
