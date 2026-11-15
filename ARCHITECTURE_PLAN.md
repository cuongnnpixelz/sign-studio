# BÁO CÁO KIẾN TRÚC KỸ THUẬT TOÀN DIỆN (TECHNICAL ARCHITECTURE & IMPLEMENTATION PLAN)
## NỀN TẢNG DỊCH GIỌNG NÓI ĐA NGÔN NGỮ SANG NGÔN NGỮ KÝ HIỆU 3D THEO THỜI GIAN THỰC
*(Multilingual Speech-to-3D Sign Language Web Application)*

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE PIPELINE)

Hệ thống được thiết kế theo mô hình **Stream-driven Event Pipeline** 4 tầng khép kín nhằm bảo đảm thời gian đáp ứng tổng thể (End-to-End Latency) **dưới 1.5 giây** từ khi kết thúc câu nói đến khi nhân vật 3D thực hiện động tác đầu tiên.

```mermaid
flowchart TD
    subgraph ClientAudio ["TẦNG 1: AUDIO INGESTION (CLIENT)"]
        A[Microphone Input] --> B[Web Audio API / AudioWorkletNode]
        B --> C[Silero VAD (ONNX WebAssembly)]
        C -- "Voice Detected (Chunk 16kHz mono)" --> D[WebSocket Streamer]
    end

    subgraph CloudSpeech ["TẦNG 2: SPEECH-TO-TEXT & TRANSLATION"]
        D --> E[Azure Speech Translation / Whisper Live]
        E -- "Interim Text" --> F[Realtime Subtitle Feed]
        E -- "Final Normalized Text" --> G[Text Normalizer & Punctuation]
    end

    subgraph NLPGloss ["TẦNG 3: SIGN GRAMMAR & TEXT-TO-GLOSS"]
        G --> H[Syntactic Parser / spaCy Dependency Parser]
        H --> I[Grammar Transformer (SVO -> Topic-Comment / OSV)]
        I --> J{Sign Lexicon Lookup (SignBank)}
        J -- "Word Exists" --> K[Sign Token / Motion Clip ID]
        J -- "OOV / Proper Noun" --> L[Fingerspelling Generator (A-Z)]
        I --> M[Non-Manual Markers (NMM / Facial Blendshapes)]
    end

    subgraph WebGLAvatar ["TẦNG 4: 3D ANIMATION ENGINE (WEBGL)"]
        K & L --> N[Animation Queue & Scheduler]
        M --> O[Blendshape Controller (ARKit 52)]
        N --> P[Skeletal Animation Mixer (Three.js)]
        P & O --> Q[Animation Blending & Crossfading Engine]
        Q --> R[3D Humanoid Avatar (glTF/GLB)]
    end
```

### 1.1. Chi tiết 4 tầng xử lý luồng dữ liệu

| Tầng xử lý | Nhiệm vụ chính | Công nghệ chủ đạo | Chuẩn dữ liệu I/O | Độ trễ mục tiêu |
| :--- | :--- | :--- | :--- | :--- |
| **Tầng 1: Audio Ingestion** | Thu âm PCM thời gian thực, khử ồn, phát hiện giọng nói (VAD) | Web Audio API, AudioWorklet, Silero VAD (Wasm) | In: Mic Stream<br>Out: Int16 PCM Chunk (16kHz, mono) | < 50ms |
| **Tầng 2: STT & Translation** | Nhận diện giọng nói đa ngữ và dịch sang văn bản mục tiêu | Azure Speech Translation SDK / Faster-Whisper | In: Audio Stream<br>Out: UTF-8 Text (Original & Translated) | 300ms - 500ms |
| **Tầng 3: Text-to-Gloss** | Chuyển đổi ngữ pháp câu nói thành cấu trúc Gloss ký hiệu & NMM | spaCy, Custom Rule Engine, WordNet/SignBank | In: Translated Text<br>Out: Gloss Token Array + NMM Track | 100ms - 200ms |
| **Tầng 4: 3D Animation** | Ghép nối chuyển động, nội suy xương, diễn hoạt cử chỉ ngón tay & nét mặt | Three.js / React Three Fiber, AnimationMixer | In: Motion Clip IDs + Facial Weights<br>Out: 60fps WebGL Canvas | < 100ms render |

