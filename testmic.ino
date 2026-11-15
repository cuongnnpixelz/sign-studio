
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ESP_I2S.h>
#include <ArduinoJson.h>
#include <WebSocketsServer.h>
#include <math.h>

// =====================================
// 1. WIFI VA GROQ
// =====================================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* API_KEY   = "YOUR_GROQ_API_KEY";

// =====================================
// 2. MICRO INMP441
// =====================================
#define I2S_SCK 5
#define I2S_WS  6
#define I2S_SD  7

#define SAMPLE_RATE 16000
#define FRAME_SIZE 256

// =====================================
// 3. CAU HINH TU DONG GHI AM (TOI UU TOC DO MAX)
// =====================================
#define MAX_RECORD_MS 10000
#define SILENCE_MS 380       // Giam tu 900ms xuong 380ms: cat dut ngay khi ngung noi
#define MIN_VOICE_MS 180     // Giam tu 250ms xuong 180ms
#define PRE_ROLL_MS 180      // Giam tu 300ms xuong 180ms: nhe hon, gui nhanh hon

#define START_FRAMES 2       // Giam tu 4 xuong 2: bat dau ghi am ngay khi mo mieng nói

// Dieu chinh do nhay
#define MIN_START_RMS 70.0f
#define NOISE_MULTIPLIER 2.0f
#define MIN_STOP_RMS 35.0f

#define MAX_SAMPLES \
  (SAMPLE_RATE * MAX_RECORD_MS / 1000)

#define PRE_SAMPLES \
  (SAMPLE_RATE * PRE_ROLL_MS / 1000)

// =====================================
// 4. GROQ MULTIPART REQUEST (WAV)
// =====================================
const char BOUNDARY[] = "esp32s3speechboundary";
const uint8_t GROQ_MAX_ATTEMPTS = 4; // 1 lan gui + toi da 3 lan thu lai
const uint32_t GROQ_RETRY_BASE_MS = 2000;

const char FORM_PREFIX[] =
  "--esp32s3speechboundary\r\n"
  "Content-Disposition: form-data; name=\"model\"\r\n\r\n"
  "whisper-large-v3-turbo\r\n"
  "--esp32s3speechboundary\r\n"
  "Content-Disposition: form-data; name=\"language\"\r\n\r\n"
  "vi\r\n"
  "--esp32s3speechboundary\r\n"
  "Content-Disposition: form-data; name=\"response_format\"\r\n\r\n"
  "json\r\n"
  "--esp32s3speechboundary\r\n"
  "Content-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\n"
  "Content-Type: audio/wav\r\n\r\n";

const char FORM_SUFFIX[] =
  "\r\n--esp32s3speechboundary--\r\n";

const size_t PREFIX_LEN = sizeof(FORM_PREFIX) - 1;
const size_t SUFFIX_LEN = sizeof(FORM_SUFFIX) - 1;

const size_t MAX_WAV_SIZE = 44 + MAX_SAMPLES * 2;
const size_t MAX_BODY_SIZE =
  PREFIX_LEN + MAX_WAV_SIZE + SUFFIX_LEN;

// =====================================
// 5. BIEN TOAN CUC
// =====================================
I2SClass I2S;

int32_t rawSamples[FRAME_SIZE];
int16_t pcmFrame[FRAME_SIZE];

int16_t preRoll[PRE_SAMPLES];
size_t preWrite = 0;
size_t preCount = 0;

uint8_t* requestBuffer = nullptr;
uint8_t* wavBuffer = nullptr;
uint8_t* pcmBuffer = nullptr;

size_t recordedSamples = 0;
uint32_t voicedSamples = 0;

float noiseRms = 0;
float startThreshold = MIN_START_RMS;
float stopThreshold = MIN_STOP_RMS;

bool recording = false;
int startCounter = 0;

unsigned long lastVoiceTime = 0;
unsigned long lastPrintTime = 0;
unsigned long readyAt = 0;

// =====================================
// 5B. WEBSOCKET SERVER (Sign Studio Bridge)
// =====================================
WebSocketsServer webSocket(81);

