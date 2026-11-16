# Sign Studio

Phạm vi hiện tại: tiếng Việt và tiếng Anh; đầu ra ký hiệu VSL và ASL. Chế độ cục bộ mặc định chọn VSL cho tiếng Việt, ASL cho tiếng Anh. Hybrid nhận cả hai ngôn ngữ đầu vào và luôn xuất ASL.

### Đánh vần trên avatar

- U/V có độ tách ngón riêng; R có hai ngón bắt chéo với độ sâu khác nhau, X có độ gập riêng ở từng khớp.
- Cổ tay sử dụng đủ ba trục; G/H hướng ngang và P/Q hướng xuống. J/Z có quỹ đạo chuyển động riêng và thời gian diễn dài hơn chữ tĩnh.
- Các chữ chuyển tiếp bằng nội suy quaternion, bao gồm chuyển từ điểm kết thúc J/Z sang chữ kế tiếp.
- VSL giữ các chữ Ă, Â, Đ, Ê, Ô, Ơ, Ư. Dấu thanh được lược bỏ khi tạo chữ đánh vần; văn bản gốc vẫn giữ nguyên. ASL/Hybrid tiếp tục Latin hóa sang A–Z.
- Thử ở chế độ Cục bộ: tiếng Anh với `UVR GHPQ JZ`; tiếng Việt với `ĂÂĐÊÔƠƯ`.

`scripts/fingerspelling.test.mjs` kiểm tra hình tay, hướng cổ tay, quỹ đạo, chuyển tiếp, chữ tiếng Việt và điều khiển phát. `node scripts/fingerspelling-browser-qa.mjs` kiểm tra mô hình Vest với Vite cổng 3001 và Chrome DevTools cổng 9223; ảnh và kết quả lưu trong `artifacts/`.