---

## 2. LỰA CHỌN NGĂN XẾP CÔNG NGHỆ (TECH STACK SELECTION)

### 2.1. Ma trận so sánh & Đánh giá công nghệ

#### A. 3D Web Rendering Engine
| Tiêu chí | Three.js + React Three Fiber (R3F) (Khuyên dùng) | Babylon.js | PlayCanvas |
| :--- | :--- | :--- | :--- |
| **Hệ sinh thái & Thư viện** | Cực lớn (`@react-three/drei`, postprocessing, pmndrs) | Lớn (tập trung vào game/enterprise) | Vừa phải, tập trung Cloud Editor |
| **Khả năng tích hợp React/UI** | Hoàn hảo (Declarative JSX, state syncing) | Imperative wrapper | Khó tích hợp liền mạch với UI React |
| **Skeletal & Blendshape Support** | Rất mạnh, chuẩn `AnimationMixer` & `MorphTargets` | Rất mạnh (hỗ trợ sẵn animation groups) | Tốt |
| **Kích thước Bundle** | ~600KB (Modular Tree-shakable) | ~1.8MB - 2.5MB | ~400KB core |

#### B. Nền tảng Speech-to-Text & Translation đa ngôn ngữ
| Tiêu chí | Azure Speech Translation API (Khuyên dùng) | OpenAI Whisper (v3 API) | Web Speech API (Native Browser) |
| :--- | :--- | :--- | :--- |
| **Độ trễ (Latency)** | **Rất thấp (< 400ms streaming)** | 1.2s - 2.5s (Chunked API) | Thấp (< 300ms) nhưng không ổn định |
| **Hỗ trợ Đa ngôn ngữ** | > 100 ngôn ngữ, dịch song song tự động | > 99 ngôn ngữ, chất lượng rất cao | Phụ thuộc trình duyệt / hệ điều hành |
| **Khả năng Streaming** | Full Duplex WebSocket (Bi-directional) | Request/Response (hoặc tự host vLLM) | Client-only, không hỗ trợ dịch trực tiếp |
| **Dịch đồng thời (STT+MT)** | Tích hợp trong 1 API call duy nhất | Phải gọi 2 bước (STT -> LLM/Translation) | Không hỗ trợ |

### 2.2. Ngăn xếp công nghệ tiêu chuẩn đề xuất (Recommended Stack)

```
[FRONTEND UI]
├── Framework: Next.js 15 (App Router) + React 19 + TypeScript
├── Styling: Tailwind CSS v3.4 + Framer Motion (Micro-interactions) + Lucide Icons
└── State Management: Zustand (Quản lý queue animation, trạng thái Mic, phụ đề)

[3D RENDERING & ASSETS]
├── Graphics Engine: Three.js (r169+) + @react-three/fiber + @react-three/drei
├── 3D Avatar Standard: Ready Player Me GLB Rigged Model
│   ├── Skeleton: Standard Humanoid Rig (52 bones, ngón tay đầy đủ 3 đốt)
│   └── Facial: ARKit 52 Blendshapes / Morph Targets chuẩn
├── Asset Compression: Draco Decoder + KTX2 Texture Compression (meshopt)

[AI & NLP PIPELINE]
├── Speech & Translation: Azure Cognitive Services Speech SDK (WebSocket Streaming)
├── Audio VAD: Silero VAD v4 (ONNX Runtime WebAssembly chạy ngầm qua Worker)
├── Text-to-Gloss Engine: 
│   ├── Client/Edge Parser: Compromise.js / spaCy-wasm / Rule-based Grammar Shifter
│   └── Sign Dictionary: IndexedDB Cached SignBank (Metadata JSON + pre-baked AnimationClips)
```

---

## 3. THIẾT KẾ TRẢI NGHIỆM GIAO DIỆN (UI/UX DESIGN)

### 3.1. Sơ đồ bố cục màn hình (Viewport Architecture)

