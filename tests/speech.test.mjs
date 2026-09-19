import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/speech.js';

const SpeechManager = globalThis.SpeechManager;

describe('SpeechManager (public/js/speech.js)', () => {

  test('Feature detection returns false when no SpeechRecognition constructor exists', () => {
    const manager = new SpeechManager(null);
    assert.equal(manager.isSupported(), false);

    let emittedError = null;
    let emittedCode = null;
    manager.onError((code, details) => {
      emittedCode = code;
      emittedError = details;
    });

    const started = manager.startListening('hi-IN');
    assert.equal(started, false);
    assert.equal(emittedCode, 'not-supported');
    assert.match(emittedError.message, /not supported/i);
  });

  test('Mock SpeechRecognition lifecycle: start, partial, final, and end', () => {
    class MockRecognition {
      constructor() {
        this.lang = '';
        this.continuous = false;
        this.interimResults = false;
        this.maxAlternatives = 1;
        this.onstart = null;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
      }
      start() {
        setTimeout(() => {
          if (this.onstart) this.onstart();
        }, 10);
      }
      stop() {
        setTimeout(() => {
          if (this.onend) this.onend();
        }, 10);
      }
      abort() {
        setTimeout(() => {
          if (this.onend) this.onend();
        }, 10);
      }
    }

    const manager = new SpeechManager(MockRecognition);
    assert.equal(manager.isSupported(), true);

    let startedLang = null;
    let partialReceived = null;
    let finalReceived = null;
    let ended = false;

    manager.onStart(({ lang }) => { startedLang = lang; });
    manager.onPartial((text) => { partialReceived = text; });
    manager.onFinal((text) => { finalReceived = text; });
    manager.onEnd(() => { ended = true; });

    const ok = manager.startListening('te-IN');
    assert.equal(ok, true);
    assert.equal(manager.recognition.lang, 'te-IN');

    // Simulate start
    manager.recognition.onstart();
    assert.equal(startedLang, 'te-IN');
    assert.equal(manager.isListening(), true);

    // Simulate interim result
    manager.recognition.onresult({
      resultIndex: 0,
      results: [
        [{ transcript: 'rendu bori' }]
      ]
    });
    assert.equal(partialReceived, 'rendu bori');

    // Simulate final result
    const finalResultItem = [{ transcript: 'rendu bori sugar' }];
    finalResultItem.isFinal = true;
    manager.recognition.onresult({
      resultIndex: 0,
      results: [finalResultItem]
    });
    assert.equal(finalReceived, 'rendu bori sugar');

    // Simulate stop
    manager.stopListening();
    manager.recognition.onend();
    assert.equal(ended, true);
    assert.equal(manager.isListening(), false);
  });

  test('Error code mapping for not-allowed, network, audio-capture', () => {
    class MockRecognition {
      start() { setTimeout(() => this.onstart?.(), 5); }
      stop() { setTimeout(() => this.onend?.(), 5); }
      abort() {}
    }

    const manager = new SpeechManager(MockRecognition);
    const errors = [];
    manager.onError((code, details) => {
      errors.push({ code, details });
    });

    manager.startListening('hi-IN');
    manager.recognition.onerror({ error: 'not-allowed' });
    assert.equal(errors[0].code, 'not-allowed');
    assert.match(errors[0].details.message, /permission denied/i);

    manager.startListening('en-IN');
    manager.recognition.onerror({ error: 'network' });
    assert.equal(errors[1].code, 'network');
    assert.match(errors[1].details.message, /network error/i);

    manager.startListening('te-IN');
    manager.recognition.onerror({ error: 'audio-capture' });
    assert.equal(errors[2].code, 'audio-capture');
    assert.match(errors[2].details.message, /microphone/i);
  });

  test('Silence timer triggers auto-stop and emits no-speech', async () => {
    class MockRecognition {
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }

    const manager = new SpeechManager(MockRecognition);
    // Shorten limit for fast test
    manager.silenceLimitMs = 50;

    let errorCode = null;
    manager.onError((code) => {
      errorCode = code;
    });

    manager.startListening('hi-IN');
    assert.equal(manager.isListening(), true);

    // Wait for silence timer to expire
    await new Promise((r) => setTimeout(r, 80));

    assert.equal(errorCode, 'no-speech');
    assert.equal(manager.isListening(), false);
  });

});
