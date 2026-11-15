// Speech Recognition Module (Web Speech API + Streaming Audio Fallback)
// Handles Vietnamese and English microphone input, continuous recognition, and interim results.

export class SpeechHandler {
  constructor(options = {}) {
    this.lang = options.lang || 'en-US';
    this.onInterim = options.onInterim || (() => {});
    this.onFinal = options.onFinal || (() => {});
    this.onError = options.onError || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    this.recognition = null;
    this.isListening = false;
    this.audioStream = null;

    this.initRecognition();
  }

  setLanguage(langCode) {
    this.lang = langCode;
    if (this.recognition) {
      this.recognition.lang = langCode;
    }
  }

  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false; // We want clear utterance boundaries
      this.recognition.interimResults = true;
      this.recognition.lang = this.lang;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.onStatusChange('LISTENING');
      };

      this.recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        if (interimTranscript) {
          this.onInterim(interimTranscript);
        }

        if (finalTranscript) {
          this.isListening = false;
          this.onStatusChange('PROCESSING');
          this.onFinal(finalTranscript.trim());
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('Speech Recognition Event Error:', event.error);
        this.isListening = false;
        this.onStatusChange('IDLE');
        this.onError(event.error);
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          this.isListening = false;
          this.onStatusChange('IDLE');
        }
      };
    } else {
      console.info('SpeechRecognition unavailable; text input remains available.');
    }
  }

  async startListening() {
    if (!this.recognition) {
      this.onError('unsupported');
      return;
    }

    try {
      this.recognition.lang = this.lang;
      this.recognition.start();
    } catch (err) {
      this.isListening = false;
      this.onStatusChange('IDLE');
      this.onError(err.name || 'start-failed');
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    this.isListening = false;
    this.onStatusChange('IDLE');
  }

  /**
   * Fallback simulator for headless or environments without physical microphone
   */
  simulateSpeechInput(sampleText) {
    const defaultPhrases = {
      'en-US': 'What is your name?',
      'vi-VN': 'Bạn tên là gì?',
    };

    const text = sampleText || defaultPhrases[this.lang] || 'Hello, nice to meet you';
    this.onStatusChange('LISTENING');

    // Simulate real-time word-by-word streaming
    const words = text.split(' ');
    let current = '';
    let index = 0;

    const interval = setInterval(() => {
      if (index < words.length) {
        current += (index > 0 ? ' ' : '') + words[index];
        this.onInterim(current);
        index++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          this.onStatusChange('PROCESSING');
          this.onFinal(text);
        }, 300);
      }
    }, 280);
  }
}