unsigned long lastWsLevelTime = 0;

// Persistent HTTP client for super-fast Groq API requests
WiFiClientSecure groqClient;
HTTPClient groqHttp;

void wsEvent(uint8_t num, WStype_t type,
             uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf(
        "[WS] Client #%u ket noi!\n", num
      );
      {
        JsonDocument hello;
        hello["type"] = "hello";
        hello["device"] = "ESP32-S3";
        hello["mic"] = "INMP441";
        hello["sampleRate"] = SAMPLE_RATE;
        String msg;
        serializeJson(hello, msg);
        webSocket.sendTXT(num, msg);
      }
      break;

    case WStype_DISCONNECTED:
      Serial.printf(
        "[WS] Client #%u ngat ket noi.\n", num
      );
      break;

    case WStype_TEXT:
      // Nhan lenh tu Sign Studio (tuy chon)
      Serial.printf(
        "[WS] Nhan tu client #%u: %s\n",
        num, payload
      );
      break;

    default:
      break;
  }
}

// Gui van ban da nhan dang toi Sign Studio
void broadcastTranscript(
  const String& text,
  const String& lang
) {
  JsonDocument doc;
  doc["type"] = "speech";
  doc["text"] = text;
  doc["lang"] = lang;
  doc["source"] = "esp32-groq";
  doc["timestamp"] = millis();

  String json;
  serializeJson(doc, json);

  webSocket.broadcastTXT(json);

  Serial.print("-> Sign Studio: ");
  Serial.println(text);
}

// Gui RMS level (tuy chon, de hien thi tren UI)
void broadcastAudioLevel(
  float rms, bool isRecording
) {
  // Gioi han tan suat gui: moi 200ms
  unsigned long now = millis();
  if (now - lastWsLevelTime < 200) return;
  lastWsLevelTime = now;

  JsonDocument doc;
  doc["type"] = "audio_level";
  doc["rms"] = (int)(rms * 10) / 10.0f;
  doc["recording"] = isRecording;

  String json;
  serializeJson(doc, json);
  webSocket.broadcastTXT(json);
}

// =====================================
// 6. HAM GHI WAV HEADER
// =====================================
void put16(uint8_t* p, uint16_t value) {
  p[0] = value & 0xFF;
  p[1] = (value >> 8) & 0xFF;
}

void put32(uint8_t* p, uint32_t value) {
  for (int i = 0; i < 4; i++) {
    p[i] = (value >> (8 * i)) & 0xFF;
  }
}

void makeWavHeader(uint32_t dataBytes) {
  memcpy(wavBuffer, "RIFF", 4);
  put32(wavBuffer + 4, 36 + dataBytes);

  memcpy(wavBuffer + 8, "WAVE", 4);
  memcpy(wavBuffer + 12, "fmt ", 4);

  put32(wavBuffer + 16, 16);
  put16(wavBuffer + 20, 1);
  put16(wavBuffer + 22, 1);

  put32(wavBuffer + 24, SAMPLE_RATE);
  put32(wavBuffer + 28, SAMPLE_RATE * 2);

  put16(wavBuffer + 32, 2);
  put16(wavBuffer + 34, 16);

  memcpy(wavBuffer + 36, "data", 4);
  put32(wavBuffer + 40, dataBytes);
}

// =====================================
// 7. DOC MICRO VA TINH RMS
// =====================================
int readMicro(float &rms) {
  size_t bytesRead = I2S.readBytes(
    (char*)rawSamples,
    sizeof(rawSamples)
  );

  int count = bytesRead / sizeof(int32_t);

  if (count <= 0) {
    rms = 0;
    return 0;
  }

  double sum = 0;
  double sumSq = 0;

  for (int i = 0; i < count; i++) {
    int32_t value = rawSamples[i] >> 14;

    value = constrain(
      value, -32768L, 32767L
    );

    pcmFrame[i] = (int16_t)value;

    sum += value;
    sumSq += (double)value * value;
  }

  double mean = sum / count;

  rms = sqrt(fmax(
    0.0,
    sumSq / count - mean * mean
  ));

  return count;
}

