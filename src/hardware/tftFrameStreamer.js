/**
 * TFTFrameStreamer — Trích xuất và truyền avatar 3D Three.js xuống ESP32-S3 + ST7789 TFT
 *
 * Chức năng:
 * - Trích xuất khung hình 3D từ Three.js qua WebGLRenderTarget riêng biệt (320x240).
 * - Sử dụng camera chuyên dụng cho TFT để luôn giữ avatar cân đối (mặt + 2 bàn tay)
 *   bất kể người dùng xoay/zoom camera chính hoặc đổi kích thước cửa sổ trình duyệt.
 * - Nén sang định dạng JPEG với chất lượng tùy chọn (0.5 - 0.7).
 * - Đóng gói các chunk nhị phân với 16-byte fixed header (Magic, Version, FrameID, Chunks).
 * - Cơ chế Backpressure: Chỉ gửi khung hình kế tiếp khi nhận được ACK từ ESP32
 *   (hoặc khi hết hạn timeout). Tự động bỏ qua khung hình cũ (drop frame) để giữ nhịp thực tế.
 * - Báo cáo thống kê: FPS thực tế, kích thước trung bình mỗi frame, tỷ lệ frame bị drop.
 */

import * as THREE from 'three';

export const TFT_HEADER_SIZE = 16;
export const TFT_MAGIC_0 = 0x54; // 'T'
export const TFT_MAGIC_1 = 0x46; // 'F'
export const TFT_PROTOCOL_VERSION = 1;
export const TFT_MSG_FRAME_CHUNK = 1;

