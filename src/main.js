import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AvatarModel } from './avatar/avatarModel.js';
import { RetargetedAvatar } from './avatar/retargetedAvatar.js';
import { SignAnimationEngine } from './avatar/animationMixer.js';
import { SpeechHandler } from './audio/speechRecognition.js';
import { AudioVisualizer } from './audio/audioVisualizer.js';
import { SubtitleSync } from './ui/subtitleSync.js';
import { translateSpeech } from './nlp/translator.js';
import { convertTextToGloss } from './nlp/textToGloss.js';
import { SUPPORTED_LANGUAGES, SIGN_LEXICON, SYNONYM_MAP } from './nlp/signDictionary.js';
import { requestHybridGloss } from './nlp/hybridClient.js';
import { signLearnerInstance } from './nlp/signLearner.js';
import { generateProceduralKeyframes } from './avatar/proceduralSignGenerator.js';
import { ESP32Bridge } from './hardware/esp32Bridge.js';
import { TFTFrameStreamer } from './hardware/tftFrameStreamer.js';

class App {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.statusBadge = document.getElementById('status-badge');
    this.statusText = document.getElementById('status-text');
    this.centerSpinner = document.getElementById('center-loading-spinner');
    this.micContainer = document.getElementById('mic-container');
    this.micBtn = document.getElementById('mic-btn');
    this.manualInput = document.getElementById('manual-input');
    this.sendInputBtn = document.getElementById('send-input-btn');
    this.sourceLangSelect = document.getElementById('source-lang-select');
    this.targetSignSelect = document.getElementById('target-sign-select');
    this.replayBtn = document.getElementById('replay-btn');
    this.themeToggleBtn = document.getElementById('theme-toggle-btn');

    this.currentSourceLang = 'en-US';
    this.currentTargetSign = 'asl';
    this.lastProcessedTokens = [];
    this.lastOriginalText = '';
    this.lastTranslatedText = '';
    this.isStudioTheme = true; // Default to clean studio theme from reference video
    this.currentAvatar = 'vest';
    this.translationMode = 'local';
    this.requestId = 0;

    this.initThree();
    this.initAvatar();
    this.initAudioAndSpeech();
    this.initUI();
    this.initHybridUI();
    this.initLearnerUI();
    this.initESP32();
    this.loadCharacterAsset();
    this.animate();