// =====================================
// 8. TU DONG DO NHIÊU
// =====================================
void calibrateNoise() {
  Serial.println();
  Serial.println("Dang do nhieu moi truong...");
  Serial.println("Hay giu im lang 2 giay.");

  double total = 0;
  int frames = 0;

  unsigned long start = millis();

  while (millis() - start < 2000) {
    float rms;
    int count = readMicro(rms);

    if (count > 0) {
      total += rms;
      frames++;
    }
  }

  noiseRms = frames > 0
             ? total / frames : 0;

  startThreshold = fmaxf(
    MIN_START_RMS,
    noiseRms * NOISE_MULTIPLIER
  );

  stopThreshold = fmaxf(
    MIN_STOP_RMS,
    noiseRms * 1.35f
  );

  Serial.printf("Noise RMS: %.1f\n", noiseRms);
  Serial.printf("Start threshold: %.1f\n",
                startThreshold);
  Serial.printf("Stop threshold: %.1f\n",
                stopThreshold);

  Serial.println("SAN SANG LANG NGHE!");
}

// =====================================
// 9. BO DEM AM THANH TRUOC KHI NOI
// =====================================
void pushPreRoll(int count) {
  for (int i = 0; i < count; i++) {
    preRoll[preWrite] = pcmFrame[i];

    preWrite = (preWrite + 1) % PRE_SAMPLES;

    if (preCount < PRE_SAMPLES) {
      preCount++;
    }
  }
}

// =====================================
// 10. LUU MAU PCM VAO BO DEM
// =====================================
void appendSample(int16_t sample) {
  if (recordedSamples >= MAX_SAMPLES) {
    return;
  }

  size_t offset = recordedSamples * 2;
  uint16_t value = (uint16_t)sample;

  pcmBuffer[offset] = value & 0xFF;
  pcmBuffer[offset + 1] = (value >> 8) & 0xFF;

  recordedSamples++;
}

void appendFrame(int count) {
  for (int i = 0; i < count; i++) {
    appendSample(pcmFrame[i]);
  }
}

void copyPreRoll() {
  size_t index =
    (preWrite + PRE_SAMPLES - preCount)
    % PRE_SAMPLES;

  for (size_t i = 0; i < preCount; i++) {
    appendSample(preRoll[index]);
    index = (index + 1) % PRE_SAMPLES;
  }
}

// =====================================
// 11. BAT DAU GHI AM
// =====================================
void startRecording(int count) {
  recording = true;

  recordedSamples = 0;
  voicedSamples = START_FRAMES * count;

  copyPreRoll();

  lastVoiceTime = millis();

  Serial.println();
  Serial.println("==========================");
  Serial.println("PHAT HIEN AM THANH!");
  Serial.println("DANG GHI AM...");
}

// =====================================
// 12. CHUAN HOA AM LUONG
// =====================================
void normalizeAudio() {
  int32_t peak = 0;

  for (size_t i = 0; i < recordedSamples; i++) {
    uint16_t raw =
      (uint16_t)pcmBuffer[i * 2] |
      ((uint16_t)pcmBuffer[i * 2 + 1] << 8);

    int16_t sample = (int16_t)raw;
    int32_t magnitude = abs((int32_t)sample);

    if (magnitude > peak) peak = magnitude;
  }

  if (peak == 0) return;

  float gain = fminf(
    16000.0f / peak,
    80.0f
  );

  if (gain < 1.0f) gain = 1.0f;

  for (size_t i = 0; i < recordedSamples; i++) {
    uint16_t raw =
      (uint16_t)pcmBuffer[i * 2] |
      ((uint16_t)pcmBuffer[i * 2 + 1] << 8);

    int16_t sample = (int16_t)raw;

    int32_t scaled = (int32_t)(sample * gain);

    scaled = constrain(
      scaled, -32768L, 32767L
    );

    uint16_t output = (uint16_t)scaled;

    pcmBuffer[i * 2] = output & 0xFF;
    pcmBuffer[i * 2 + 1] = (output >> 8) & 0xFF;
  }

  Serial.printf("Audio gain: %.2f\n", gain);
}

