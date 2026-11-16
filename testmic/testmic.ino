#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ESP_I2S.h>
#include <ArduinoJson.h>
#include <WebSocketsServer.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <JPEGDecoder.h>
#include <math.h>

// =====================================
// 1. WIFI VA GROQ (THONG TIN CA NHAN)
// =====================================
#if __has_include("secrets.h")
  #include "secrets.h"
#endif

#ifndef WIFI_SSID
  #define WIFI_SSID "YOUR_WIFI_SSID"
#endif

#ifndef WIFI_PASS
  #define WIFI_PASS "YOUR_WIFI_PASSWORD"
#endif

#ifndef API_KEY
  #define API_KEY "YOUR_GROQ_API_KEY"
#endif

// =====================================
// 2. MICRO INMP441 (I2S) - GIU NGUYEN GPIO 5, 6, 7
// =====================================
#define I2S_SCK 5
#define I2S_WS  6
#define I2S_SD  7

#define SAMPLE_RATE 16000
#define FRAME_SIZE 256

// =====================================
// 3. MAN HINH TFT LCD ST7789 2.8" (SPI)
// =====================================
#define TFT_CS   40
#define TFT_RST  42
#define TFT_DC   41
#define TFT_MOSI 39
#define TFT_SCK  38
#define TFT_MISO 2 // Tuy chon (ST7789 truyen 1 chieu Write-Only)

#define TFT_WIDTH  320
#define TFT_HEIGHT 240
#define MAX_JPEG_SIZE (64 * 1024) // 64KB toi da moi frame JPEG

// Protocol Constants
#define TFT_MAGIC_0 0x54 // 'T'
#define TFT_MAGIC_1 0x46 // 'F'
#define TFT_PROTOCOL_VERSION 1
#define TFT_MSG_FRAME_CHUNK 1

SPIClass tftSPI(FSPI);
Adafruit_ST7789 tft(&tftSPI, TFT_CS, TFT_DC, TFT_RST);

// Buffers trong PSRAM cho JPEG streaming
uint8_t* tftRxBuffer = nullptr;
uint8_t* tftRenderBuffer = nullptr;
size_t tftRxBytes = 0;
uint32_t tftRxFrameId = 0;
uint16_t tftRxExpectedChunk = 0;
uint32_t tftRxTotalSize = 0;

volatile bool tftStreamActive = false;
volatile bool tftNewFrameReady = false;
volatile uint32_t tftRenderFrameId = 0;
volatile size_t tftRenderFrameSize = 0;

volatile uint32_t tftAckFrameId = 0;
volatile uint32_t tftAckRenderMs = 0;

// =====================================
// 4. CAU HINH TU DONG GHI AM (VAD) & LOC NHIEU (TANG 1)
// =====================================
#define MAX_RECORD_MS 10000
#define SILENCE_MS 450         // 450ms khoang lang de ket thuc cau (giu tron cau, khong bi dut quang)
#define MIN_VOICE_MS 500       // Toi thieu 500ms co am thanh giong noi (loai bo tap am/tieng tho)
#define PRE_ROLL_MS 200        // Luu 200ms am thanh dem truoc khi noi de khong mat am dau
#define START_FRAMES 3         // Can 3 frames lien tiep (>48ms) tren nguong de bat dau ghi am

#define MIN_START_RMS 90.0f    // Nguong RMS khoi dong thu am (chong kich hoat vi tieng tho nhe)
#define NOISE_MULTIPLIER 2.3f  // He so nhan tieng on nen
#define MIN_STOP_RMS 55.0f     // Nguong RMS toi thieu de duy tri ghi am
#define MIN_VOICE_PEAK 2000    // Nguong bien do dinh toi thieu de coi la giong nguoi noi (Noise Gate)

#define MAX_SAMPLES (SAMPLE_RATE * MAX_RECORD_MS / 1000)
#define PRE_SAMPLES (SAMPLE_RATE * PRE_ROLL_MS / 1000)