```
+-----------------------------------------------------------------------------+
| [Logo] AI SignBridge         [Input: 🇺🇸 EN | 🇻🇳 VI | 🇫🇷 FR] -> [Sign: 🇺🇸 ASL] [⚙️]|
+-----------------------------------------------------------------------------+
|                                                                             |
|                     +----------------------------------+                    |
|                     |  GLOSS HUD: [YOUR] [NAME] [WHAT] |   (Upper Subtitle) |
|                     +----------------------------------+                    |
|                                                                             |
|                                                                             |
|                                 ( 3D AVATAR )                               |
|                            [Upper-body / Half-body]                         |
|                             Realistic Hand Signing                          |
|                            Facial Expressions (NMM)                         |
|                                                                             |
|                                                                             |
|                     +----------------------------------+                    |
|                     | "What is your name?"             |   (Lower Subtitle) |
|                     +----------------------------------+                    |
|                                                                             |
+-----------------------------------------------------------------------------+
|   [Speed: 1.0x]       [ 🎙️ MICROPHONE (Pulsing Wave) ]       [ 🔄 Replay ]   |
|   Trạng thái: 🟢 READY | 🟡 LISTENING | 🟣 TRANSLATING | 🔵 SIGNING          |
+-----------------------------------------------------------------------------+
```

### 3.2. Hệ thống trạng thái & Phản hồi trực quan (State Management UI)
1. **🟢 IDLE / READY**: Avatar ở tư thế nghỉ tự nhiên (Idle breathing animation). Nút micro hiển thị vòng sáng mờ.
2. **🟡 LISTENING (Đang thu âm)**: Micro phát sóng âm (Audio Visualizer Bar phản ứng với decibel âm thanh). Subtitle bên dưới hiển thị văn bản theo thời gian thực (Interim results dạng chữ mờ).
3. **🟣 PROCESSING (Đang phân tích & Dịch)**: Hiệu ứng Loading Spinner vòng quanh nút mic hoặc thanh tiến trình phát sáng trên đỉnh đầu avatar. Câu dịch hoàn thiện xuất hiện.
4. **🔵 SIGNING (Đang diễn hoạt)**:
   - Gloss HUD phía trên làm nổi bật (Highlight) từng từ ký hiệu đang được thực hiện (Active token synchronization).
   - Avatar thực hiện động tác tay dứt khoát kết hợp biểu cảm mắt, mày và khẩu hình.

---

## 4. BÀI TOÁN CỐT LÕI: TEXT-TO-GLOSS MAPPING & NGỮ PHÁP KÝ HIỆU

Ngôn ngữ ký hiệu (ASL, VSL, LIBRAS) **không phải** là việc dịch từng chữ của ngôn ngữ nói, mà là một ngôn ngữ tự nhiên độc lập với ngữ pháp không gian và biểu cảm phi thủ chỉ (Non-Manual Markers - NMM).

### 4.1. Sự khác biệt ngữ pháp giữa Tiếng nói và Ngôn ngữ ký hiệu

| Tiêu chí | Ngôn ngữ nói thông thường (English / Vietnamese) | Ngôn ngữ ký hiệu (ASL / VSL) |
| :--- | :--- | :--- |
| **Cấu trúc câu** | SVO (*Subject - Verb - Object*) | **Topic - Comment** hoặc **OSV / SOV** |
| **Từ nghi vấn (WH-words)** | Thường ở đầu câu (*What, Where, Who*) | **Đẩy về cuối câu** (*YOU GO WHERE ?*) |
| **Thì / Thời gian (Tense)** | Biến đổi động từ (*went, will go, đã đi*) | **Đặt mốc thời gian ở đầu câu** (*YESTERDAY, TOMORROW*) |
| **Hư từ / Mạo từ** | Rất nhiều (*a, an, the, is, are, of, to*) | **Lược bỏ hoàn toàn** (*is, are, the -> null*) |
| **Biểu cảm khuôn mặt (NMM)** | Phụ trợ, thể hiện cảm xúc | **Thuộc tính ngữ pháp bắt buộc** (Mày nhíu = câu hỏi WH; Mày nhướn = câu hỏi Yes/No) |