// =====================================
// 13. GUI AUDIO LEN GROQ API
// =====================================
void sendToGroq() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Mat WiFi! Dang ket noi lai.");

    WiFi.reconnect();

    unsigned long start = millis();

    while (WiFi.status() != WL_CONNECTED &&
           millis() - start < 10000) {
      delay(250);
    }

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Khong the gui audio!");
      return;
    }
  }

  normalizeAudio();

  uint32_t dataBytes = recordedSamples * 2;

  makeWavHeader(dataBytes);

  size_t wavSize = 44 + dataBytes;

  memcpy(
    wavBuffer + wavSize,
    FORM_SUFFIX,
    SUFFIX_LEN
  );

  size_t bodySize =
    PREFIX_LEN + wavSize + SUFFIX_LEN;

  Serial.printf("WAV size: %u bytes\n",
                (unsigned)wavSize);

  Serial.println("Dang gui audio den Groq...");

  const char* url = "https://api.groq.com/openai/v1/audio/transcriptions";

  int status = 0;
  String response;
  unsigned long t0 = millis();

  // Khoi tao ket noi Keep-Alive neu chua ket noi
  if (!groqHttp.connected()) {
    groqHttp.begin(groqClient, url);
    groqHttp.setTimeout(8000);
    groqHttp.setReuse(true);
  }

  groqHttp.addHeader("Authorization", String("Bearer ") + API_KEY);
  groqHttp.addHeader("Content-Type", String("multipart/form-data; boundary=") + BOUNDARY);
  groqHttp.addHeader("Connection", "keep-alive");

  status = groqHttp.POST(requestBuffer, bodySize);
  response = groqHttp.getString();

  unsigned long groqDuration = millis() - t0;
  Serial.printf("Groq phan hoi trong: %lu ms | HTTP Status: %d\n", groqDuration, status);

  // Neu loi ket noi (timeout / disconnect), ngat de lan sau reconnect
  if (status <= 0 || status >= 500) {
    groqHttp.end();
  }

  if (status == 200) {
    JsonDocument doc;

    DeserializationError err =
      deserializeJson(doc, response);

    if (!err) {
      String transcript = doc["text"] | "";
      transcript.trim();

      if (transcript.length() > 0) {
        Serial.println();
        Serial.println("====== SPEECH TO TEXT ======");
        Serial.print("VAN BAN: ");
        Serial.println(transcript);
        Serial.println("============================");

        // >>> GUI TEXT TOI SIGN STUDIO <<<
        broadcastTranscript(transcript, "vi-VN");
      } else {
        Serial.println("Groq khong tra ve van ban. Chi tiet:");
        Serial.println(response);
      }
    } else {
      Serial.println("JSON ERROR!");
      Serial.println(response);
    }
  } else {
    Serial.println("API ERROR:");
    Serial.println(response);
    if (status < 0) {
      Serial.println(HTTPClient::errorToString(status));
    } else if (status == 400 || status == 401 || status == 403) {
      Serial.println("Kiem tra Groq API key, quyen truy cap va noi dung loi tren.");
    } else if (status == 404) {
      Serial.println("Kiem tra endpoint va model trong FORM_PREFIX co kha dung tren Groq.");
    } else if (status == 429) {
      Serial.println("Vuot han muc Groq. Kiem tra quota/billing va thu lai sau.");
    } else if (status == 500 || status == 502 || status == 503 || status == 504) {
      Serial.println("Da het so lan thu lai. Groq van loi tam thoi; hay thu noi lai sau.");
    }
  }
}