// =====================================
// 5. GROQ MULTIPART REQUEST (WAV) & CHONG AO GIAC (TANG 2)
// =====================================
const char BOUNDARY[] = "esp32s3speechboundary";
const char FORM_PREFIX[] =
  "--esp32s3speechboundary\r\n"
  "Content-Disposition: form-data; name=\"model\"\r\n\r\n"
  "whisper-large-v3-turbo\r\n"
  "--esp32s3speechboundary\r\n"
  "Content-Disposition: form-data; name=\"language\"\r\n\r\n"
  "vi\r\n"
  "--esp32s3speechboundary\r\n"
  "Content-Disposition: form-data; name=\"temperature\"\r\n\r\n"
  "0.0\r\n"
  "--esp32s3speechboundary\r\n"
  "Content-Disposition: form-data; name=\"prompt\"\r\n\r\n"
  "Hội thoại giao tiếp tiếng Việt: Xin chào, cảm ơn, tạm biệt, tôi tên là, bạn đi đâu, ăn cơm.\r\n"
  "--esp32s3speechboundary\r\n"
  "Content-Disposition: form-data; name=\"response_format\"\r\n\r\n"
  "json\r\n"
  "--esp32s3speechboundary\r\n"
  "Content-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\n"
  "Content-Type: audio/wav\r\n\r\n";

const char FORM_SUFFIX[] = "\r\n--esp32s3speechboundary--\r\n";

const size_t PREFIX_LEN = sizeof(FORM_PREFIX) - 1;
const size_t SUFFIX_LEN = sizeof(FORM_SUFFIX) - 1;
const size_t MAX_WAV_SIZE = 44 + MAX_SAMPLES * 2;
const size_t MAX_BODY_SIZE = PREFIX_LEN + MAX_WAV_SIZE + SUFFIX_LEN;

// =====================================
// 6. BIEN TOAN CUC AM THANH & WEBSOCKET
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

WebSocketsServer webSocket(81);
unsigned long lastWsLevelTime = 0;

WiFiClientSecure groqClient;
HTTPClient groqHttp;

// FreeRTOS Task cho Groq Whisper (Core 0 de khong chan Core 1 render TFT)
TaskHandle_t groqTaskHandle = NULL;
volatile bool groqRequestPending = false;
volatile size_t groqBodySize = 0;
volatile bool transcriptReadyToSend = false;
String pendingTranscript = "";

// Forward declarations
void drawTftSplash();
void renderTftJpeg(uint8_t* jpegData, size_t jpegSize);

