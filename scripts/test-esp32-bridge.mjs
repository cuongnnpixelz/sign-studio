import assert from 'node:assert/strict';
import { ESP32Bridge } from '../src/hardware/esp32Bridge.js';

console.log('--- Testing ESP32 Bridge ---');

// Mock localStorage if in Node environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

// 1. Test IP persistence
ESP32Bridge.saveIP('192.168.1.150');
assert.equal(ESP32Bridge.loadIP(), '192.168.1.150', 'IP should be saved and loaded correctly');
console.log('✓ IP save and load via localStorage works');

// 2. Mock WebSocket for testing Bridge logic
class MockWebSocket {
  static instances = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 10);
  }
  send(data) {
    this.lastSent = data;
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }
}

globalThis.WebSocket = MockWebSocket;

// 3. Test Connection and Message Handling
let receivedTranscript = null;
let receivedLang = null;
let statusHistory = [];
let receivedRms = null;

const bridge = new ESP32Bridge({
  onTranscript: (text, lang) => {
    receivedTranscript = text;
    receivedLang = lang;
  },
  onStatus: (status) => {
    statusHistory.push(status);
  },
  onAudioLevel: (rms, isRec) => {
    receivedRms = { rms, isRec };
  }
});

bridge.connect('192.168.1.150');
assert.equal(statusHistory[0], 'connecting', 'Initial status should be connecting');

await new Promise(r => setTimeout(r, 30));
assert.equal(statusHistory.includes('connected'), true, 'Status should transition to connected');
assert.equal(bridge.connected, true, 'Bridge should be marked as connected');
console.log('✓ WebSocket connects and reports status');

// 4. Test Receiving Speech Transcript
const mockWs = MockWebSocket.instances[0];
mockWs.onmessage({
  data: JSON.stringify({
    type: 'speech',
    text: 'Xin chào',
    lang: 'vi-VN'
  })
});

assert.equal(receivedTranscript, 'Xin chào', 'Transcript should match received speech text');
assert.equal(receivedLang, 'vi-VN', 'Language should match received speech lang');
console.log('✓ Bridge receives and delivers transcript callback');

// 4b. Test Whisper Hallucination Filter
receivedTranscript = null;
mockWs.onmessage({
  data: JSON.stringify({
    type: 'speech',
    text: 'Hãy subscribe cho kênh Ghiền Mì Gõ Để không bỏ lỡ những video hấp dẫn',
    lang: 'vi-VN'
  })
});
assert.equal(receivedTranscript, null, 'Hallucination text should be filtered out and not delivered');

mockWs.onmessage({
  data: JSON.stringify({
    type: 'speech',
    text: 'Hẹn gặp lại các bạn trong những video tiếp theo.',
    lang: 'vi-VN'
  })
});
assert.equal(receivedTranscript, null, 'Outro text should be filtered out and not delivered');
console.log('✓ Bridge properly filters out Whisper hallucinations');

// 5. Test Audio Level
mockWs.onmessage({
  data: JSON.stringify({
    type: 'audio_level',
    rms: 85.5,
    recording: true
  })
});

assert.deepEqual(receivedRms, { rms: 85.5, isRec: true }, 'Audio level should be parsed correctly');
console.log('✓ Bridge handles audio level messages');

// 6. Test Disconnect
bridge.disconnect();
assert.equal(bridge.connected, false, 'Bridge should be disconnected');
assert.equal(statusHistory.at(-1), 'disconnected', 'Status should be disconnected');
console.log('✓ Bridge disconnects cleanly');

// 7. Test TFT Streamer and Binary Framing
import { TFTFrameStreamer, TFT_HEADER_SIZE, TFT_MAGIC_0, TFT_MAGIC_1, TFT_PROTOCOL_VERSION } from '../src/hardware/tftFrameStreamer.js';

let lastAckReceived = null;
let lastErrorReceived = null;
const mockStreamer = {
  handleAck: (ack) => { lastAckReceived = ack; },
  handleError: (err) => { lastErrorReceived = err; },
  handleDisconnected: () => {}
};

bridge.setTftStreamer(mockStreamer);
bridge.connect('192.168.1.150');
await new Promise(r => setTimeout(r, 20));

const wsInstance = MockWebSocket.instances.at(-1);

// Test receiving tft_frame_ack
wsInstance.onmessage({
  data: JSON.stringify({ type: 'tft_frame_ack', frameId: 42, renderMs: 38 })
});
assert.equal(lastAckReceived?.frameId, 42, 'Bridge should forward tft_frame_ack to streamer');
assert.equal(lastAckReceived?.renderMs, 38, 'Render ms should match');
console.log('✓ Bridge forwards tft_frame_ack to TFT streamer');

// Test receiving tft_frame_error
wsInstance.onmessage({
  data: JSON.stringify({ type: 'tft_frame_error', frameId: 43, error: 'DECODE_FAILED' })
});
assert.equal(lastErrorReceived?.error, 'DECODE_FAILED', 'Bridge should forward error to streamer');
console.log('✓ Bridge forwards tft_frame_error to TFT streamer');

// Test binary send
const dummyBuffer = new Uint8Array([0x54, 0x46, 0x01, 0x01, 0x05, 0x00, 0x00, 0x00]);
bridge.sendBinary(dummyBuffer.buffer);
assert.equal(wsInstance.lastSent instanceof ArrayBuffer, true, 'sendBinary should transmit ArrayBuffer');
console.log('✓ Bridge sends binary buffer for TFT frame packets');

// Test TFTFrameStreamer header constants
assert.equal(TFT_HEADER_SIZE, 16);
assert.equal(TFT_MAGIC_0, 0x54);
assert.equal(TFT_MAGIC_1, 0x46);
assert.equal(TFT_PROTOCOL_VERSION, 1);
console.log('✓ TFT Protocol header constants and framing verified');

bridge.disconnect();

console.log('All ESP32 Bridge & TFT Streamer tests passed! ✅');

