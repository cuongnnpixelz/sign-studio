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
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();
    }, 10);
  }
  send(data) {
    this.lastSent = data;
  }
  close() {
    this.readyState = 3; // CLOSED
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

console.log('All ESP32 Bridge tests passed! ✅');

