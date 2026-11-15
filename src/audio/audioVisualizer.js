// Audio Frequency Spectrum Visualizer
// Renders dynamic pulsing frequency bars on HTML5 Canvas using Web Audio API

export class AudioVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.source = null;
    this.isSimulating = false;
    this.animId = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio || 300;
    this.canvas.height = rect.height * window.devicePixelRatio || 60;
  }

  async startMicStream() {
    this.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;

      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      this.isSimulating = false;
      this.draw();
      return true;
    } catch (err) {
      console.warn('Microphone unavailable:', err);
      this.stop();
      return false;
    }
  }

  startSimulation() {
    this.isSimulating = true;
    this.dataArray = new Uint8Array(32);
    this.draw();
  }

  stop() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
    if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close();
    this.audioContext = null;
    this.analyser = null;
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.isSimulating = false;
  }

  draw() {
    this.animId = requestAnimationFrame(() => this.draw());

    const width = this.canvas.width;
    const height = this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);

    if (this.isSimulating) {
      // Generate rhythmic dancing bars
      const time = performance.now() * 0.005;
      for (let i = 0; i < this.dataArray.length; i++) {
        const val = Math.sin(time + i * 0.35) * 0.5 + 0.5;
        this.dataArray[i] = Math.floor(val * 180 + Math.random() * 40);
      }
    } else if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
    } else {
      return;
    }

    const barCount = 28;
    const barWidth = (width / barCount) * 0.65;
    const spacing = (width / barCount) * 0.35;

    for (let i = 0; i < barCount; i++) {
      const dataIdx = Math.floor((i / barCount) * (this.dataArray.length / 2));
      const value = (this.dataArray[dataIdx] || 10) / 255;
      const barHeight = Math.max(4, value * height * 0.85);

      const x = i * (barWidth + spacing) + spacing / 2;
      const y = (height - barHeight) / 2;

      // Gradient glow
      const grad = this.ctx.createLinearGradient(0, y, 0, y + barHeight);
      grad.addColorStop(0, '#38bdf8'); // Sky blue
      grad.addColorStop(0.5, '#6366f1'); // Indigo
      grad.addColorStop(1, '#a855f7'); // Purple

      this.ctx.fillStyle = grad;
      this.ctx.shadowColor = 'rgba(99, 102, 241, 0.6)';
      this.ctx.shadowBlur = 8;

      // Rounded pill bar
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, barWidth, barHeight, 4);
      this.ctx.fill();
    }
  }
}