// =====================================
// 7. WEBSOCKET EVENT HANDLER
// =====================================
void wsEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      Serial.printf("[WS] Client #%u ket noi!\n", num);
      JsonDocument hello;
      hello["type"] = "hello";
      hello["device"] = "ESP32-S3";
      hello["mic"] = "INMP441";
      hello["sampleRate"] = SAMPLE_RATE;
      hello["tft"] = "ST7789";
      hello["width"] = TFT_WIDTH;
      hello["height"] = TFT_HEIGHT;
      hello["maxChunk"] = 4096;
      hello["psramFree"] = (uint32_t)ESP.getFreePsram();

      String msg;
      serializeJson(hello, msg);
      webSocket.sendTXT(num, msg);

      // Thong bao TFT san sang
      JsonDocument ready;
      ready["type"] = "tft_ready";
      ready["width"] = TFT_WIDTH;
      ready["height"] = TFT_HEIGHT;
      ready["maxChunk"] = 4096;
      ready["psramFree"] = (uint32_t)ESP.getFreePsram();
      String rmsg;
      serializeJson(ready, rmsg);
      webSocket.sendTXT(num, rmsg);
      break;
    }

    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client #%u ngat ket noi.\n", num);
      tftStreamActive = false;
      drawTftSplash();
      break;

    case WStype_TEXT: {
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (!err) {
        const char* msgType = doc["type"] | "";
        if (strcmp(msgType, "tft_stream_start") == 0) {
          tftStreamActive = true;
          tftRxFrameId = 0;
          tftRxExpectedChunk = 0;
          tftRxBytes = 0;
          Serial.println("[TFT] Bat dau che do stream avatar 3D len ST7789!");
        } else if (strcmp(msgType, "tft_stream_stop") == 0) {
          tftStreamActive = false;
          drawTftSplash();
          Serial.println("[TFT] Dung che do stream avatar.");
        } else if (strcmp(msgType, "tft_invert") == 0) {
          bool inv = doc["invert"] | false;
          tft.invertDisplay(inv);
          Serial.printf("[TFT] Set invert: %d\n", inv);
        } else if (strcmp(msgType, "tft_rotation") == 0) {
          uint8_t rot = doc["rotation"] | 1;
          tft.setRotation(rot);
          Serial.printf("[TFT] Set rotation: %d\n", rot);
        }
      }
      break;
    }

    case WStype_BIN: {
      // Xy ly chunk binary JPEG tu Sign Studio
      if (length < 16) return;

      // Kiem tra Magic 0x54 ('T'), 0x46 ('F') va Version
      if (payload[0] != TFT_MAGIC_0 || payload[1] != TFT_MAGIC_1 || payload[2] != TFT_PROTOCOL_VERSION) {
        return;
      }

      uint32_t frameId = *(uint32_t*)(payload + 4);
      uint16_t chunkIndex = *(uint16_t*)(payload + 8);
      uint16_t totalChunks = *(uint16_t*)(payload + 10);
      uint32_t totalSize = *(uint32_t*)(payload + 12);
      size_t chunkPayloadLen = length - 16;

      if (totalSize == 0 || totalSize > MAX_JPEG_SIZE) return;

      // Neu nhan duoc frame moi hon frame dang do dang -> bo qua frame cu de bat dau frame moi
      if (frameId > tftRxFrameId) {
        tftRxFrameId = frameId;
        tftRxExpectedChunk = 0;
        tftRxBytes = 0;
        tftRxTotalSize = totalSize;
      } else if (frameId < tftRxFrameId) {
        // Frame cu da bi bo qua
        return;
      }

      // Kiem tra thu tu chunk
      if (chunkIndex == tftRxExpectedChunk) {
        if (tftRxBytes + chunkPayloadLen <= MAX_JPEG_SIZE) {
          memcpy(tftRxBuffer + tftRxBytes, payload + 16, chunkPayloadLen);
          tftRxBytes += chunkPayloadLen;
          tftRxExpectedChunk++;
        }

        // Kiem tra xem frame da nhan du toan bo chua (Pipelining zero-copy swap)
        if (tftRxExpectedChunk == totalChunks && tftRxBytes == tftRxTotalSize) {
          uint8_t* temp = tftRenderBuffer;
          tftRenderBuffer = tftRxBuffer;
          tftRxBuffer = temp;
          tftRenderFrameId = tftRxFrameId;
          tftRenderFrameSize = tftRxBytes;
          tftNewFrameReady = true;

          // Reset rx state cho frame tiep theo
          tftRxBytes = 0;
          tftRxExpectedChunk = 0;
        }
      } else {
        // Mat chunk -> bo frame nay de doi frame tiep theo
        tftRxBytes = 0;
        tftRxExpectedChunk = 0;
      }
      break;
    }

    default:
      break;
  }
}