### 4.2. Thuật toán phân tích cú pháp (Grammar Parsing Algorithm)

Quy trình 5 bước chuyển đổi văn bản sang chuỗi Gloss:

```typescript
interface GlossToken {
  id: string;              // ID clip animation (ví dụ: "ASL_NAME_01")
  text: string;            // Từ gốc hiển thị
  gloss: string;           // Ký hiệu viết hoa chuẩn (ví dụ: "NAME")
  category: "SIGN" | "FINGERSPELL" | "NMM_ONLY";
  durationMs: number;      // Thời lượng clip
  nmm: {
    eyebrows?: "furrowed" | "raised" | "neutral";
    headTilt?: "left" | "right" | "nod" | "shake" | "none";
    mouth?: "open" | "pursed" | "smile" | "neutral";
  };
}
```

```
[Câu gốc: "What is your name?"]
  │
  ▼ (BƯỚC 1: Lemmatization & Stopword Elimination)
Lọc bỏ hư từ "is" -> Giữ lại tokens: ["what", "your", "name", "?"]
  │
  ▼ (BƯỚC 2: POS Tagging & Dependency Parsing)
- "your": PRON (Possessive)
- "name": NOUN (Topic)
- "what": PRON (WH-Question marker)
  │
  ▼ (BƯỚC 3: Rule-based Grammar Reordering)
Chuyển đổi sang chuẩn Topic-Comment:
Cấu trúc đích: [TOPIC: your name] + [COMMENT/QUESTION: what]
Trật tự Gloss ASL: ["YOUR", "NAME", "WHAT", "?"]
  │
  ▼ (BƯỚC 4: Non-Manual Marker Injection)
Phát hiện câu hỏi WH -> Gán NMM:
- eyebrows: "furrowed" (nhíu mày)
- headTilt: "forward" (hướng đầu về trước)
  │
  ▼ (BƯỚC 5: Lexicon Matching & Fingerspelling Fallback)
Tra cứu SignBank:
- "YOUR" -> Khớp clip "ASL_YOUR_01" (750ms)
- "NAME" -> Khớp clip "ASL_NAME_01" (900ms)
- "WHAT" -> Khớp clip "ASL_WHAT_01" (800ms)
(Nếu gặp từ riêng ví dụ "Alex" -> Tự động tách thành Fingerspell: ["A", "L", "E", "X"])
```

---

## 5. BỘ ĐIỀU KHIỂN DIỄN HOẠT 3D (SIGN ANIMATION ENGINE)

### 5.1. Thuật toán ghép nối chuyển động (Animation Blending & Crossfading)
Để tránh hiện tượng nhân vật bị "giật" (popping/snapping) khi chuyển đổi giữa các clip ký hiệu khác nhau, hệ thống sử dụng thuật toán **Slerp (Spherical Linear Interpolation)** kết hợp **Ease-in/Ease-out Weight Crossfade**:

```javascript
// Dynamic Animation Crossfade Controller (Three.js)
class SignAnimationController {
  constructor(mixer, defaultFadeDuration = 0.2) {
    this.mixer = mixer;
    this.fadeDuration = defaultFadeDuration; // 200ms lý tưởng để tay đổi thế mượt
    this.currentAction = null;
    this.queue = [];
    this.isSigning = false;
  }

  playSequence(clipList, nmmController) {
    this.queue = [...clipList];
    this.nmmController = nmmController;
    if (!this.isSigning) this.playNext();
  }

  playNext() {
    if (this.queue.length === 0) {
      this.returnToNeutralIdle();
      return;
    }

    this.isSigning = true;
    const nextItem = this.queue.shift();
    const nextAction = this.mixer.clipAction(nextItem.clip);

    nextAction.reset();
    nextAction.setLoop(THREE.LoopOnce, 1);
    nextAction.clampWhenFinished = true;

    if (this.currentAction) {
      // Crossfade mượt mà giữa động tác trước và động tác sau
      this.currentAction.crossFadeTo(nextAction, this.fadeDuration, true);
    } else {
      nextAction.fadeIn(this.fadeDuration);
    }

    nextAction.play();
    this.currentAction = nextAction;

    // Kích hoạt đồng thời biểu cảm nét mặt (Blendshapes)
    if (nextItem.nmm) {
      this.nmmController.applyNMM(nextItem.nmm, nextItem.duration);
    }

    // Lắng nghe sự kiện kết thúc để chuyển clip kế tiếp
    const onFinished = (e) => {
      if (e.action === nextAction) {
        this.mixer.removeEventListener('finished', onFinished);
        this.playNext();
      }
    };
    this.mixer.addEventListener('finished', onFinished);
  }

  returnToNeutralIdle() {
    // Trở về tư thế thả lỏng tự nhiên của người khiếm thính khi ngừng nói
    const idleAction = this.mixer.clipAction(this.neutralIdleClip);
    idleAction.reset();
    idleAction.fadeIn(0.4);
    idleAction.play();
    if (this.currentAction) {
      this.currentAction.crossFadeTo(idleAction, 0.4, true);
    }
    this.currentAction = idleAction;
    this.isSigning = false;
  }
}
```