Tham chiếu chuyển động chữ ASL: [Lifeprint – Fingerspelling](https://www.lifeprint.com/asl101/pages-layout/fingerspelling.htm). Đây vẫn là các tư thế minh họa cần người biết ASL/VSL kiểm chứng, đặc biệt các hình tay phức tạp và bộ chữ VSL.

Ứng dụng Vite + Three.js mô phỏng giao diện và nhân vật ký hiệu theo video trong thư mục dự án.

```sh
npm install
npm run dev
```

Trên PowerShell chặn script, dùng `npm.cmd run dev`. Mở địa chỉ Vite in ra.

- Nhập câu hoặc chọn câu mẫu; micro dùng Web Speech API trên trình duyệt hỗ trợ.
- **Hội thoại Việt–Anh** phát bốn câu hội thoại bằng tiếng Việt và tiếng Anh.
- Điều khiển tốc độ, tạm dừng, phát lại, dừng, ba góc camera và chế độ trình diễn (Esc để thoát).
- Hai tư thế tham chiếu: vẫy chào (ảnh 2) và hai tay trước ngực (ảnh 1).
- Nhân vật mặc định **Character (FBX)** dùng mô hình người dùng cung cấp, với 7 mesh có skin và bộ xương Mixamo. Menu **Nhân vật** cho phép đổi sang bản blazer cũ mà không gián đoạn câu đang phát.
- Xuất GLB của nhân vật đang hiển thị. GLB xuất chứa hình học và tư thế hiện tại; không chứa bộ hoạt ảnh của ứng dụng.
- Nạp GLB để xem mô hình và hoạt ảnh có sẵn. Khi nhập câu hoặc chọn tư thế, ứng dụng chuyển về nhân vật có hệ khớp ký hiệu.

```sh
npm test
npm run build
```

`scripts/verify.mjs` kiểm tra hoạt ảnh, tạm dừng, tốc độ, chuyển tiếp, IK, từ điển và đánh vần. `scripts/browser-qa.mjs` là công cụ kiểm tra phát triển qua Chrome DevTools cổng 9223, với Vite tại cổng 3001. Ảnh kiểm tra nằm trong `artifacts/`.

Nhân vật là bản dựng hình học theo tham chiếu, không phải asset gốc ProDeaf. Chế độ Cục bộ dùng từ điển sẵn có. Chế độ Hybrid dùng Gemini để tạo gloss ASL và NMM, sau đó Three.js diễn tại máy. ASL/VSL trong chế độ Cục bộ hiện có nhãn từ vựng riêng nhưng dùng chung cử chỉ minh họa, chưa phải bộ dịch ký hiệu được kiểm chứng. Từ thiếu hoạt ảnh chuyển sang đánh vần A–Z; VSL có thêm Ă, Â, Đ, Ê, Ô, Ơ, Ư.

## Kết nối Hybrid (Gemini → gloss + NMM → Three.js)

Yêu cầu Node.js 22.12+ hoặc 24+. Không cần cài thêm SDK.

1. Sao chép `.env.example` thành `.env.local`.
2. Tạo key tại [Google AI Studio](https://aistudio.google.com/apikey), điền `GEMINI_API_KEY` vào `.env.local`. Không gửi key qua chat, không dùng tiền tố `VITE_`.
3. Chạy lại `npm run dev`, mở địa chỉ máy chủ in ra. Chế độ Hybrid được chọn khi đã có key; nếu chưa có, ứng dụng vẫn chạy Cục bộ. Nút **Kiểm tra kết nối** đọc thông tin model từ Gemini để kiểm tra mạng, key và model; không tạo nội dung. Kiểm tra này không xác nhận quota tạo nội dung còn lại.
4. Chọn ngôn ngữ văn bản, nhập câu hoặc dùng micro. Hybrid luôn xuất ASL; không coi ASL là VSL. Xem phần **Kết quả dịch & động tác** để biết từ nào được đánh vần.

Model mặc định: `gemini-3.5-flash-lite`; đổi `GEMINI_MODEL` nếu tài khoản cần model khác hỗ trợ structured output. Model này có free tier theo [bảng giá Google](https://ai.google.dev/gemini-api/docs/pricing), nhưng hạn mức và phí thực tế phụ thuộc tài khoản. Ứng dụng không bật thanh toán, không tự đổi sang model khác, không tự retry khi hết quota. [Tài liệu JSON](https://ai.google.dev/gemini-api/docs/structured-output) và [REST generateContent](https://ai.google.dev/api/generate-content).

API key chỉ được đọc trong `server/hybridApi.js` qua cấu hình Vite. Câu chào khởi động và Hội thoại Việt–Anh luôn dùng từ điển cục bộ; Phát lại dùng kết quả cũ, không gọi API. Các câu giống nhau được lưu tối đa 15 phút trong RAM (tối đa 100 câu), mất khi khởi động lại. Không ghi câu hoặc key vào log. Văn bản Hybrid được gửi tới Google; Web Speech dùng dịch vụ của trình duyệt, không phải nhận dạng giọng nói offline.

Máy chủ giới hạn 500 ký tự/câu, 100 gloss/câu, 2 yêu cầu đồng thời và 12 lượt gọi/phút. Có xử lý hết quota, key lỗi, JSON sai, kết quả bị cắt, timeout 30 giây và hủy khi bấm Dừng/gửi câu mới. Không âm thầm dùng từ điển khi API lỗi: thông báo giữ nguyên để người dùng thử lại hoặc chọn Cục bộ.

Nếu báo **Máy chủ bị chặn quyền truy cập mạng**, tiến trình Node đang chạy trong sandbox hoặc bị chính sách máy chặn (`EACCES`/`EPERM`). Khởi động lại bằng terminal được phép truy cập Internet, trong thư mục dự án: `npm run dev -- --port 3001 --strictPort`. Không tắt kiểm tra chứng chỉ TLS để xử lý lỗi này.

**Giới hạn chuyển động:** Gemini có thể tạo gloss ngoài 23 động tác hiện có, nhưng không tạo ra animation mới. Bộ ánh xạ chỉ dùng clip trong danh sách cho phép; gloss khác được đánh vần A–Z, tên có dấu được Latin hóa. NMM gồm mày, cười, mở miệng và góc đầu; không phải bộ ngữ pháp phi thủ công đầy đủ. Character có chuyển động tay/đầu nhưng không có morph nét mặt; chọn **Blazer dựng 3D** để xem nét mặt. Cần người biết ASL kiểm chứng nội dung và chuyển động trước khi dùng để giao tiếp thực tế.

```sh
npm test
npm run build
npm start
```

`npm start` phục vụ bản build kèm API bằng Vite preview, dành cho kiểm tra cục bộ. Chỉ tải `dist/` lên hosting tĩnh sẽ không có API Hybrid. Máy chủ mặc định chỉ nghe `127.0.0.1`; triển khai công khai cần backend riêng, xác thực người dùng và hạn mức theo tài khoản. Không công khai Vite dev/preview cùng API key.

`scripts/hybrid.test.mjs` kiểm tra schema, ánh xạ, key nằm ở máy chủ, cache, lỗi API, timeout và hủy yêu cầu bằng provider giả lập; không phát sinh phí API. Kiểm thử Gemini thật cần key của bạn.

`node scripts/hybrid-browser-qa.mjs` kiểm tra UI Hybrid qua Chrome DevTools cổng 9223 và Vite cổng 3001, trên máy chủ chưa cấu hình key. Phản hồi AI trong bài kiểm tra được giả lập; ảnh desktop/mobile ghi vào `artifacts/hybrid-*.png` và ứng dụng được tải lại sau kiểm tra.

## Mô hình Character

`public/character.glb` được chuyển cục bộ từ `character.fbx` (FBX 6.1) bằng [FBX2glTF v0.9.7](https://github.com/facebookincubator/FBX2glTF/releases/tag/v0.9.7). File FBX trong Downloads không bị thay đổi. Bản sao nguồn và công cụ chuyển đổi nằm trong `artifacts/`, không được đóng gói vào bản build.

`src/avatar/retargetedAvatar.js` nối 36 khớp vai, khuỷu tay, cổ tay và ngón tay với rig diễn hoạt hiện có, đồng thời truyền hướng đầu và nhịp thở. Vị trí xương, tỷ lệ và inverse bind matrices của asset được giữ nguyên. Mô hình này không có animation clip hoặc morph target nét mặt; ứng dụng không bổ sung biểu cảm môi/mắt giả cho nó.

Để tái tạo GLB khi đã có công cụ trong `artifacts/`:

```powershell
& './artifacts/FBX2glTF-windows-x64.exe' --input './artifacts/character-source.fbx' --output './public/character' --binary --fbx-temp-dir './artifacts/fbx-temp'
```

Sau chuyển đổi, `scripts/repair-character-materials.mjs` khôi phục opacity tóc và lông mi từ hai texture gốc trong `public/character-textures/`, đóng gói vào kênh alpha của GLB. Script này dùng Vite và Chrome DevTools theo cấu hình kiểm tra ở trên. Bản GLB trước sửa vật liệu được giữ trong `artifacts/character-before-material-repair.glb`.

Chuyển đổi vẫn báo cảnh báo transform inheritance. Cần kiểm tra hình ảnh nếu thay asset hoặc đổi công cụ chuyển đổi. Bản hiện tại đã được xem ở tư thế nghỉ, vẫy chào và hai tay trước ngực; kiểm tra tự động kiểm tra skin không có tọa độ lỗi trên tất cả clip và ngón tay thay đổi giữa chữ A/B.

## Tích hợp Phần cứng ESP32-S3 (Micro INMP441 + Groq Whisper + Màn hình TFT ST7789 2.8")

Dự án hỗ trợ nhận diện giọng nói từ module **ESP32-S3** gắn micro I2S **INMP441**, đồng thời **truyền luồng hình ảnh chuyển động 3D của Avatar từ Sign Studio xuống màn hình màu TFT ST7789 2.8 inch (320x240)** thông qua WebSocket thời gian thực:

### 1. Sơ đồ đấu nối phần cứng (Pinout)

#### A. Micro I2S INMP441:
| Chân INMP441 | Chân ESP32-S3 | Chức năng |
| :--- | :--- | :--- |
| **SCK** | **GPIO 5** | I2S Serial Clock |
| **WS** | **GPIO 6** | I2S Word Select / L/R Clock |
| **SD** | **GPIO 7** | I2S Serial Data Out |
| **VDD** | **3.3V** | Nguồn nuôi 3.3V (Không nối vào 5V) |
| **GND** / **L/R** | **GND** | Nối đất (L/R nối GND chọn kênh Trái / Mono) |

#### B. Màn hình màu TFT LCD ST7789 2.8" SPI (320x240 Landscape):
| Chân TFT ST7789 | Chân ESP32-S3 | Chức năng |
| :--- | :--- | :--- |
| **CS** | **GPIO 40** | Chip Select (SPI SS) |
| **RESET / RST** | **GPIO 42** | Hardware Reset |
| **DC / RS** | **GPIO 41** | Data / Command Select |
| **SDI / MOSI** | **GPIO 39** | SPI Master Out Slave In |
| **SCK / CLK** | **GPIO 38** | SPI Clock (FSPI 40MHz) |
| **SDO / MISO** | **GPIO 2** | Tùy chọn (ST7789 là write-only) |
| **VCC** | **3.3V** hoặc **5V** | Tùy thông số module (khuyến nghị 3.3V) |
| **GND** | **GND** | Nối đất |
| **BLK / LED** | **3.3V** *(hoặc GPIO)* | Đèn nền màn hình (Backlight) |

> [!NOTE]
> - Các chân GPIO 35, 36, 37 được để trống tuyệt đối để tránh xung đột với bộ nhớ Octal PSRAM của ESP32-S3.
> - Các chân I2S (GPIO 5, 6, 7) và SPI TFT (GPIO 38, 39, 40, 41, 42) hoàn toàn độc lập, không chia sẻ chân tín hiệu.

---

### 2. Thư viện Arduino cần thiết & Phiên bản tương thích

Cài đặt các thư viện sau qua Arduino Library Manager:
* **`Adafruit ST7735 and ST7789 Library`** (v1.11.0 hoặc mới hơn)
* **`Adafruit GFX Library`** (v1.12.0 hoặc mới hơn)
* **`JPEGDecoder`** (bởi Bodmer, v2.0.0)
* **`WebSockets`** (bởi Markus Sattler, v2.7.2)
* **`ArduinoJson`** (bởi Benoît Blanchon, v7.x)

---

### 3. Cấu hình Arduino IDE khi nạp firmware

Trong Arduino IDE (menu **Tools**):
* **Board:** `ESP32S3 Dev Module`
* **PSRAM:** `OPI PSRAM` (hoặc `QSPI PSRAM` tùy phiên bản board N16R8/N8R2)
* **Flash Size:** `16MB (128Mb)`
* **Flash Mode:** `QIO 80MHz`
* **USB CDC On Boot:** `Enabled`
* **Upload Speed:** `921600`
* **Port:** Chọn đúng cổng COM của ESP32-S3

---

### 4. Kiến trúc truyền hình ảnh & FreeRTOS

1. **Sign Studio (Three.js WebGL):**
   * Sử dụng camera chuyên dụng hướng góc nhìn chuẩn 3/4 thân trên và 2 bàn tay avatar.
   * Render khung hình 320x240 qua `WebGLRenderTarget` độc lập (không bị méo hay ảnh hưởng khi người dùng xoay/zoom màn hình chính).
   * Nén sang định dạng JPEG nhẹ (chất lượng 50% - 70%, dung lượng ~4–8 KB).
   * Đóng gói chunk nhị phân với 16-byte fixed header (Magic `TF`, Version 1, Sequence FrameID, Chunk index/total).
   * Cơ chế **Backpressure**: Chỉ phát frame kế tiếp khi ESP32 phản hồi `tft_frame_ack` (hoặc timeout 1.2s), tự động drop frame cũ để duy trì thời gian thực.
2. **ESP32-S3 Firmware (Multi-core FreeRTOS):**
   * **Core 0 (Background Task):** Thực thi HTTP POST tải audio lên Groq Whisper API. Nhờ vậy, cuộc gọi mạng nặng không bao giờ chặn (block) vòng lặp chính.
   * **Core 1 (Main Loop):** Tiếp nhận WebSocket binary chunks, giải mã JPEG theo khối MCU và xuất trực tiếp ra ST7789 qua SPI DMA ở tốc độ 3–8 FPS mượt mà.

---

### 5. Hướng dẫn vận hành

1. **Cấu hình & Nạp Firmware:**
   * Tạo file `testmic/secrets.h` (file này tự động nằm trong `.gitignore`, không lo lộ mật khẩu khi đẩy lên Git):
     ```cpp
     #pragma once
     #define WIFI_SSID "Tên_WiFi_Của_Bạn"
     #define WIFI_PASS "Mật_Khẩu_WiFi"
     #define API_KEY   "gsk_Your_Groq_Api_Key"
     ```
   * Mở file [testmic/testmic.ino](testmic/testmic.ino) trong Arduino IDE và nhấn **Upload** (hoặc dùng `arduino-cli upload -p COM4 --fqbn esp32:esp32:esp32s3 testmic`).
2. **Khởi động ứng dụng:**
   ```sh
   npm run dev
   ```
   Mở địa chỉ: `http://127.0.0.1:3001/`
3. **Kết nối & Xem Avatar trên TFT:**
   * Nhập IP của ESP32 hiển thị trên màn hình ST7789 vào ô `ESP32 IP` $\rightarrow$ bấm **📡 ESP32** (chấm tròn đổi sang 🟢).
   * Bấm nút **📺 Truyền TFT** trên thanh điều khiển.
   * Nhân vật avatar 3D trên trình duyệt sẽ lập tức xuất hiện và chuyển động đồng thời trên màn hình ST7789 2.8 inch!
   * Bạn có thể tùy chỉnh FPS (tối ưu lên đến 25–30 FPS) và chất lượng JPEG (50%, 60%, 70%) trực tiếp trên giao diện.

---

### 6. Xử lý sự cố thường gặp (Troubleshooting)

| Hiện tượng | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **Màn hình trắng xóa** | Chưa cấp nguồn cho chân BLK hoặc chưa nối đúng chân Reset | Kiểm tra chân BLK/LED đã nối vào 3.3V chưa; kiểm tra GPIO 42 (RST) và GPIO 40 (CS). |
| **Màn hình đen hoàn toàn** | Đấu sai chân SPI MOSI/SCK hoặc cáp lỏng | Kiểm tra GPIO 39 (MOSI) và GPIO 38 (SCK); kiểm tra tiếp xúc dây cắm. |
| **Avatar bị giật / chậm** | Mạng WiFi yếu hoặc đặt chất lượng JPEG quá cao | Chọn mức 15–20 FPS và JPEG 50% trên giao diện; kiểm tra khoảng cách tới router WiFi. |
| **Báo lỗi PSRAM** | Chưa bật OPI PSRAM trong cấu hình board | Vào Tools -> PSRAM -> chọn OPI PSRAM (với chip ESP32-S3 N16R8). |

---

### 7. Hệ thống chống nhiễu & loại bỏ ảo giác Whisper 2 tầng (2-Tier Hallucination Prevention)

* **Tầng 1 (VAD & Noise Gate tại ESP32):**
  * Tự động loại bỏ tiếng thở, tặc lưỡi, va quẹt micro với ngưỡng `MIN_VOICE_MS = 500ms` và bộ lọc biên độ đỉnh `MIN_VOICE_PEAK = 2000`.
  * Chỉ tiến hành khuếch đại (`normalizeAudio`) với âm lượng đạt chuẩn, hạn chế tối đa việc kéo nhiễu nền lên.
* **Tầng 2 (Prompting & Post-filtering):**
  * Tham số `temperature=0.0` ép Groq Whisper giải mã chế độ Greedy Decoding chuẩn xác nhất.
  * Bổ sung hội thoại mẫu (Prompt) định hướng ngữ cảnh tiếng Việt thường ngày.
  * Bộ lọc từ khóa ảo giác YouTube (Ghiền Mì Gõ, La La School, subscribe, hẹn gặp lại,...) loại bỏ hoàn toàn các câu outro trước khi kích hoạt avatar 3D.