// Gui van ban da nhan dang toi Sign Studio
void broadcastTranscript(const String& text, const String& lang) {
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

// Gui RMS level toi Sign Studio
void broadcastAudioLevel(float rms, bool isRecording) {
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
// 8. VE GIAO DIEN CHAO (SPLASH SCREEN)
// =====================================
void drawTftSplash() {
  tft.fillScreen(0x0821); // Dark navy
  tft.drawRect(2, 2, TFT_WIDTH - 4, TFT_HEIGHT - 4, 0x07E0); // Green border

  tft.setTextSize(2);
  tft.setTextColor(0xFFFF, 0x0821);
  tft.setCursor(16, 16);
  tft.println("SIGN STUDIO 3D");

  tft.setTextSize(1);
  tft.setTextColor(0x07FF, 0x0821); // Cyan
  tft.setCursor(16, 42);
  tft.println("ESP32-S3 + ST7789 TFT 2.8\" (320x240)");

  tft.setTextColor(0xFFFF, 0x0821);
  tft.setCursor(16, 68);
  tft.printf("Micro: INMP441 (GPIO 5,6,7) - OK\n");

  tft.setCursor(16, 88);
  tft.printf("PSRAM: %u KB Free\n", (unsigned)(ESP.getFreePsram() / 1024));

  tft.setCursor(16, 108);
  if (WiFi.status() == WL_CONNECTED) {
    tft.printf("WiFi: %s (%s)\n", WIFI_SSID, WiFi.localIP().toString().c_str());
  } else {
    tft.println("WiFi: Dang ket noi...");
  }

  tft.setCursor(16, 128);
  tft.printf("WebSocket: ws://%s:81\n", WiFi.localIP().toString().c_str());

  tft.setCursor(16, 158);
  tft.setTextColor(0xFFE0, 0x0821); // Yellow
  tft.println("TRANG THAI: San sang nhan am thanh.");

  tft.setCursor(16, 185);
  tft.setTextColor(0x567F, 0x0821); // Light cyan/gray
  tft.println("Bam 'Truyen TFT' tren trinh duyet Sign Studio");
  tft.setCursor(16, 202);
  tft.println("de xem Avatar 3D dong thoi tren man hinh nay!");
}

// =====================================
// 9. GIAI MA JPEG VA VE RA ST7789
// =====================================
void renderTftJpeg(uint8_t* jpegData, size_t jpegSize) {
  unsigned long t0 = millis();

  if (!JpegDec.decodeArray(jpegData, jpegSize)) {
    Serial.println("[TFT] Lỗi giải mã JPEG!");
    return;
  }

  uint16_t *pImg;
  uint16_t mcu_w = JpegDec.MCUWidth;
  uint16_t mcu_h = JpegDec.MCUHeight;
  uint32_t max_x = JpegDec.width;
  uint32_t max_y = JpegDec.height;

  uint32_t min_w = ((mcu_w < (max_x % mcu_w)) ? mcu_w : (max_x % mcu_w));
  uint32_t min_h = ((mcu_h < (max_y % mcu_h)) ? mcu_h : (max_y % mcu_h));
  if (max_x % mcu_w == 0) min_w = mcu_w;
  if (max_y % mcu_h == 0) min_h = mcu_h;

  uint32_t win_w = mcu_w;
  uint32_t win_h = mcu_h;

  tft.startWrite();
  while (JpegDec.read()) {
    pImg = JpegDec.pImage;
    int mcu_x = JpegDec.MCUx * mcu_w;
    int mcu_y = JpegDec.MCUy * mcu_h;

    if (mcu_x + mcu_w <= max_x) win_w = mcu_w;
    else win_w = min_w;

    if (mcu_y + mcu_h <= max_y) win_h = mcu_h;
    else win_h = min_h;

    if (win_w != mcu_w) {
      for (int h = 1; h < win_h - 1; h++) {
        memcpy(pImg + h * win_w, pImg + (h + 1) * mcu_w, win_w << 1);
      }
    }

    if ((mcu_x + win_w) <= tft.width() && (mcu_y + win_h) <= tft.height()) {
      tft.setAddrWindow(mcu_x, mcu_y, win_w, win_h);
      if (win_w == mcu_w) {
        tft.writePixels(pImg, win_w * win_h);
      } else {
        for (int h = 0; h < win_h; h++) {
          tft.writePixels(pImg + h * win_w, win_w);
        }
      }
    } else if ((mcu_y + win_h) >= tft.height()) {
      JpegDec.abort();
      break;
    }
  }
  tft.endWrite();

  uint32_t renderMs = millis() - t0;
  // Gui ACK ngay lap tuc de browser gui tiep frame moi ma khong bi I2S delay
  JsonDocument ack;
  ack["type"] = "tft_frame_ack";
  ack["frameId"] = tftRenderFrameId;
  ack["renderMs"] = renderMs;
  String ackMsg;
  serializeJson(ack, ackMsg);
  webSocket.broadcastTXT(ackMsg);
}

// =====================================
// 10. WAV HEADER FUNCTIONS
// =====================================
void put16(uint8_t* p, uint16_t value) {
  p[0] = (uint8_t)(value & 0xFF);
  p[1] = (uint8_t)((value >> 8) & 0xFF);
}

void put32(uint8_t* p, uint32_t value) {
  p[0] = (uint8_t)(value & 0xFF);
  p[1] = (uint8_t)((value >> 8) & 0xFF);
  p[2] = (uint8_t)((value >> 16) & 0xFF);
  p[3] = (uint8_t)((value >> 24) & 0xFF);
}

void makeWavHeader(uint32_t dataBytes) {
  uint32_t totalChunkSize = 36 + dataBytes;
  uint16_t channels = 1;
  uint32_t sampleRate = SAMPLE_RATE;
  uint16_t bitsPerSample = 16;
  uint32_t byteRate = sampleRate * channels * (bitsPerSample / 8);
  uint16_t blockAlign = channels * (bitsPerSample / 8);

  memcpy(wavBuffer, "RIFF", 4);
  put32(wavBuffer + 4, totalChunkSize);
  memcpy(wavBuffer + 8, "WAVE", 4);

  memcpy(wavBuffer + 12, "fmt ", 4);
  put32(wavBuffer + 16, 16);
  put16(wavBuffer + 20, 1);
  put16(wavBuffer + 22, channels);
  put32(wavBuffer + 24, sampleRate);
  put32(wavBuffer + 28, byteRate);
  put16(wavBuffer + 32, blockAlign);
  put16(wavBuffer + 34, bitsPerSample);

  memcpy(wavBuffer + 36, "data", 4);
  put32(wavBuffer + 40, dataBytes);
}

// =====================================
// 11. DOC AM THANH TU MICRO
// =====================================
int readMicro(float &rms) {
  size_t bytesRead = I2S.readBytes((char*)rawSamples, sizeof(rawSamples));

  if (bytesRead == 0) {
    rms = 0;
    return 0;
  }

  int count = bytesRead / sizeof(int32_t);
  double sumSq = 0;

  for (int i = 0; i < count; i++) {
    int32_t s32 = rawSamples[i] >> 14;
    if (s32 > 32767) s32 = 32767;
    else if (s32 < -32768) s32 = -32768;

    int16_t s16 = (int16_t)s32;
    pcmFrame[i] = s16;
    sumSq += (double)s16 * (double)s16;
  }

  rms = sqrt(sumSq / count);
  return count;
}

void calibrateNoise() {
  Serial.println("Dang do tieng on moi truong (1 giay)...");
  double sumRms = 0;
  int rounds = 0;
  unsigned long start = millis();

  while (millis() - start < 1000) {
    float rms = 0;
    int count = readMicro(rms);
    if (count > 0) {
      sumRms += rms;
      rounds++;
    }
    delay(5);
  }

  if (rounds > 0) noiseRms = sumRms / rounds;
  else noiseRms = 30.0f;

  startThreshold = noiseRms * NOISE_MULTIPLIER;
  if (startThreshold < MIN_START_RMS) startThreshold = MIN_START_RMS;
  stopThreshold = startThreshold * 0.65f;
  if (stopThreshold < MIN_STOP_RMS) stopThreshold = MIN_STOP_RMS;

  Serial.printf("Noise RMS: %.1f | Start: %.1f | Stop: %.1f\n", noiseRms, startThreshold, stopThreshold);
}

void pushPreRoll(int count) {
  for (int i = 0; i < count; i++) {
    preRoll[preWrite] = pcmFrame[i];
    preWrite = (preWrite + 1) % PRE_SAMPLES;
    if (preCount < PRE_SAMPLES) preCount++;
  }
}

void appendSample(int16_t sample) {
  if (recordedSamples < MAX_SAMPLES) {
    size_t offset = recordedSamples * 2;
    pcmBuffer[offset] = (uint8_t)(sample & 0xFF);
    pcmBuffer[offset + 1] = (uint8_t)((sample >> 8) & 0xFF);
    recordedSamples++;
  }
}

void appendFrame(int count) {
  for (int i = 0; i < count; i++) {
    appendSample(pcmFrame[i]);
  }
}

void copyPreRoll() {
  if (preCount == 0) return;
  size_t readIndex;
  if (preCount < PRE_SAMPLES) readIndex = 0;
  else readIndex = preWrite;

  for (size_t i = 0; i < preCount; i++) {
    appendSample(preRoll[readIndex]);
    readIndex = (readIndex + 1) % PRE_SAMPLES;
  }
}

void startRecording(int count) {
  Serial.println("\n>>> PHAT HIEN GIONG NOI! DANG GHI AM...");
  recording = true;
  recordedSamples = 0;
  voicedSamples = 0;
  lastVoiceTime = millis();
  copyPreRoll();
  appendFrame(count);
  voicedSamples += count;
}

int16_t getAudioMaxPeak() {
  if (recordedSamples == 0) return 0;
  int16_t maxVal = 0;

  for (size_t i = 0; i < recordedSamples; i++) {
    size_t off = i * 2;
    int16_t s = (int16_t)(pcmBuffer[off] | (pcmBuffer[off + 1] << 8));
    int16_t absS = abs(s);
    if (absS > maxVal) maxVal = absS;
  }
  return maxVal;
}

void normalizeAudio(int16_t maxVal) {
  if (recordedSamples == 0 || maxVal < MIN_VOICE_PEAK) return;

  if (maxVal < 14000) {
    float gain = 24000.0f / maxVal;
    if (gain > 4.5f) gain = 4.5f; // Gioi han gain 4.5x de tranh khuech dai tieng hiss/on nen
    for (size_t i = 0; i < recordedSamples; i++) {
      size_t off = i * 2;
      int16_t s = (int16_t)(pcmBuffer[off] | (pcmBuffer[off + 1] << 8));
      int32_t scaled = (int32_t)(s * gain);
      if (scaled > 32767) scaled = 32767;
      else if (scaled < -32768) scaled = -32768;
      pcmBuffer[off] = (uint8_t)(scaled & 0xFF);
      pcmBuffer[off + 1] = (uint8_t)((scaled >> 8) & 0xFF);
    }
  }
}

// Kiem tra tu khoa ao giac dac trung cua Whisper YouTube
bool isWhisperHallucination(const String& text) {
  String lower = text;
  lower.toLowerCase();

  const char* blacklist[] = {
    "subscribe",
    "ghiền mì gõ",
    "ghien mi go",
    "la la school",
    "lala school",
    "video hấp dẫn",
    "video hap dan",
    "video tiếp theo",
    "video tiep theo",
    "những video",
    "nhung video",
    "đăng ký kênh",
    "dang ky kenh",
    "like và",
    "like va",
    "theo dõi và hẹn",
    "theo doi va hen",
    "hẹn gặp lại các bạn",
    "hen gap lai cac ban",
    "cảm ơn các bạn đã theo dõi",
    "cam on cac ban da theo doi",
    "chuông thông báo",
    "chuong thong bao"
  };

  for (size_t i = 0; i < sizeof(blacklist) / sizeof(blacklist[0]); i++) {
    if (lower.indexOf(blacklist[i]) >= 0 || text.indexOf(blacklist[i]) >= 0) {
      return true;
    }
  }
  return false;
}

// =====================================
// 12. FREERTOS TASK CHO GROQ WHISPER
// Chay doc lap tren Core 0 de khong lam giat render ST7789
// =====================================
void groqWorkerTask(void* param) {
  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

    if (!groqRequestPending) continue;

    const char* url = "https://api.groq.com/openai/v1/audio/transcriptions";
    unsigned long t0 = millis();

    if (!groqHttp.connected()) {
      groqHttp.begin(groqClient, url);
      groqHttp.setTimeout(8000);
      groqHttp.setReuse(true);
    }

    groqHttp.addHeader("Authorization", String("Bearer ") + API_KEY);
    groqHttp.addHeader("Content-Type", String("multipart/form-data; boundary=") + BOUNDARY);
    groqHttp.addHeader("Connection", "keep-alive");

    int status = groqHttp.POST(requestBuffer, groqBodySize);
    String response = groqHttp.getString();
    unsigned long groqDuration = millis() - t0;

    Serial.printf("[Groq] Ket qua trong %lu ms | HTTP: %d\n", groqDuration, status);

    if (status <= 0 || status >= 500) {
      groqHttp.end();
    }

    if (status == 200) {
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, response);
      if (!err) {
        String transcript = doc["text"] | "";
        transcript.trim();
        if (transcript.length() > 0) {
          if (isWhisperHallucination(transcript)) {
            Serial.printf("[Groq] Loc bo ao giac Whisper (Hallucination): \"%s\"\n", transcript.c_str());
          } else {
            pendingTranscript = transcript;
            transcriptReadyToSend = true;
          }
        }
      }
    } else {
      Serial.println("[Groq] Loi API:");
      Serial.println(response);
    }

    groqRequestPending = false;
  }
}