// =====================================
// 14. KET THUC GHI AM
// =====================================
void finishRecording() {
  recording = false;

  uint32_t duration =
    (recordedSamples * 1000UL) / SAMPLE_RATE;

  uint32_t voiceDuration =
    (voicedSamples * 1000UL) / SAMPLE_RATE;

  Serial.println("DA DUNG GHI AM.");

  Serial.printf("Duration: %lu ms\n",
                (unsigned long)duration);

  Serial.printf("Voiced: %lu ms\n",
                (unsigned long)voiceDuration);

  if (voiceDuration >= MIN_VOICE_MS) {
    sendToGroq();
  } else {
    Serial.println("Am thanh qua ngan. Bo qua.");
  }

  preCount = 0;
  preWrite = 0;
  startCounter = 0;

  readyAt = millis() + 150;

  Serial.println();
  Serial.println("TIEP TUC LANG NGHE...");
}

// =====================================
// 15. SETUP
// =====================================
void setup() {
  // Chay CPU ESP32-S3 o xung nhip toi da 240MHz de ma hoa TLS sieu nhanh
  setCpuFrequencyMhz(240);

  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("ESP32-S3 AUTO SPEECH TO TEXT");

  // Cap phat bo nho PSRAM
  if (!psramFound()) {
    Serial.println("ERROR: KHONG CO PSRAM!");
    Serial.println("Can board ESP32-S3 co PSRAM.");
    while (true) delay(1000);
  }

  requestBuffer =
    (uint8_t*)ps_malloc(MAX_BODY_SIZE);

  if (requestBuffer == nullptr) {
    Serial.println("KHONG DU PSRAM!");
    while (true) delay(1000);
  }

  memcpy(
    requestBuffer,
    FORM_PREFIX,
    PREFIX_LEN
  );

  wavBuffer = requestBuffer + PREFIX_LEN;
  pcmBuffer = wavBuffer + 44;

  Serial.printf("PSRAM free: %u bytes\n",
                (unsigned)ESP.getFreePsram());

  // Khoi tao micro
  I2S.setPins(I2S_SCK, I2S_WS, -1, I2S_SD);

  if (!I2S.begin(
    I2S_MODE_STD,
    SAMPLE_RATE,
    I2S_DATA_BIT_WIDTH_32BIT,
    I2S_SLOT_MODE_MONO,
    I2S_STD_SLOT_LEFT
  )) {
    Serial.println("I2S ERROR!");
    while (true) delay(1000);
  }

  // Ket noi WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Connecting WiFi");

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi chua ket noi.");
  }

  // Cau hinh SSL va HTTP Keep-Alive san sang
  groqClient.setInsecure();
  groqHttp.setReuse(true);

  // Khoi tao WebSocket server cho Sign Studio
  webSocket.begin();
  webSocket.onEvent(wsEvent);
  Serial.println();
  Serial.println("WebSocket server dang chay!");
  Serial.printf(
    "Sign Studio ket noi tai: ws://%s:81\n",
    WiFi.localIP().toString().c_str()
  );

  calibrateNoise();
}

// =====================================
// 16. MAIN LOOP
// =====================================
void loop() {
  // Xu ly WebSocket clients
  webSocket.loop();

  float rms = 0;
  int count = readMicro(rms);

  if (count <= 0) {
    delay(1);
    return;
  }

  // Gui RMS level toi Sign Studio
  broadcastAudioLevel(rms, recording);

  unsigned long now = millis();

  // In RMS moi 350ms
  if (now - lastPrintTime >= 350) {
    Serial.printf(
      "RMS: %.1f | State: %s\n",
      rms,
      recording ? "RECORDING" : "LISTENING"
    );

    lastPrintTime = now;
  }

  // ===== CHUA GHI AM =====
  if (!recording) {

    if (now < readyAt) return;

    pushPreRoll(count);

    if (rms >= startThreshold) {
      startCounter++;
    } else {
      startCounter = 0;
    }

    if (startCounter >= START_FRAMES) {
      startRecording(count);
      startCounter = 0;
    }

    return;
  }

  // ===== DANG GHI AM =====
  appendFrame(count);

  if (rms >= stopThreshold) {
    lastVoiceTime = now;
    voicedSamples += count;
  }

  bool silence =
    (now - lastVoiceTime >= SILENCE_MS);

  bool tooLong =
    (recordedSamples >= MAX_SAMPLES);

  if (silence || tooLong) {
    finishRecording();
  }
}