    // Trigger welcoming sign on startup (matching video opening)
    this.welcomeTimer = setTimeout(() => {
      this.processUtterance('Hello, how are you today?', false, true);
    }, 900);
  }

  /* ---------------- 3D THREE.JS SETUP ---------------- */
  initThree() {
    this.scene = new THREE.Scene();
    
    // Clean bright studio backdrop matching reference video (off-white / soft silver)
    this.studioColor = new THREE.Color(0xe9e9e9);
    this.darkColor = new THREE.Color(0x0a0d14);
    this.scene.background = this.studioColor;

    this.clock = new THREE.Clock();

    // Camera setup - 3/4 framing showing head to thighs, matching reference video
    this.camera = new THREE.PerspectiveCamera(
      34,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      40
    );
    this.camera.position.set(0, .85, 3.1);

    // High quality WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls with constraints to keep avatar upright
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, .85, 0);
    this.controls.minDistance = 1.8;
    this.controls.maxDistance = 5.5;
    this.controls.enablePan = false;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.05;
    this.controls.minPolarAngle = Math.PI / 3;
    this.controls.maxAzimuthAngle = Math.PI / 3;
    this.controls.minAzimuthAngle = -Math.PI / 3;

    // Professional Studio 3-Point Lighting
    const ambientLight = new THREE.HemisphereLight(0xfff6e8, 0x8395a7, 1.5);
    this.scene.add(ambientLight);

    // Key Light (Main soft light from top-right)
    const keyLight = new THREE.DirectionalLight(0xfff3df, 2.4);
    keyLight.position.set(-2, 3, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -1.5;
    keyLight.shadow.camera.right = keyLight.shadow.camera.top = 1.5;
    keyLight.shadow.normalBias = .012;
    keyLight.shadow.bias = -.00015;
    this.scene.add(keyLight);

    // Fill Light (Soft cool light from front-left)
    const fillLight = new THREE.DirectionalLight(0xe2e8f0, .7);
    fillLight.position.set(-1.8, 1.8, 1.6);
    this.scene.add(fillLight);

    // Subtle Rim Light for silhouette separation
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(0, 2.0, -1.8);
    this.scene.add(rimLight);

    // Hand Illumination Light
    const handLight = new THREE.PointLight(0xffffff, 0.6, 2.5);
    handLight.position.set(0, 0.6, 0.9);
    this.scene.add(handLight);

    new ResizeObserver(() => this.onWindowResize()).observe(this.container);
    this.cameraView = 'halfbody';
    this.setCameraView(this.cameraView);
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.setCameraView(this.cameraView);
  }

  /* ---------------- AVATAR & ENGINE SETUP ---------------- */
  initAvatar() {
    this.avatar = new AvatarModel(this.scene);
    this.avatar.root.visible = false;
    this.signEngine = new SignAnimationEngine(this.avatar);

    this.subtitleSync = new SubtitleSync(
      document.getElementById('gloss-hud-box'),
      document.getElementById('speech-subtitle-box')
    );
  }

  /* ---------------- AUDIO & SPEECH HANDLER ---------------- */
  initAudioAndSpeech() {
    const visualizerCanvas = document.getElementById('visualizer-canvas');
    this.visualizer = new AudioVisualizer(visualizerCanvas);

    this.speechHandler = new SpeechHandler({
      lang: this.currentSourceLang,
      onStatusChange: (status) => this.updateStatus(status),
      onInterim: (interimText) => {
        const flag = this.getSelectedLangFlag();
        this.subtitleSync.setSpeechSubtitles(interimText, '...', flag);
      },
      onFinal: (finalText) => {
        this.visualizer.stop();
        this.micContainer.classList.remove('mic-active');
        this.processUtterance(finalText, false, false, 'mic');
      },
      onError: (err) => {
        console.warn('Speech error:', err);
        this.updateStatus('IDLE');
        this.showNotice(err === 'not-allowed' ? 'Chưa được cấp quyền micro. Bạn vẫn có thể nhập văn bản.' : 'Không nhận được giọng nói. Hãy thử lại hoặc nhập văn bản.');
      }
    });
  }

  getSelectedLangFlag() {
    const opt = this.sourceLangSelect.options[this.sourceLangSelect.selectedIndex];
    return opt?.text.split(' ')[0] || '🌐';
  }

  /* ---------------- UI CONTROLS & LISTENERS ---------------- */
  initUI() {
    // Microphone Button Toggle
    this.micBtn.addEventListener('click', async () => {
      this.cancelDemo();
      this.cancelPending();
      this.signEngine.stop();
      if (!this.speechHandler.recognition) {
        this.showNotice('Trình duyệt này chưa hỗ trợ nhận giọng nói. Hãy dùng Chrome/Edge hoặc nhập văn bản.');
        return;
      }
      if (this.speechHandler.isListening) {
        this.speechHandler.stopListening();
        this.visualizer.stop();
        this.micContainer.classList.remove('mic-active');
      } else {
        this.micBtn.disabled = true;
        const ready = await this.visualizer.startMicStream();
        this.micBtn.disabled = false;
        if (!ready) {
          this.showNotice('Không mở được micro. Kiểm tra quyền truy cập hoặc nhập văn bản.');
          return;
        }
        this.micContainer.classList.add('mic-active');
        await this.speechHandler.startListening();
      }
    });

    // Language dropdown change
    this.sourceLangSelect.addEventListener('change', (e) => {
      this.cancelDemo();
      this.setSourceLanguage(e.target.value);
    });

    // Circular Flag Pills in bottom bar (matching video style!)
    document.querySelectorAll('.flag-ball').forEach(ball => {
      ball.addEventListener('click', () => {
        this.cancelDemo();
        document.querySelectorAll('.flag-ball').forEach(b => b.classList.remove('active'));
        ball.classList.add('active');
        const langCode = ball.getAttribute('data-lang');
        if (langCode) {
          this.sourceLangSelect.value = langCode;
          this.setSourceLanguage(langCode);
        }
      });
    });

    // Target sign language dropdown change
    this.targetSignSelect.addEventListener('change', (e) => {
      this.currentTargetSign = e.target.value;
      if (this.lastOriginalText) {
        this.processUtterance(this.lastOriginalText);
      }
    });

    // Manual Text input
    const submitText = async () => {
      const val = this.manualInput.value.trim();
      if (val) {
        const succeeded = await this.processUtterance(val, false, false, 'text');
        if (succeeded && this.manualInput.value.trim() === val) this.manualInput.value = '';
      }
    };

    this.sendInputBtn.addEventListener('click', submitText);
    this.manualInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) submitText();
    });

    // Quick Preset buttons (support language switching per scene)
    document.querySelectorAll('.preset-chip, .preset-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        if (lang && lang !== this.currentSourceLang) {
          this.sourceLangSelect.value = lang;
          this.setSourceLanguage(lang);
        }
        const phrase = btn.getAttribute('data-phrase');
        if (phrase) this.processUtterance(phrase, false, false, 'preset');
      });
    });

    // Speed buttons (supporting both .speed-toggle and .speed-btn)
    document.querySelectorAll('.speed-toggle, .speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-toggle, .speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = parseFloat(btn.getAttribute('data-speed')) || 1.0;
        this.signEngine.setSpeed(speed);
      });
    });

    // Camera preset buttons (supporting both .cam-pill and .cam-btn)
    document.querySelectorAll('.cam-pill, .cam-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-pill, .cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setCameraView(btn.getAttribute('data-cam'));
      });
    });

    // Reference Poses Selector (Image 1 Wave vs Image 2 Sign vs Idle)
    document.querySelectorAll('.pose-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pose-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const pose = btn.getAttribute('data-pose');
        this.switchPose(pose);
      });
    });

    // Replay button
    this.replayBtn.addEventListener('click', () => {
      this.cancelDemo();
      this.cancelPending();
      if (this.lastProcessedTokens.length > 0) {
        if (this.lastPlayback) {
          const { original, translation, langLabel, result, mode } = this.lastPlayback;
          this.subtitleSync.setSpeechSubtitles(original, translation, langLabel);
          this.showTranslationResult(result, mode);
        }
        this.playTokens(this.lastProcessedTokens);
      }
    });

    // Theme toggle (Studio Light vs Dark Mode)
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => {
        this.isStudioTheme = !this.isStudioTheme;
        document.body.classList.toggle('dark-theme', !this.isStudioTheme);
        this.scene.background = this.isStudioTheme ? this.studioColor : this.darkColor;
        this.themeToggleBtn.textContent = this.isStudioTheme ? '☀️ Studio' : '🌙 Dark';
      });
    }

    // Drag and Drop custom .glb model
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
        this.loadCustomModelFile(file);
      }
    });

    const modelInput = document.getElementById('custom-model-input');
    if (modelInput) {
      modelInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.loadCustomModelFile(file);
      });
    }

    // Modal dialog
    const modal = document.getElementById('info-modal');
    document.getElementById('info-modal-btn')?.addEventListener('click', () => {
      modal?.classList.add('open');
    });
    document.getElementById('modal-close-btn')?.addEventListener('click', () => {
      modal?.classList.remove('open');
    });
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal?.classList.remove('open');
    });

    this.pauseBtn = document.getElementById('pause-btn');
    this.pauseBtn?.addEventListener('click', () => {
      const paused = this.signEngine.togglePause();
      this.pauseBtn.textContent = paused ? '▶ Tiếp tục' : 'Ⅱ Tạm dừng';
      this.pauseBtn.setAttribute('aria-pressed', String(paused));
      if (this.signEngine.isPlaying) this.updateStatus(paused ? 'PAUSED' : 'SIGNING');
    });
    document.getElementById('stop-btn')?.addEventListener('click', () => this.switchPose('Idle'));
    document.getElementById('demo-btn')?.addEventListener('click', () => {
      if (this.demoActive) { this.switchPose('Idle'); return; }
      this.demoActive = true;
      this.demoIndex = 0;
      const demoBtn = document.getElementById('demo-btn');
      if (demoBtn) demoBtn.textContent = '■ Dừng hội thoại';
      this.playDemoScene();
    });
    document.getElementById('focus-btn')?.addEventListener('click', () => {
      document.body.classList.toggle('presentation-mode');
      const focusBtn = document.getElementById('focus-btn');
      if (focusBtn) {
        focusBtn.textContent = document.body.classList.contains('presentation-mode') ? '↙ Thoát trình diễn' : '⛶ Trình diễn';
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.body.classList.remove('presentation-mode');
        const focusBtn = document.getElementById('focus-btn');
        if (focusBtn) focusBtn.textContent = '⛶ Trình diễn';
        modal?.classList.remove('open');
      }
    });
    document.getElementById('default-model-btn')?.addEventListener('click', () => this.useDefaultAvatar());
    document.getElementById('character-model-select')?.addEventListener('change', event => {
      this.currentAvatar = event.target.value;
      this.useDefaultAvatar();
    });
    document.getElementById('export-model-btn')?.addEventListener('click', async () => {
      try {
        const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
        const model = this.customModel || (this.characterAvatar ? this.characterAvatar.root : this.avatar.root);
        const data = await new GLTFExporter().parseAsync(model, { binary: true });
        const url = URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'sign-studio-avatar.glb'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) {
        console.error(error);
        this.showNotice('Không xuất được mô hình. Hãy thử lại.');
      }
    });
  }

  initHybridUI() {
    this.modeSelect = document.getElementById('translation-mode');
    this.hybridStatus = document.getElementById('hybrid-status');
    this.resultSummary = document.getElementById('translation-result');
    this.modeSelect?.addEventListener('change', () => {
      this.modeChosen = true;
      this.cancelDemo();
      this.cancelPending();
      this.signEngine.stop();
      this.updateStatus('IDLE');
      this.translationMode = this.modeSelect.value;
      this.syncTranslationMode();
    });
    document.getElementById('check-hybrid-btn')?.addEventListener('click', () => this.checkHybridConnection(true));
    this.syncTranslationMode();
    this.checkHybridConnection();
  }

  async checkHybridConnection(testProvider = false) {
    const button = document.getElementById('check-hybrid-btn');
    button.disabled = true;
    this.hybridStatus.textContent = 'Đang kiểm tra kết nối…';
    try {
      const response = await fetch(testProvider ? '/api/hybrid/check' : '/api/hybrid/status', {
        method: testProvider ? 'POST' : 'GET', signal: AbortSignal.timeout(testProvider ? 20000 : 5000)
      });
      const status = await response.json();
      if (!response.ok) throw new Error(status.error || 'Không kiểm tra được kết nối Gemini.');
      this.hybridStatus.textContent = status.configured
        ? status.reachable ? `Đã kết nối Gemini · ${status.model}` : `Gemini đã có key · chưa kiểm tra kết nối`
        : 'Gemini chưa kết nối · thêm API key theo mục ℹ';
      if (status.configured && !this.modeChosen && this.currentTargetSign === 'asl') {
        this.translationMode = 'hybrid';
        this.modeSelect.value = 'hybrid';
        this.syncTranslationMode();
      }
    } catch (error) {
      this.hybridStatus.textContent = testProvider ? error.message : 'Chưa có máy chủ Hybrid · vẫn dùng được Cục bộ';
    } finally { button.disabled = false; }
  }

  syncTranslationMode() {
    const hybrid = this.translationMode === 'hybrid';
    this.targetSignSelect.disabled = hybrid;
    if (hybrid) {
      this.currentTargetSign = 'asl';
      this.targetSignSelect.value = 'asl';
    }
    document.getElementById('hybrid-hint').textContent = hybrid
      ? 'Dịch câu mới bằng Gemini → ASL. Từ thiếu động tác được đánh vần A–Z. Lượt gọi có thể tính phí theo tài khoản.'
      : 'Từ điển chạy tại máy · không gọi API dịch. Chọn Hybrid để xử lý câu mới bằng Gemini.';
  }

  showTranslationResult(result, mode, inputSource = null) {
    this.lastTranslationResult = { result, mode, inputSource };
    const signs = result.tokens.filter(token => token.type === 'SIGN').length;
    const spelled = result.tokens.filter(token => token.type === 'FINGERSPELL').map(token => token.text || token.gloss);
    const source = mode === 'hybrid' ? `Gemini · ${result.model}${result.cached ? ' · đã lưu tạm' : ''}` : 'Từ điển cục bộ';
    const face = 'Nhân vật Vest diễn cử chỉ tay và đầu theo câu.';
    const inputLabels = {
      esp32: ' · 📡 Nguồn: Micro ESP32 (INMP441)',
      mic: ' · 🎙️ Nguồn: Micro máy tính',
      text: ' · ⌨️ Nguồn: Bàn phím',
      preset: ' · 📑 Nguồn: Câu mẫu'
    };
    const inputTag = inputLabels[inputSource] || '';
    this.resultSummary.textContent = `${source}${inputTag} · ${signs} ký hiệu · ${spelled.length} từ đánh vần. ${face}`;
    document.getElementById('translation-english').textContent = result.translation ? `Tiếng Anh: ${result.translation}` : '';
    
    const fallbackEl = document.getElementById('translation-fallback');
    if (spelled.length) {
      fallbackEl.innerHTML = `Đánh vần (chưa có động tác): ${spelled.map(w => `<span>${w}</span> <button class="quick-teach-pill" data-word="${w}" title="Dạy ký hiệu cho từ ${w}">➕ Dạy từ "${w}"</button>`).join(', ')}`;
      fallbackEl.querySelectorAll('.quick-teach-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openLearnerWithWord(btn.getAttribute('data-word'));
        });
      });
    } else {
      fallbackEl.textContent = '';
    }
  }

  switchPose(poseName) {
    this.cancelDemo();
    this.cancelPending();
    this.useDefaultAvatar();
    document.querySelectorAll('.pose-pill').forEach(b => b.classList.toggle('active', b.dataset.pose === poseName));
    if (poseName === 'Image1_Wave_Hello') {
      this.playReferencePose('HELLO', 'Vẫy chào · ảnh 2');
    } else if (poseName === 'Image2_Sign_Chest') {
      this.playReferencePose('HOW', 'Hai tay trước ngực · ảnh 1');
    } else {
      this.signEngine.stop();
      this.subtitleSync.clear();
      this.updateStatus('IDLE');
    }
  }

  loadCustomModelFile(file) {
    this.cancelDemo();
    this.cancelPending();
    const requestId = this.modelRequestId = (this.modelRequestId || 0) + 1;
    if (!file.name.toLowerCase().endsWith('.glb')) {
      this.showNotice('Hãy dùng file .GLB đóng gói đầy đủ mô hình và vật liệu.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const contents = e.target.result;
      const loader = new GLTFLoader();
      loader.parse(contents, '', (gltf) => {
        if (this.modelRequestId !== requestId) return;
        // Hide procedural avatar and show custom loaded GLTF model
        this.signEngine.stop();
        this.disposeCustomModel();
        this.avatar.root.visible = false;
        if (this.characterAvatar) this.characterAvatar.root.visible = false;
        
        this.customModel = gltf.scene;
        this.customModel.position.set(0, 0, 0);
        this.customModel.scale.set(1, 1, 1);
        const box = new THREE.Box3().setFromObject(this.customModel);
        const size = box.getSize(new THREE.Vector3());
        const scale = 1.9 / Math.max(size.y, .001);
        const center = box.getCenter(new THREE.Vector3());
        this.customModel.scale.setScalar(scale);
        this.customModel.position.set(-center.x * scale, -.4 - box.min.y * scale, -center.z * scale);
        this.scene.add(this.customModel);

        if (gltf.animations && gltf.animations.length > 0) {
          this.customMixer = new THREE.AnimationMixer(this.customModel);
          this.customActions = {};
          gltf.animations.forEach((clip) => {
            this.customActions[clip.name] = this.customMixer.clipAction(clip);
          });
          const action = this.customMixer.clipAction(gltf.animations[0]);
          action.play();
        }

        const flag = this.getSelectedLangFlag();
        this.subtitleSync.setSpeechSubtitles('Mô hình custom GLB đã nạp thành công!', file.name, flag);
        this.updateStatus('IDLE');
        this.showNotice('Đang xem GLB và hoạt ảnh có sẵn. Dịch câu sẽ chuyển về nhân vật ký hiệu.');
      }, (err) => {
        console.error('Failed to parse GLB model:', err);
        this.showNotice('Không đọc được mô hình GLB. Mô hình hiện tại vẫn được giữ lại.');
      });
    };
    reader.onerror = () => this.showNotice('Không đọc được file mô hình.');
    reader.readAsArrayBuffer(file);
  }

  setSourceLanguage(langCode) {
    if (!SUPPORTED_LANGUAGES.some(lang => lang.code === langCode)) {
      this.showNotice('Chỉ hỗ trợ tiếng Việt và tiếng Anh.');
      return;
    }
    this.sourceLangSelect.value = langCode;
    this.cancelPending();
    this.speechHandler.stopListening();
    this.signEngine.stop();
    this.updateStatus('IDLE');
    this.currentSourceLang = langCode;
    this.speechHandler.setLanguage(this.currentSourceLang);

    // Sync active flag ball
    document.querySelectorAll('.flag-ball').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-lang') === langCode);
    });

    // Local mode follows the input language. Hybrid keeps ASL for both inputs.
    const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === this.currentSourceLang);
    this.currentTargetSign = this.translationMode === 'hybrid' ? 'asl' : langConfig.defaultSign;
    this.targetSignSelect.value = this.currentTargetSign;
  }

  setCameraView(type) {
    this.cameraView = type || 'halfbody';
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    const distance = Math.max(type === 'closeup' ? 2.25 : 3.1, (type === 'closeup' ? .72 : 1.05) / Math.max(aspect, .3) / Math.tan(17 * Math.PI / 180));
    if (type === 'closeup') {
      this.camera.position.set(0, 1.03, distance);
      this.controls.target.set(0, 1.03, 0);
    } else if (type === 'cinematic') {
      this.camera.position.set(distance * .28, .88, distance);
      this.controls.target.set(0, .88, 0);
    } else {
      // 3/4 Video framing default
      this.camera.position.set(0, .85, distance);
      this.controls.target.set(0, .85, 0);
    }
  }

  /* ---------------- PROCESS UTTERANCE PIPELINE ---------------- */
  async processUtterance(text, fromDemo = false, forceLocal = false, inputSource = null) {
    if (!text || typeof text !== 'string' || !text.trim()) return false;
    if (text.length > 500) { this.showNotice('Mỗi lần dịch tối đa 500 ký tự.'); return false; }
    if (!fromDemo) this.cancelDemo();
    this.cancelPending();
    const requestId = this.requestId;
    const controller = this.translationController = new AbortController();
    const mode = forceLocal ? 'local' : this.translationMode;
    const sourceLanguage = this.currentSourceLang;
    const targetSign = this.currentTargetSign;
    this.showNotice('');
    this.useDefaultAvatar();
    this.signEngine.stop();
    this.avatar.applyNeutralRestPose();
    this.subtitleSync.clear();
    this.lastTranslationResult = null;
    document.getElementById('translation-english').textContent = '';
    document.getElementById('translation-fallback').textContent = '';
    this.resultSummary.textContent = mode === 'hybrid' ? 'Gemini đang phân tích câu và dấu hiệu phi thủ công…' : 'Đang tra từ điển cục bộ…';
    document.querySelectorAll('.pose-pill').forEach(b => b.classList.remove('active'));

    this.lastOriginalText = text;
    this.updateStatus('PROCESSING');

    // Show center circular spinner like in video during processing
    if (this.centerSpinner) {
      this.centerSpinner.classList.add('visible');
    }

    try {
      let result;
      if (mode === 'hybrid') {
        result = await requestHybridGloss(text, sourceLanguage, targetSign, { signal: controller.signal });
      } else {
        if (targetSign === 'vsl' && (sourceLanguage.startsWith('vi') || !/[a-zA-Z]{4,}/.test(text))) {
          result = { ...convertTextToGloss(text, 'vsl'), translation: text };
        } else {
          const translated = translateSpeech(text, sourceLanguage.split('-')[0] || 'en').translated;
          result = { ...convertTextToGloss(translated, targetSign), translation: translated };
        }
      }
      if (requestId !== this.requestId) return false;
      this.lastTranslatedText = result.translation;
      const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === sourceLanguage);
      const langLabel = langConfig ? langConfig.name : 'English';
      const sourceBadge = inputSource === 'esp32' ? '📡 ESP32 | ' : (inputSource === 'mic' ? '🎙️ Mic PC | ' : '');
      this.subtitleSync.setSpeechSubtitles(text, result.translation, `${sourceBadge}${langLabel}`);
      this.lastProcessedTokens = result.tokens;
      this.lastPlayback = { original: text, translation: result.translation, langLabel, result, mode };
      this.showTranslationResult(result, mode, inputSource);
      this.playTokens(result.tokens);
      return true;
    } catch (error) {
      if (requestId !== this.requestId || controller.signal.aborted) return false;
      this.cancelDemo();
      this.updateStatus('IDLE');
      this.resultSummary.textContent = error.message;
      this.showNotice(error.message);
      return false;
    } finally {
      if (requestId === this.requestId) {
        this.translationController = null;
        this.centerSpinner?.classList.remove('visible');
      }
    }
  }

  playTokens(tokens) {
    if (!tokens || tokens.length === 0) {
      this.updateStatus('IDLE');
      return;
    }

    this.updateStatus('SIGNING');
    this.pauseBtn.textContent = 'Ⅱ Tạm dừng';
    this.pauseBtn.setAttribute('aria-pressed', 'false');
    this.useDefaultAvatar();
    this.subtitleSync.setGlossSequence(tokens);

    this.signEngine.playSequence(
      tokens,
      (activeToken, idx, total) => {
        this.subtitleSync.setActiveToken(activeToken, idx);
      },
      () => {
        this.subtitleSync.setActiveToken(null, 0);
        this.updateStatus('IDLE');
        if (this.demoActive) {
          this.demoIndex++;
          this.demoTimer = setTimeout(() => this.playDemoScene(), 900);
        }
      }
    );
  }

  updateStatus(status) {
    this.statusBadge.className = 'prodeaf-status-badge';
    if (this.pauseBtn) this.pauseBtn.disabled = !['SIGNING', 'PAUSED'].includes(status);

    switch (status) {
      case 'ESP32_RECORDING':
        this.statusBadge.classList.add('status-listening');
        this.statusText.textContent = '📡 ESP32 ĐANG THU ÂM...';
        break;
      case 'LISTENING':
        this.statusBadge.classList.add('status-listening');
        this.statusText.textContent = '🎙️ MIC MÁY TÍNH ĐANG NGHE...';
        break;
      case 'PROCESSING':
        this.statusBadge.classList.add('status-processing');
        this.statusText.textContent = 'ĐANG XỬ LÝ...';
        break;
      case 'SIGNING':
        this.statusBadge.classList.add('status-signing');
        this.statusText.textContent = '🔵 ĐANG DIỄN HOẠT KÝ HIỆU';
        break;
      case 'PAUSED':
        this.statusText.textContent = 'ĐÃ TẠM DỪNG';
        break;
      case 'IDLE':
      default:
        this.statusBadge.classList.add('status-idle');
        this.statusText.textContent = '🟢 SẴN SÀNG (READY)';
        this.micContainer.classList.remove('mic-active');
        this.visualizer.stop();
        if (this.centerSpinner) this.centerSpinner.classList.remove('visible');
        break;
    }
  }

  /* ---------------- MAIN RENDER LOOP ---------------- */
  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), .05);
    const elapsedTime = this.clock.elapsedTime;

    // Idle breathing & natural micro-movements
    this.signEngine.update(delta);
    if (!this.signEngine.isPaused) this.avatar.updateIdle(elapsedTime, this.signEngine.isPlaying);
    if (this.characterAvatar?.root.visible) this.characterAvatar.update(delta, elapsedTime);
    if (this.customMixer) this.customMixer.update(delta);
    const progress = document.getElementById('playback-progress');
    if (progress) {
      progress.value = this.signEngine.progress;
      const counter = document.getElementById('playback-counter');
      if (counter) {
        counter.textContent = this.signEngine.isPlaying
          ? `${this.signEngine.tokenIndex} / ${this.signEngine.totalTokens}` : 'Sẵn sàng';
      }
    }

    // Update smooth camera controls
    this.controls.update();

    // Render scene
    this.renderer.render(this.scene, this.camera);

    // TFT ST7789 Frame Streamer
    this.tftStreamer?.update(this.renderer, this.scene);
  }

  cancelPending() {
    this.requestId++;
    if (this.translationController && this.resultSummary) this.resultSummary.textContent = 'Đã hủy yêu cầu dịch.';
    this.translationController?.abort();
    this.translationController = null;
    clearTimeout(this.welcomeTimer);
    clearTimeout(this.processingTimer);
    if (this.centerSpinner) this.centerSpinner.classList.remove('visible');
  }

  cancelDemo() {
    this.demoActive = false;
    clearTimeout(this.demoTimer);
    const button = document.getElementById('demo-btn');
    if (button) button.textContent = '▶ Hội thoại Việt–Anh';
  }

  playDemoScene() {
    const scenes = [...document.querySelectorAll('.preset-chip[data-phrase]')].slice(0, 4);
    if (this.demoIndex >= scenes.length) { this.cancelDemo(); return; }
    const scene = scenes[this.demoIndex];
    this.sourceLangSelect.value = scene.dataset.lang;
    this.setSourceLanguage(scene.dataset.lang);
    this.processUtterance(scene.dataset.phrase, true, true);
  }

  playReferencePose(key, label) {
    this.lastPlayback = null;
    const tokens = [{ type: 'SIGN', clipKey: key, gloss: label, duration: 3000, nmm: { smile: .65 } }];
    this.lastProcessedTokens = tokens;
    this.subtitleSync.setSpeechSubtitles(label, '', 'Tư thế mẫu');
    this.playTokens(tokens);
  }

  showNotice(message) {
    const notice = document.getElementById('notice');
    notice.textContent = message;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { notice.textContent = ''; }, 7000);
  }

  disposeCustomModel() {
    if (!this.customModel) return;
    this.customMixer?.stopAllAction();
    this.customMixer?.uncacheRoot(this.customModel);
    this.scene.remove(this.customModel);
    this.customModel.traverse(node => {
      node.geometry?.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of materials.filter(Boolean)) {
        Object.values(mat).forEach(value => { if (value?.isTexture) value.dispose(); });
        mat.dispose();
      }
    });
    this.customModel = this.customMixer = this.customActions = null;
  }

  useDefaultAvatar() {
    this.modelRequestId = (this.modelRequestId || 0) + 1;
    this.disposeCustomModel();
    this.avatar.root.visible = false;
    if (this.characterAvatar) this.characterAvatar.root.visible = true;
    this.updateCharacterLabel();
  }

  updateCharacterLabel() {
    const label = document.getElementById('character-label');
    if (label) {
      label.textContent = this.characterAvatar ? 'NHÂN VẬT VEST' : 'ĐANG NẠP NHÂN VẬT VEST…';
    }
    if (this.lastTranslationResult) this.showTranslationResult(this.lastTranslationResult.result, this.lastTranslationResult.mode);
  }

  async loadCharacterAsset() {
    if (this.characterAvatar || this.characterLoading) return;
    this.characterLoading = true;
    this.updateCharacterLabel();
    try {
      const asset = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}vest.glb`);
      this.characterAvatar = new RetargetedAvatar(asset.scene, this.avatar);
      this.scene.add(this.characterAvatar.root);
      this.characterAvatar.root.visible = !this.customModel;
      this.avatar.root.visible = false;
      this.updateCharacterLabel();
    } catch (error) {
      console.error('Cannot load vest character:', error);
      this.showNotice('Chưa nạp được mô hình Vest.');
    } finally {
      this.characterLoading = false;
    }
  }

  /* ---------------- SIGN LEARNER UI & KNOWLEDGE BASE ---------------- */
  initLearnerUI() {
    this.learnerModal = document.getElementById('learner-modal');
    this.learnerModalBtn = document.getElementById('learner-modal-btn');
    this.learnerCloseBtn = document.getElementById('learner-close-btn');
    this.signCountBadge = document.getElementById('sign-count-badge');
    this.teachForm = document.getElementById('teach-sign-form');
    this.teachStatus = document.getElementById('teach-status-message');
    this.signLibraryGrid = document.getElementById('sign-library-grid');
    this.signSearchInput = document.getElementById('sign-search-input');
    this.signFilterLang = document.getElementById('sign-filter-lang');
    this.exportSignsBtn = document.getElementById('btn-export-signs');
    this.importSignsInput = document.getElementById('import-signs-input');

    if (!this.learnerModal) return;

    // Open & Close Modal
    this.learnerModalBtn?.addEventListener('click', () => {
      this.learnerModal.classList.add('open');
      this.renderSignLibrary();
    });

    this.learnerCloseBtn?.addEventListener('click', () => {
      this.learnerModal.classList.remove('open');
    });

    this.learnerModal.addEventListener('click', (e) => {
      if (e.target === this.learnerModal) this.learnerModal.classList.remove('open');
    });

    // Tab Navigation
    document.querySelectorAll('.learner-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.learner-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.learner-tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        document.getElementById(`tab-${tab}`)?.classList.add('active');
        if (tab === 'library') this.renderSignLibrary();
      });
    });

    // AI Auto-Synthesize Button
    document.getElementById('btn-auto-synthesize')?.addEventListener('click', () => {
      const word = document.getElementById('new-sign-word').value.trim();
      const lang = document.getElementById('new-sign-lang').value;
      if (!word) {
        this.showTeachStatus('Vui lòng nhập từ ngữ trước khi bấm AI tự động tạo.', 'error');
        return;
      }
      const synthesized = signLearnerInstance.autoSynthesize(word, lang);
      if (synthesized) {
        document.getElementById('new-sign-template').value = synthesized.config.motion;
        document.getElementById('new-sign-handshape').value = synthesized.config.handshape;
        document.getElementById('new-sign-location').value = synthesized.config.location;
        document.getElementById('new-sign-twohanded').checked = synthesized.config.twoHanded;
        document.getElementById('new-sign-desc').value = synthesized.desc;
        this.showTeachStatus(`✨ AI đã gợi ý cử chỉ tối ưu cho từ "${word}". Bấm "Xem Thử" để kiểm tra!`, 'success');
      }
    });

    // Preview on Avatar
    document.getElementById('btn-preview-sign')?.addEventListener('click', () => {
      const word = document.getElementById('new-sign-word').value.trim();
      const lang = document.getElementById('new-sign-lang').value;
      if (!word) {
        this.showTeachStatus('Vui lòng nhập từ ngữ để xem thử.', 'error');
        return;
      }
      const config = {
        handshape: document.getElementById('new-sign-handshape').value,
        location: document.getElementById('new-sign-location').value,
        motion: document.getElementById('new-sign-template').value,
        twoHanded: document.getElementById('new-sign-twohanded').checked,
        nmm: { smile: 0.5 }
      };
      this.playPreviewSign(word, lang, config);
    });

    // Form Submit (Save learned sign)
    this.teachForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const word = document.getElementById('new-sign-word').value.trim();
      const signLang = document.getElementById('new-sign-lang').value;
      const desc = document.getElementById('new-sign-desc').value.trim();
      const config = {
        handshape: document.getElementById('new-sign-handshape').value,
        location: document.getElementById('new-sign-location').value,
        motion: document.getElementById('new-sign-template').value,
        twoHanded: document.getElementById('new-sign-twohanded').checked,
        nmm: { smile: 0.5 }
      };

      try {
        const entry = signLearnerInstance.teachSign({
          word,
          signLang,
          desc: desc || `Ký hiệu: ${word}`,
          config
        });

        // Register to active runtime dictionary
        const cleanWord = word.toLowerCase().trim();
        SYNONYM_MAP[cleanWord] = entry.key;
        SIGN_LEXICON[entry.key] = {
          [signLang]: { gloss: entry.gloss, duration: entry.duration, desc: entry.desc, nmm: config.nmm }
        };

        this.showTeachStatus(`✅ Đã lưu ký hiệu "${word}" vào bộ nhớ! Có thể dùng ngay khi nói hoặc gõ.`, 'success');
        this.updateSignCountBadge();
        // Play preview of newly taught sign
        this.playPreviewSign(word, signLang, config);
      } catch (err) {
        this.showTeachStatus(`Lỗi lưu ký hiệu: ${err.message}`, 'error');
      }
    });

    // Search & Filter in Library
    this.signSearchInput?.addEventListener('input', () => this.filterLibrary());
    this.signFilterLang?.addEventListener('change', () => this.filterLibrary());

    // Export JSON
    this.exportSignsBtn?.addEventListener('click', () => {
      const json = signLearnerInstance.exportJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sign_studio_learned_lexicon.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    // Import JSON
    this.importSignsInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const count = signLearnerInstance.importJson(event.target.result);
          this.showNotice(`Đã nhập thành công ${count} ký hiệu mới!`);
          this.renderSignLibrary();
          this.updateSignCountBadge();
        } catch (err) {
          this.showNotice(`Không nhập được file JSON: ${err.message}`);
        }
      };
      reader.readAsText(file);
    });

    this.updateSignCountBadge();
  }

  /* ---------------- ESP32-S3 HARDWARE BRIDGE ---------------- */
  initESP32() {
    this.esp32StatusDot = document.getElementById('esp32-status');
    this.esp32IPInput = document.getElementById('esp32-ip');
    this.esp32ConnectBtn = document.getElementById('esp32-connect-btn');

    if (!this.esp32ConnectBtn) return;

    // Khôi phục IP đã lưu hoặc dùng IP mặc định
    const savedIP = ESP32Bridge.loadIP() || '192.168.1.24';
    if (this.esp32IPInput) this.esp32IPInput.value = savedIP;

    this.esp32Bridge = new ESP32Bridge({
      onTranscript: (text, lang) => {
        if (!SUPPORTED_LANGUAGES.some(item => item.code === lang)) {
          this.showNotice('ESP32: chỉ nhận tiếng Việt hoặc tiếng Anh.');
          return;
        }
        // Đổi ngôn ngữ nguồn cho khớp
        if (lang && lang !== this.currentSourceLang) {
          this.sourceLangSelect.value = lang;
          this.setSourceLanguage(lang);
        }
        // Hiển thị nguồn thu: ESP32
        this.showNotice(`📡 ESP32 vừa thu âm: "${text}"`);
        // Điều khiển avatar — đánh dấu rõ nguồn thu là 'esp32'
        this.processUtterance(text, false, false, 'esp32');
      },
      onStatus: (status) => {
        this.updateESP32Status(status);
      },
      onAudioLevel: (rms, isRecording) => {
        if (this.esp32Bridge?.connected) {
          if (isRecording) {
            this.updateStatus('ESP32_RECORDING');
            if (this.esp32StatusDot) this.esp32StatusDot.textContent = '🔴';
          } else {
            if (this.esp32StatusDot) this.esp32StatusDot.textContent = '🟢';
          }
        }
      }
    });

    this.esp32ConnectBtn.addEventListener('click', () => {
      if (this.esp32Bridge.connected) {
        this.esp32Bridge.disconnect();
      } else {
        const ip = this.esp32IPInput?.value?.trim();
        if (!ip) {
          this.showNotice('Nhập địa chỉ IP của ESP32-S3 (xem Serial Monitor).');
          return;
        }
        ESP32Bridge.saveIP(ip);
        this.esp32Bridge.connect(ip);
      }
    });

    // Enter trong ô IP cũng kết nối
    this.esp32IPInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.esp32ConnectBtn.click();
    });

    // Tự động kết nối tới ESP32 sau khi nạp trang
    setTimeout(() => {
      const ip = this.esp32IPInput?.value?.trim();
      if (ip && !this.esp32Bridge?.connected) {
        this.esp32Bridge.connect(ip);
      }
    }, 1500);

    // Khởi tạo điều khiển TFT ST7789 Streamer
    this.initTFTStreamControls();
  }

  initTFTStreamControls() {
    this.tftStreamBtn = document.getElementById('tft-stream-btn');
    this.tftFpsSelect = document.getElementById('tft-fps-select');
    this.tftQualitySelect = document.getElementById('tft-quality-select');
    this.tftInvertBtn = document.getElementById('tft-invert-btn');
    this.tftRotateBtn = document.getElementById('tft-rotate-btn');
    this.tftStatsBadge = document.getElementById('tft-stats');

    this.tftCurrentInvert = false;
    this.tftCurrentRotation = 1;

    this.tftStreamer = new TFTFrameStreamer({
      bridge: this.esp32Bridge,
      onStats: (stats) => this.updateTFTStats(stats),
      onError: (msg) => this.showNotice(msg)
    });

    if (this.tftStreamBtn) {
      this.tftStreamBtn.addEventListener('click', () => {
        if (!this.tftStreamer) return;
        if (this.tftStreamer.enabled) {
          this.tftStreamer.stop();
          this.tftStreamBtn.classList.remove('active');
          this.tftStreamBtn.textContent = '📺 Truyền TFT';
          this.showNotice('Đã dừng truyền avatar lên màn hình TFT ST7789.');
        } else {
          const started = this.tftStreamer.start();
          if (started) {
            this.tftStreamBtn.classList.add('active');
            this.tftStreamBtn.textContent = '⏹ Dừng TFT';
            this.showNotice('Đang truyền chuyển động avatar 3D lên màn hình TFT ST7789!');
          }
        }
      });
    }

    if (this.tftInvertBtn) {
      this.tftInvertBtn.addEventListener('click', () => {
        this.tftCurrentInvert = !this.tftCurrentInvert;
        this.tftStreamer?.setInvert(this.tftCurrentInvert);
        this.showNotice(this.tftCurrentInvert ? 'Đã gửi lệnh: Bật đảo màu TFT.' : 'Đã gửi lệnh: Tắt đảo màu TFT.');
      });
    }

    if (this.tftRotateBtn) {
      this.tftRotateBtn.addEventListener('click', () => {
        this.tftCurrentRotation = (this.tftCurrentRotation === 1) ? 0 : 1;
        this.tftStreamer?.setRotation(this.tftCurrentRotation);
        this.showNotice(`Đã đổi góc quay màn hình sang: ${this.tftCurrentRotation === 1 ? 'Ngang (320x240)' : 'Dọc (240x320)'}`);
      });
    }

    if (this.tftFpsSelect) {
      this.tftFpsSelect.addEventListener('change', (e) => {
        this.tftStreamer?.setFPS(Number(e.target.value));
      });
    }

    if (this.tftQualitySelect) {
      this.tftQualitySelect.addEventListener('change', (e) => {
        this.tftStreamer?.setQuality(Number(e.target.value));
      });
    }
  }

  updateTFTStats(stats) {
    if (!this.tftStatsBadge) return;
    if (stats.enabled) {
      const dropTxt = stats.dropped > 0 ? ` · drop ${stats.dropped}` : '';
      this.tftStatsBadge.textContent = `${stats.fps} fps · ${stats.lastSizeKb}KB${dropTxt}`;
      this.tftStatsBadge.className = 'tft-stats-badge streaming';
      if (this.tftStreamBtn) {
        this.tftStreamBtn.classList.add('active');
        this.tftStreamBtn.textContent = '⏹ Dừng TFT';
      }
    } else {
      this.tftStatsBadge.textContent = 'TFT: Tắt';
      this.tftStatsBadge.className = 'tft-stats-badge';
      if (this.tftStreamBtn) {
        this.tftStreamBtn.classList.remove('active');
        this.tftStreamBtn.textContent = '📺 Truyền TFT';
      }
    }
  }

  updateESP32Status(status) {
    if (!this.esp32StatusDot || !this.esp32ConnectBtn) return;
    const labels = {
      disconnected: ['⚫', '📡 ESP32',     'Chưa kết nối ESP32'],
      connecting:   ['🟡', '⏳ Đang nối…', 'Đang kết nối ESP32…'],
      connected:    ['🟢', '🔌 Ngắt ESP32', 'ESP32 đã kết nối! Avatar sẽ diễn khi bạn nói vào micro.'],
      error:        ['🔴', '📡 ESP32',     'Không kết nối được ESP32. Kiểm tra IP và WiFi.']
    };
    const [dot, btnText, notice] = labels[status] || labels.disconnected;
    this.esp32StatusDot.textContent = dot;
    this.esp32ConnectBtn.textContent = btnText;

    // Cập nhật trạng thái nút bấm TFT Stream
    if (this.tftStreamBtn) {
      if (status === 'connected') {
        this.tftStreamBtn.disabled = false;
        if (this.tftInvertBtn) this.tftInvertBtn.disabled = false;
        if (this.tftRotateBtn) this.tftRotateBtn.disabled = false;
      } else {
        this.tftStreamBtn.disabled = true;
        if (this.tftInvertBtn) this.tftInvertBtn.disabled = true;
        if (this.tftRotateBtn) this.tftRotateBtn.disabled = true;
        if (this.tftStreamer?.enabled) {
          this.tftStreamer.stop();
        }
      }
    }

    if (status === 'connected' || status === 'error') {
      this.showNotice(notice);
    }
  }

  showTeachStatus(msg, type = 'success') {
    if (!this.teachStatus) return;
    this.teachStatus.textContent = msg;
    this.teachStatus.className = `status-msg ${type}`;
    setTimeout(() => {
      if (this.teachStatus) this.teachStatus.className = 'status-msg';
    }, 4500);
  }

  openLearnerWithWord(word) {
    if (!this.learnerModal) return;
    this.learnerModal.classList.add('open');
    document.querySelector('.learner-tab-btn[data-tab="teach"]')?.click();
    const wordInput = document.getElementById('new-sign-word');
    if (wordInput) {
      wordInput.value = word;
      document.getElementById('new-sign-lang').value = this.currentTargetSign || 'vsl';
      document.getElementById('btn-auto-synthesize')?.click();
    }
  }

  playPreviewSign(word, lang, config) {
    this.useDefaultAvatar();
    this.signEngine.stop();
    this.avatar.applyNeutralRestPose();
    const frames = generateProceduralKeyframes(config);
    const previewKey = `PREVIEW_${Date.now()}`;
    signLearnerInstance.cacheKeyframes.set(previewKey, frames);

    const token = {
      id: previewKey,
      clipKey: previewKey,
      signLang: lang,
      text: word,
      gloss: word.toUpperCase(),
      type: 'SIGN',
      duration: 1100,
      nmm: config.nmm,
      desc: `Xem thử ký hiệu: ${word}`
    };

    this.subtitleSync.setSpeechSubtitles(word, `Xem thử ký hiệu (${lang.toUpperCase()})`, lang === 'vsl' ? 'Tiếng Việt' : 'English');
    this.playTokens([token]);
  }

  updateSignCountBadge() {
    if (!this.signCountBadge) return;
    const learned = signLearnerInstance.getAllLearned().length;
    const builtIn = Object.keys(SIGN_LEXICON).length;
    this.signCountBadge.textContent = `${builtIn + learned}`;
  }

  renderSignLibrary() {
    if (!this.signLibraryGrid) return;
    this.signLibraryGrid.innerHTML = '';

    // Collect all items: built-in and custom learned
    const items = [];

    // Custom learned
    for (const sign of signLearnerInstance.getAllLearned()) {
      items.push({
        key: sign.key,
        word: sign.word,
        gloss: sign.gloss,
        signLang: sign.signLang || 'vsl',
        desc: sign.desc,
        isCustom: true
      });
    }

    // Built-in
    for (const [key, data] of Object.entries(SIGN_LEXICON)) {
      if (items.some(it => it.key === key)) continue;
      const vslData = data.vsl;
      const aslData = data.asl;
      if (vslData) {
        items.push({
          key,
          word: vslData.gloss?.toLowerCase() || key.toLowerCase(),
          gloss: vslData.gloss || key,
          signLang: 'vsl',
          desc: vslData.desc || '',
          isCustom: false
        });
      }
      if (aslData) {
        items.push({
          key,
          word: aslData.gloss?.toLowerCase() || key.toLowerCase(),
          gloss: aslData.gloss || key,
          signLang: 'asl',
          desc: aslData.desc || '',
          isCustom: false
        });
      }
    }

    this.allLibraryItems = items;
    this.filterLibrary();
  }

  filterLibrary() {
    if (!this.signLibraryGrid || !this.allLibraryItems) return;
    const query = (this.signSearchInput?.value || '').toLowerCase().trim();
    const filter = this.signFilterLang?.value || 'all';

    const filtered = this.allLibraryItems.filter(item => {
      if (filter === 'custom' && !item.isCustom) return false;
      if (filter === 'vsl' && item.signLang !== 'vsl') return false;
      if (filter === 'asl' && item.signLang !== 'asl') return false;
      if (query) {
        const match = item.gloss.toLowerCase().includes(query) ||
                      item.word.toLowerCase().includes(query) ||
                      (item.desc || '').toLowerCase().includes(query);
        if (!match) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      this.signLibraryGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 20px;">Không tìm thấy ký hiệu phù hợp. Bạn có thể tự dạy ký hiệu ở tab bên cạnh!</div>`;
      return;
    }

    this.signLibraryGrid.innerHTML = filtered.map(item => `
      <div class="sign-card">
        <div class="sign-card-top">
          <span class="sign-card-flag">${item.signLang === 'vsl' ? '🇻🇳 VSL' : '🇺🇸 ASL'}</span>
          <span class="sign-card-badge ${item.isCustom ? 'custom' : ''}">${item.isCustom ? 'Tự học' : 'Hệ thống'}</span>
        </div>
        <h4 class="sign-card-title">${item.gloss}</h4>
        <p class="sign-card-desc">${item.desc || item.word}</p>
        <div class="sign-card-actions">
          <button class="card-action-btn" data-key="${item.key}" data-lang="${item.signLang}" data-word="${item.word}">▶ Diễn thử</button>
          ${item.isCustom ? `<button class="card-del-btn" data-del="${item.key}" title="Xóa ký hiệu này">✕</button>` : ''}
        </div>
      </div>
    `).join('');

    // Attach play & delete handlers
    this.signLibraryGrid.querySelectorAll('.card-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        const lang = btn.getAttribute('data-lang');
        const word = btn.getAttribute('data-word');
        this.playLibrarySign(key, lang, word);
      });
    });

    this.signLibraryGrid.querySelectorAll('.card-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-del');
        if (confirm(`Bạn có chắc muốn xóa ký hiệu "${key}"?`)) {
          signLearnerInstance.deleteSign(key);
          this.renderSignLibrary();
          this.updateSignCountBadge();
        }
      });
    });
  }

  playLibrarySign(key, lang, word) {
    this.useDefaultAvatar();
    this.signEngine.stop();
    this.avatar.applyNeutralRestPose();

    const signData = SIGN_LEXICON[key]?.[lang] || SIGN_LEXICON[key]?.asl || {};
    const token = {
      id: `${key}_demo`,
      clipKey: key,
      signLang: lang,
      text: word,
      gloss: signData.gloss || key,
      type: 'SIGN',
      duration: signData.duration || 1000,
      nmm: signData.nmm || { smile: 0.4 },
      desc: signData.desc || `Ký hiệu: ${word}`
    };

    this.subtitleSync.setSpeechSubtitles(word, `Diễn thử: ${signData.gloss || key} (${lang.toUpperCase()})`, lang === 'vsl' ? 'Tiếng Việt' : 'English');
    this.playTokens([token]);
  }
}

// Bootstrap application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  if (import.meta.env.DEV) window.signStudio = app;
});