void finishRecording() {
  recording = false;
  uint32_t duration = (recordedSamples * 1000UL) / SAMPLE_RATE;
  uint32_t voiceDuration = (voicedSamples * 1000UL) / SAMPLE_RATE;

  int16_t maxVal = getAudioMaxPeak();

  Serial.printf("DA DUNG GHI AM. Duration: %lu ms | Voiced: %lu ms | Peak: %d\n",
                (unsigned long)duration, (unsigned long)voiceDuration, maxVal);

  // Tang 1: Kiem tra do dai giong noi va bien do dinh toi thieu
  if (voiceDuration >= MIN_VOICE_MS && maxVal >= MIN_VOICE_PEAK) {
    if (WiFi.status() == WL_CONNECTED && !groqRequestPending) {
      normalizeAudio(maxVal);
      uint32_t dataBytes = recordedSamples * 2;
      makeWavHeader(dataBytes);
      size_t wavSize = 44 + dataBytes;
      memcpy(wavBuffer + wavSize, FORM_SUFFIX, SUFFIX_LEN);
      groqBodySize = PREFIX_LEN + wavSize + SUFFIX_LEN;
      groqRequestPending = true;

      // Danh thuc Task tren Core 0 de gui HTTP khong chan Core 1
      if (groqTaskHandle != NULL) {
        xTaskNotifyGive(groqTaskHandle);
      }
    }
  } else {
    if (voiceDuration < MIN_VOICE_MS) {
      Serial.printf("[VAD] Bo qua: Thoi gian giong noi qua ngan (%lu ms < %d ms)\n",
                    (unsigned long)voiceDuration, MIN_VOICE_MS);
    } else if (maxVal < MIN_VOICE_PEAK) {
      Serial.printf("[VAD] Bo qua: Am luong qua nho / tap am (Peak: %d < %d)\n",
                    maxVal, MIN_VOICE_PEAK);
    }
  }

  preCount = 0;
  preWrite = 0;
  startCounter = 0;
  readyAt = millis() + 200;
}