export class TFTFrameStreamer {
  /**
   * @param {Object} options
   * @param {import('./esp32Bridge.js').ESP32Bridge} options.bridge — Kết nối WebSocket tới ESP32
   * @param {(stats: Object) => void} [options.onStats] — Nhận thống kê streaming (fps, drop, kb, ms)
   * @param {(msg: string) => void} [options.onError] — Báo lỗi lên UI
   */
  constructor({ bridge, onStats, onError }) {
    this.bridge = bridge;
    this.onStats = onStats;
    this.onError = onError;

    this.enabled = false;
    this.width = 320;
    this.height = 240;
    this.fps = 25; // 25 - 30 FPS mượt mà
    this.quality = 0.45; // 0.40 - 0.50 (tối ưu kích thước ~3.5KB cho 30 FPS)
    this.chunkSize = 16384; // 16KB per chunk (1 chunk duy nhất mỗi frame để loại bỏ độ trễ phân mảnh)

    this.frameId = 1;
    this.lastAckedFrameId = 0;
    this.pendingAck = false;
    this.isEncoding = false;

    this.lastCaptureTime = 0;
    this.lastSentTime = 0;
    this.ackTimeoutMs = 500;

    // Thống kê
    this.sentFramesCount = 0;
    this.droppedFramesCount = 0;
    this.totalBytesSent = 0;
    this.lastStatsTime = performance.now();
    this.fpsHistory = [];
    this.lastRenderMs = 0;

    // Three.js Render Target & Dedicated TFT Camera
    this.tftCamera = new THREE.PerspectiveCamera(34, this.width / this.height, 0.1, 40);
    // Vị trí camera cố định nhìn chính diện phần thân trên và 2 tay avatar
    this.tftCamera.position.set(0, 0.88, 2.75);
    this.tftCamera.lookAt(0, 0.85, 0);

    this.renderTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });

    this.pixelBuffer = new Uint8Array(this.width * this.height * 4);

    // Canvas 2D phục vụ chuyển đổi ImageData sang JPEG blob
    this.offscreenCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.offscreenCanvas) {
      this.offscreenCanvas.width = this.width;
      this.offscreenCanvas.height = this.height;
      this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: false });
      this.imageData = this.offscreenCtx.createImageData(this.width, this.height);
    }

    // Đăng ký nhận phản hồi từ ESP32Bridge
    if (this.bridge) {
      this.bridge.setTftStreamer(this);
    }
  }

  setFPS(fps) {
    this.fps = Math.max(1, Math.min(30, Number(fps) || 25));
  }

  setQuality(quality) {
    this.quality = Math.max(0.3, Math.min(0.9, Number(quality) || 0.45));
  }

  setInvert(invert) {
    if (this.bridge?.connected) {
      this.bridge.send({ type: 'tft_invert', invert: Boolean(invert) });
    }
  }

  setRotation(rotation) {
    if (this.bridge?.connected) {
      this.bridge.send({ type: 'tft_rotation', rotation: Number(rotation) });
    }
  }

  start() {
    if (!this.bridge?.connected) {
      this.onError?.('ESP32 chưa kết nối! Hãy kết nối WiFi/WebSocket trước.');
      return false;
    }

    this.enabled = true;
    this.pendingAck = false;
    this.isEncoding = false;
    this.frameId = 1;
    this.lastAckedFrameId = 0;
    this.sentFramesCount = 0;
    this.droppedFramesCount = 0;
    this.totalBytesSent = 0;
    this.lastCaptureTime = 0;
    this.lastStatsTime = performance.now();
    this.fpsHistory = [];

    // Gửi bản tin điều khiển bắt đầu stream tới ESP32
    this.bridge.send({
      type: 'tft_stream_start',
      fps: this.fps,
      quality: this.quality,
      width: this.width,
      height: this.height,
      chunkSize: this.chunkSize
    });

    this.reportStats('streaming');
    return true;
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    this.pendingAck = false;
    this.isEncoding = false;

    if (this.bridge?.connected) {
      this.bridge.send({ type: 'tft_stream_stop' });
    }

    this.reportStats('stopped');
  }

  /**
   * Gọi từ vòng lặp requestAnimationFrame (main.js)
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   */
  update(renderer, scene) {
    if (!this.enabled || !this.bridge?.connected) return;
    if (!renderer || !scene || !this.offscreenCtx) return;

    const now = performance.now();
    const interval = 1000 / this.fps;

    // 1. Kiểm tra tần suất khung hình (25 - 30 FPS)
    if (now - this.lastCaptureTime < interval) return;

    // 2. Phương án 2 (Pipelining / Drop-old-frame):
    // Không khoá dừng chờ gói ACK từ ESP32. Chỉ drop nếu vòng toBlob canvas trước đó chưa kịp hoàn tất.
    if (this.isEncoding) {
      this.droppedFramesCount++;
      return;
    }

    this.lastCaptureTime = now;
    this.captureAndStreamFrame(renderer, scene);
  }

  /**
   * Chụp khung hình từ Three.js qua WebGLRenderTarget riêng biệt
   */
  captureAndStreamFrame(renderer, scene) {
    this.isEncoding = true;

    try {
      // Lưu lại render target hiện tại của Three.js
      const currentTarget = renderer.getRenderTarget();

      // Render cảnh sang tftCamera và renderTarget 320x240
      renderer.setRenderTarget(this.renderTarget);
      renderer.render(scene, this.tftCamera);
      renderer.readRenderTargetPixels(this.renderTarget, 0, 0, this.width, this.height, this.pixelBuffer);
      renderer.setRenderTarget(currentTarget);

      // Đảo ngược trục Y (WebGL origin ở góc dưới-trái, Canvas 2D ở góc trên-trái)
      const src = this.pixelBuffer;
      const dst = this.imageData.data;
      const rowBytes = this.width * 4;
      const height = this.height;

      for (let y = 0; y < height; y++) {
        const srcOffset = (height - 1 - y) * rowBytes;
        const dstOffset = y * rowBytes;
        dst.set(src.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
      }

      this.offscreenCtx.putImageData(this.imageData, 0, 0);

      // Nén sang JPEG blob
      this.offscreenCanvas.toBlob(async (blob) => {
        if (!blob || !this.enabled || !this.bridge?.connected) {
          this.isEncoding = false;
          return;
        }

        try {
          const arrayBuffer = await blob.arrayBuffer();
          this.sendJpegChunks(arrayBuffer);
        } catch (err) {
          console.warn('[TFT] Lỗi nén/đọc buffer:', err);
        } finally {
          this.isEncoding = false;
        }
      }, 'image/jpeg', this.quality);
    } catch (err) {
      console.warn('[TFT] Lỗi capture:', err);
      this.isEncoding = false;
    }
  }

  /**
   * Đóng gói và gửi các chunk nhị phân qua WebSocket
   * @param {ArrayBuffer} arrayBuffer
   */
  sendJpegChunks(arrayBuffer) {
    const totalSize = arrayBuffer.byteLength;
    if (totalSize === 0 || totalSize > 65536) {
      console.warn('[TFT] Frame quá lớn hoặc rỗng:', totalSize);
      return;
    }

    const frameId = this.frameId++;
    const chunkSize = this.chunkSize;
    const totalChunks = Math.ceil(totalSize / chunkSize);
    const headerSize = TFT_HEADER_SIZE;

    for (let i = 0; i < totalChunks; i++) {
      const offset = i * chunkSize;
      const end = Math.min(offset + chunkSize, totalSize);
      const chunkPayloadLen = end - offset;

      const packet = new Uint8Array(headerSize + chunkPayloadLen);
      const view = new DataView(packet.buffer);

      // Header 16 bytes (Little-Endian)
      view.setUint8(0, TFT_MAGIC_0); // 'T'
      view.setUint8(1, TFT_MAGIC_1); // 'F'
      view.setUint8(2, TFT_PROTOCOL_VERSION); // 1
      view.setUint8(3, TFT_MSG_FRAME_CHUNK); // 1
      view.setUint32(4, frameId, true);
      view.setUint16(8, i, true); // chunkIndex (0..N-1)
      view.setUint16(10, totalChunks, true);
      view.setUint32(12, totalSize, true);

      // Copy phần dữ liệu JPEG
      packet.set(new Uint8Array(arrayBuffer, offset, chunkPayloadLen), headerSize);

      this.bridge.sendBinary(packet.buffer);
    }

    this.pendingAck = false;
    this.lastSentTime = performance.now();
    this.sentFramesCount++;
    this.totalBytesSent += totalSize;

    // Ghi nhận thời điểm để tính FPS gửi
    this.fpsHistory.push(this.lastSentTime);
    if (this.fpsHistory.length > 30) this.fpsHistory.shift();

    this.reportStats('streaming', totalSize);
  }

  /**
   * Xử lý gói ACK nhận từ ESP32 khi đã vẽ xong 1 frame
   */
  handleAck(data) {
    const ackId = Number(data?.frameId);
    if (ackId) {
      this.lastAckedFrameId = ackId;
      this.pendingAck = false;
      this.lastRenderMs = Number(data.renderMs) || 0;
      this.reportStats('streaming');
    }
  }

  handleError(data) {
    console.warn('[TFT] Báo lỗi từ ESP32:', data);
    this.pendingAck = false;
    this.droppedFramesCount++;
    if (data?.error) {
      this.onError?.(`Lỗi TFT ESP32: ${data.error}`);
    }
  }

  handleDisconnected() {
    this.enabled = false;
    this.pendingAck = false;
    this.isEncoding = false;
    this.reportStats('disconnected');
  }

  reportStats(status, lastSize = 0) {
    const now = performance.now();
    // Tính actual FPS dựa trên lịch sử frame gửi
    let actualFps = 0;
    if (this.fpsHistory.length >= 2) {
      const dt = (this.fpsHistory[this.fpsHistory.length - 1] - this.fpsHistory[0]) / 1000;
      if (dt > 0) {
        actualFps = Math.round(((this.fpsHistory.length - 1) / dt) * 10) / 10;
      }
    }

    const avgKb = this.sentFramesCount > 0
      ? Math.round((this.totalBytesSent / this.sentFramesCount / 1024) * 10) / 10
      : 0;

    const stats = {
      status,
      enabled: this.enabled,
      fps: actualFps || (this.enabled ? this.fps : 0),
      targetFps: this.fps,
      dropped: this.droppedFramesCount,
      sent: this.sentFramesCount,
      avgSizeKb: avgKb,
      lastSizeKb: lastSize ? Math.round((lastSize / 1024) * 10) / 10 : avgKb,
      renderMs: this.lastRenderMs
    };

    this.onStats?.(stats);
  }

  dispose() {
    this.stop();
    this.renderTarget?.dispose();
    this.pixelBuffer = null;
    this.offscreenCanvas = null;
  }
}
