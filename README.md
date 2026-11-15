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

## Tích hợp Phần cứng ESP32-S3 (Micro INMP441 + Groq Whisper)

Dự án hỗ trợ nhận diện giọng nói từ module phần cứng **ESP32-S3** gắn micro I2S **INMP441** thông qua file `testmic.ino`:

1. **Chuẩn bị board ESP32-S3:**
   - Cần board có PSRAM (ví dụ ESP32-S3-DevKitC-1 N16R8 hoặc tương đương).
   - Micro INMP441 kết nối các chân: `SCK` -> GPIO 5, `WS` -> GPIO 6, `SD` -> GPIO 7, `VDD` -> 3.3V, `GND` / `L/R` -> GND.
   - Trong Arduino IDE, cài thư viện **`WebSockets`** (bởi Markus Sattler) và **`ArduinoJson`** (v7.x).
   - Nạp file `testmic.ino` lên ESP32.
2. **Lấy địa chỉ IP:**
   - Mở Serial Monitor (baud 115200), khi ESP32 kết nối WiFi sẽ in ra:
     ```
     WiFi connected!
     192.168.x.x
     Sign Studio ket noi tai: ws://192.168.x.x:81
     ```
3. **Kết nối trên giao diện Sign Studio:**
   - Mở web app trên trình duyệt (cùng mạng WiFi với ESP32).
   - Ở thanh điều khiển trên cùng (Header Actions), nhập IP của ESP32 vào ô `ESP32 IP` rồi bấm nút **📡 ESP32**.
   - Dấu chấm trạng thái sẽ đổi sang màu xanh lá 🟢. Địa chỉ IP sẽ tự động lưu trong trình duyệt.
   - Khi bạn nói vào micro INMP441: ESP32 tự động nhận diện qua Groq Whisper -> gửi văn bản thời gian thực qua WebSocket -> Avatar 3D trên màn hình lập tức diễn ký hiệu tương ứng!