// =====================================
// 13. SETUP
// =====================================
void setup() {
  setCpuFrequencyMhz(240);
  Serial.begin(115200);
  delay(500);

  Serial.println("\n=================================");
  Serial.println("  SIGN STUDIO: ESP32-S3 + ST7789 ");
  Serial.println("=================================");

  // Kiem tra PSRAM
  if (!psramFound()) {
    Serial.println("ERROR: KHONG CO PSRAM!");
    while (true) delay(1000);
  }

  // Cap phat bo nho am thanh trong PSRAM
  requestBuffer = (uint8_t*)ps_malloc(MAX_BODY_SIZE);
  if (!requestBuffer) {
    Serial.println("Loi cap phat requestBuffer trong PSRAM!");
    while (true) delay(1000);
  }
  memcpy(requestBuffer, FORM_PREFIX, PREFIX_LEN);
  wavBuffer = requestBuffer + PREFIX_LEN;
  pcmBuffer = wavBuffer + 44;

  // Cap phat bo nho JPEG Streaming trong PSRAM
  tftRxBuffer = (uint8_t*)ps_malloc(MAX_JPEG_SIZE);
  tftRenderBuffer = (uint8_t*)ps_malloc(MAX_JPEG_SIZE);
  if (!tftRxBuffer || !tftRenderBuffer) {
    Serial.println("Loi cap phat TFT Buffers trong PSRAM!");
    while (true) delay(1000);
  }

  Serial.printf("PSRAM free sau khoi tao: %u bytes\n", (unsigned)ESP.getFreePsram());

  // 1. Khoi tao man hinh TFT ST7789 qua SPI
  pinMode(TFT_CS, OUTPUT);
  digitalWrite(TFT_CS, HIGH);
  pinMode(TFT_DC, OUTPUT);
  digitalWrite(TFT_DC, HIGH);
  pinMode(TFT_RST, OUTPUT);
  digitalWrite(TFT_RST, HIGH);
  delay(10);
  digitalWrite(TFT_RST, LOW);
  delay(50);
  digitalWrite(TFT_RST, HIGH);
  delay(120);

  // QUAN TRONG: Khong truyen TFT_CS vao tftSPI.begin de Adafruit GFX tu quan ly CS bang software
  tftSPI.begin(TFT_SCK, -1, TFT_MOSI, -1);
  tft.init(240, 320); // 240x320 panel
  tft.invertDisplay(false); // Tat che do dao mau (fix mau bi am ban / inverted)
  tft.setSPISpeed(40000000); // 40MHz SPI cho toc do frame cuc nhanh tren ESP32-S3
  tft.setRotation(1); // 320x240 landscape
  tft.fillScreen(0x0821);
  drawTftSplash();

  // 2. Khoi tao micro I2S INMP441
  I2S.setPins(I2S_SCK, I2S_WS, -1, I2S_SD);
  if (!I2S.begin(I2S_MODE_STD, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO, I2S_STD_SLOT_LEFT)) {
    Serial.println("I2S INMP441 ERROR!");
    while (true) delay(1000);
  }

  // 3. Ket noi WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi timeout! Chay offline/AP mode.");
  }

  // Cap nhat splash screen voi IP thuc te
  drawTftSplash();

  // 4. Cau hinh Groq HTTP client
  groqClient.setInsecure();
  groqHttp.setReuse(true);

  // Tao FreeRTOS Worker Task tren Core 0 cho Groq
  xTaskCreatePinnedToCore(groqWorkerTask, "groqWorker", 8192, NULL, 1, &groqTaskHandle, 0);

  // 5. Khoi tao WebSocket Server cong 81
  webSocket.begin();
  webSocket.onEvent(wsEvent);
  Serial.printf("Sign Studio ket noi tai: ws://%s:81\n", WiFi.localIP().toString().c_str());

  calibrateNoise();
}