### 5.2. Cơ chế đánh vần ngón tay (Fingerspelling Fallback Engine)
- Khi phát hiện thực thể tên riêng (NER), thuật ngữ y tế hoặc từ không có trong SignBank, hệ thống tự động gọi `FingerspellModule`.
- Chuyển đổi chuỗi ký tự thành mảng các tư thế ngón tay tĩnh (Letter Keyframes A-Z).
- Giữ mỗi chữ cái trong khoảng **250ms - 320ms** với độ nảy nhẹ ở cổ tay (wrist micro-oscillation) để mô phỏng chính xác nhịp điệu của người khiếm thính thực tế.

---

## 6. LỘ TRÌNH TRIỂN KHAI DỰ ÁN (PHASED ROADMAP & MILESTONES)

Dự án được chia làm **5 giai đoạn (Sprints)** kéo dài trong 15 tuần:

```
[W1 - W3] Sprint 1: 3D Engine & Avatar Pipeline
    │
[W4 - W6] Sprint 2: Multilingual Audio Ingestion & STT/MT
    │
[W7 - W9] Sprint 3: SignBank & Text-to-Gloss NLP Engine
    │
[W10 - W12] Sprint 4: Blending System, Fingerspelling & UI Integration
    │
[W13 - W15] Sprint 5: Performance Optimization, Usability Testing & Hardening
```

### Bảng phân công chi tiết từng Sprint:

| Sprint | Thời gian | Hạng mục công việc chính | Kết quả bàn giao (Deliverables) |
| :--- | :--- | :--- | :--- |
| **Sprint 1: 3D Engine & Avatar Setup** | Tuần 1 - 3 | - Tích hợp Ready Player Me GLB vào Three.js/R3F<br>- Cấu hình Bone Masking (tách biệt nửa thân trên/dưới)<br>- Kiểm thử ARKit 52 Blendshapes cho khuôn mặt | Viewport 3D 60fps hiển thị Avatar với khả năng cử động ngón tay và đổi nét mặt |
| **Sprint 2: Audio & STT Streaming** | Tuần 4 - 6 | - Triển khai Web Audio API + AudioWorklet thu âm 16kHz<br>- Tích hợp Silero VAD Client-side<br>- Kết nối WebSocket 2 chiều với Azure Speech Translation | Nói vào Mic -> Phụ đề gốc và câu dịch xuất hiện trên màn hình < 400ms |
| **Sprint 3: NLP & SignBank Dataset** | Tuần 7 - 9 | - Xây dựng từ điển cử chỉ (SignBank) 500 từ cơ bản (ASL/VSL)<br>- Phát triển Parser tách ngữ pháp SVO -> Topic-Comment<br>- Gán nhãn biểu cảm NMM theo loại câu | Đầu vào text dịch -> Trả về mảng Gloss Tokens và dữ liệu Blendshape tương ứng |
| **Sprint 4: Animation Blending & UI** | Tuần 10 - 12 | - Lập trình Animation Queue & Scheduler crossfading<br>- Hoàn thiện Fingerspelling A-Z fallback<br>- Dựng UI hoàn chỉnh: Subtitle kép, Flag selector, Audio Visualizer | Hệ thống hoàn chỉnh chạy end-to-end: Nói tiếng bất kỳ -> Avatar ký hiệu theo |
| **Sprint 5: Testing & Optimization** | Tuần 13 - 15 | - Nén mô hình (Draco/meshopt), tối ưu WebGL trên mobile<br>- Mời cộng đồng người khiếm thính (Deaf community) kiểm thử tính chính xác<br>- Tinh chỉnh góc độ bàn tay và tốc độ chuyển động | Ứng dụng Web hoàn chỉnh, độ trễ < 1.5s, độ chính xác ký hiệu đạt chuẩn cộng đồng |

