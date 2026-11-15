/**
 * ESP32 Bridge — Kết nối ESP32-S3 (INMP441 + Groq Whisper) với Sign Studio
 * qua WebSocket trên mạng LAN.
 *
 * ESP32 thu âm → Groq STT → text → WebSocket broadcast → Sign Studio avatar.
 */

export class ESP32Bridge {
  /**
   * @param {Object} options
   * @param {(text: string, lang: string) => void} options.onTranscript — Gọi khi nhận text từ ESP32
   * @param {(status: 'disconnected'|'connecting'|'connected'|'error') => void} options.onStatus
   * @param {(rms: number, recording: boolean) => void} [options.onAudioLevel] — Cập nhật RMS từ ESP32
   */
  constructor({ onTranscript, onStatus, onAudioLevel }) {
    this.ws = null;
    this.onTranscript = onTranscript;
    this.onStatus = onStatus;
    this.onAudioLevel = onAudioLevel;
    this.reconnectTimer = null;
    this.reconnectDelay = 3000;
    this.maxReconnectDelay = 30000;
    this.espIP = null;
    this.connected = false;
    this._intentionalClose = false;
  }

  /** Kết nối WebSocket tới ESP32-S3 */
  connect(ip) {
    if (!ip || typeof ip !== 'string') return;
    if (this.ws) {
      this.disconnect();
    }
    this._intentionalClose = false;
    this.espIP = ip.trim();
    this.reconnectDelay = 3000;
    this._doConnect();
  }

  _doConnect() {
    if (!this.espIP || this._intentionalClose) return;
    this.onStatus?.('connecting');

    try {
      // ESP32 WebSocket server mặc định port 81
      const port = this.espIP.includes(':') ? '' : ':81';
      this.ws = new WebSocket(`ws://${this.espIP}${port}`);
    } catch {
      this.onStatus?.('error');
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 3000;
      this.onStatus?.('connected');
      console.log(`[ESP32Bridge] Đã kết nối ws://${this.espIP}:81`);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'speech' && typeof data.text === 'string' && data.text.trim()) {
          this.onTranscript?.(data.text.trim(), data.lang || 'vi-VN');
        }

        // Tùy chọn: nhận RMS level để hiển thị trên UI
        if (data.type === 'audio_level' && typeof data.rms === 'number') {
          this.onAudioLevel?.(data.rms, !!data.recording);
        }
      } catch {
        // Bỏ qua message không phải JSON (ví dụ: debug text từ Serial)
      }
    };

    this.ws.onerror = () => {
      this.onStatus?.('error');
    };

    this.ws.onclose = () => {
      this.connected = false;
      if (!this._intentionalClose) {
        this.onStatus?.('disconnected');
        this._scheduleReconnect();
      }
    };
  }

  _scheduleReconnect() {
    if (this._intentionalClose || !this.espIP) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this._doConnect(), this.reconnectDelay);
    // Exponential backoff capped at 30s
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
  }

  /** Ngắt kết nối */
  disconnect() {
    this._intentionalClose = true;
    clearTimeout(this.reconnectTimer);
    const wasConnected = this.connected || !!this.ws;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    if (wasConnected) {
      this.onStatus?.('disconnected');
    }
  }

  /** Gửi lệnh xuống ESP32 (tùy chọn: đổi ngôn ngữ, calibrate...) */
  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  /** Lưu / đọc IP từ localStorage */
  static saveIP(ip) {
    try { localStorage.setItem('esp32_ip', ip); } catch { /* noop */ }
  }
  static loadIP() {
    try { return localStorage.getItem('esp32_ip') || ''; } catch { return ''; }
  }
}

