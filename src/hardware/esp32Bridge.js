/**
 * ESP32 Bridge — Kết nối ESP32-S3 (INMP441 + Groq Whisper) với Sign Studio
 * qua WebSocket trên mạng LAN.
 *
 * ESP32 thu âm → Groq STT → text → WebSocket broadcast → Sign Studio avatar.
 */

const HALLUCINATION_PATTERNS = [
  /subscribe/i,
  /ghiền mì gõ/i,
  /ghien mi go/i,
  /la la school/i,
  /lala school/i,
  /video hấp dẫn/i,
  /video hap dan/i,
  /video tiếp theo/i,
  /video tiep theo/i,
  /những video/i,
  /nhung video/i,
  /đăng ký kênh/i,
  /dang ky kenh/i,
  /like và/i,
  /like va/i,
  /theo dõi và hẹn/i,
  /theo doi va hen/i,
  /hẹn gặp lại các bạn/i,
  /hen gap lai cac ban/i,
  /cảm ơn các bạn đã theo dõi/i,
  /chuông thông báo/i
];

/**
 * Kiểm tra xem văn bản nhận được có phải ảo giác thường gặp của Whisper
 * khi gặp khoảng lặng hoặc tạp âm YouTube hay không.
 * @param {string} text
 * @returns {boolean}
 */
export function isWhisperHallucination(text) {
  if (!text || typeof text !== 'string') return false;
  return HALLUCINATION_PATTERNS.some(pattern => pattern.test(text));
}

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
    this.tftStreamer = null;
  }

  /** Gắn module TFT Streamer */
  setTftStreamer(streamer) {
    this.tftStreamer = streamer;
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
      this.ws.binaryType = 'arraybuffer';
      this.onStatus?.('connected');
      console.log(`[ESP32Bridge] Đã kết nối ws://${this.espIP}:81`);
    };

    this.ws.onmessage = (event) => {
      // Bỏ qua nếu là dữ liệu nhị phân nhận từ ESP32 (hiện tại ESP32 chỉ gửi JSON)
      if (typeof event.data !== 'string') return;

      try {
        const data = JSON.parse(event.data);

        if (data.type === 'speech' && typeof data.text === 'string' && data.text.trim()) {
          const trimmed = data.text.trim();
          if (isWhisperHallucination(trimmed)) {
            console.warn('[ESP32Bridge] Đã lọc ảo giác Whisper (YouTube Outro):', trimmed);
            return;
          }
          this.onTranscript?.(trimmed, data.lang || 'vi-VN');
        }

        // Nhận RMS level để hiển thị trên UI
        if (data.type === 'audio_level' && typeof data.rms === 'number') {
          this.onAudioLevel?.(data.rms, !!data.recording);
        }

        // Nhận ACK hoặc phản hồi TFT từ ESP32
        if (data.type === 'tft_frame_ack') {
          this.tftStreamer?.handleAck(data);
        } else if (data.type === 'tft_frame_error') {
          this.tftStreamer?.handleError(data);
        } else if (data.type === 'tft_ready') {
          console.log('[ESP32Bridge] ESP32 ST7789 TFT sẵn sàng:', data);
        }
      } catch {
        // Bỏ qua message không phải JSON
      }
    };

    this.ws.onerror = () => {
      this.onStatus?.('error');
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.tftStreamer?.handleDisconnected();
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

  /** Gửi lệnh text/JSON xuống ESP32 */
  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  /** Gửi dữ liệu nhị phân (JPEG chunk) xuống ESP32 */
  sendBinary(buffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
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