// =====================================
// 14. MAIN LOOP (CORE 1)
// =====================================
void loop() {
  // 1. WebSocket loop (nhan lệnh text va binary JPEG chunks)
  webSocket.loop();

  // 2. Gui ACK ve Sign Studio neu vua render xong frame
  if (tftAckFrameId > 0) {
    JsonDocument ack;
    ack["type"] = "tft_frame_ack";
    ack["frameId"] = tftAckFrameId;
    ack["renderMs"] = tftAckRenderMs;
    String ackMsg;
    serializeJson(ack, ackMsg);
    webSocket.broadcastTXT(ackMsg);
    tftAckFrameId = 0;
  }

  // 3. Giai ma va render frame moi len ST7789 TFT
  if (tftNewFrameReady) {
    tftNewFrameReady = false;
    renderTftJpeg(tftRenderBuffer, tftRenderFrameSize);
  }

  // 4. Gui ket qua Groq Whisper toi Sign Studio neu Task Core 0 da hoan thanh
  if (transcriptReadyToSend) {
    broadcastTranscript(pendingTranscript, "vi-VN");
    transcriptReadyToSend = false;
  }

  // 5. Doc du lieu tu micro INMP441
  float rms = 0;
  int count = readMicro(rms);
  if (count <= 0) {
    delay(1);
    return;
  }

  // Gui RMS audio level dinh ky moi 200ms
  broadcastAudioLevel(rms, recording);

  unsigned long now = millis();
  if (now - lastPrintTime >= 500) {
    lastPrintTime = now;
  }

  // VAD: Chua ghi am
  if (!recording) {
    if (now < readyAt) return;
    pushPreRoll(count);

    if (rms >= startThreshold) startCounter++;
    else startCounter = 0;

    if (startCounter >= START_FRAMES) {
      startRecording(count);
      startCounter = 0;
    }
    return;
  }

  // VAD: Dang ghi am
  appendFrame(count);
  if (rms >= stopThreshold) {
    lastVoiceTime = now;
    voicedSamples += count;
  }

  bool silence = (now - lastVoiceTime >= SILENCE_MS);
  bool tooLong = (recordedSamples >= MAX_SAMPLES);

  if (silence || tooLong) {
    finishRecording();
  }
}