---

## 7. QUẢN TRỊ RỦI RO KỸ THUẬT (TECHNICAL RISKS & MITIGATION)

| STT | Rủi ro kỹ thuật tiềm ẩn | Mức độ | Hậu quả | Phương án xử lý & Dự phòng (Mitigation Strategy) |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Độ trễ luồng xử lý vượt quá 2 giây** | Cao | Avatar phản hồi chậm trễ, phá vỡ trải nghiệm đàm thoại | • Bật **Speculative Prefetching**: Khi STT đang nhận diện từ khóa đầu tiên, hệ thống đã bắt đầu load sẵn animation clip vào RAM.<br>• Sử dụng AudioWorklet để streaming chunk 250ms thay vì đợi dứt câu. |
| **2** | **Hiện tượng "Uncanny Valley" và cử động giật khựng** | Cao | Động tác gãy, trông thô cứng, người khiếm thính không đọc được | • Duy trì `crossFadeTo` 180ms - 220ms.<br>• Thêm cử động thở phụ (Secondary Idle Breathing) ở xương ngực và chớp mắt ngẫu nhiên.<br>• Sử dụng dữ liệu Motion Capture (MoCap) thực tế thay vì diễn hoạt thủ công bằng code. |
| **3** | **Từ vựng bị thiếu (Out of Vocabulary - OOV)** | Trung bình | Avatar đứng im hoặc bỏ qua từ quan trọng | • Luôn kích hoạt **Fingerspelling Fallback Engine** cho bất kỳ từ nào không có trong SignBank.<br>• Hiển thị chú thích dạng chữ rõ ràng trên Subtitle HUD. |
| **4** | **WebGL giật lag trên thiết bị di động tầm trung** | Trung bình | Tụt FPS (< 30fps), thiết bị nóng và hao pin | • Cấu hình Dynamic Resolution Scaling (giảm độ phân giải render khi FPS tụt).<br>• Tắt Shadow map mềm trên mobile, dùng baked lighting.<br>• Nén texture xuống KTX2 và mesh qua Draco compression (< 3MB model). |
| **5** | **Sai lệch ngữ nghĩa ký hiệu (Sign Grammar Discrepancy)** | Nghiêm trọng | Người khiếm thính hiểu sai hoàn toàn nội dung nói | • Thành lập hội đồng cố vấn từ giáo viên/người khiếm thính bản ngữ ngay từ Sprint 3.<br>• Giai đoạn MVP ưu tiên tập từ điển mẫu có độ chính xác 100% thay vì tự động dịch mọi câu phức tạp. |

---

## 8. KẾT LUẬN & ĐỀ XUẤT BẮT ĐẦU

Kế hoạch kỹ thuật trên giải quyết triệt để 2 nút thắt lớn nhất của các ứng dụng dịch ký hiệu hiện nay: **Độ trễ đàm thoại** và **Sự khác biệt ngữ pháp giữa ngôn ngữ nói và ký hiệu**.

Bằng việc kết hợp kiến trúc **Stream-driven AudioWorklet**, **Azure Speech Translation**, **Rule-based Topic-Comment NLP Parser**, và **Three.js Animation Slerp Blending**, hệ thống đảm bảo tính khả thi cao, vận hành 100% trên nền Web hiện đại mà không cần cài đặt thêm bất kỳ phần mềm hay thiết bị chuyên dụng nào.
