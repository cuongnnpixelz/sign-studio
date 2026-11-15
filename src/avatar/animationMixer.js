import * as THREE from 'three';
import { SIGN_CLIPS } from './signClips.js';
import { FINGERSPELL_POSES, spellingLetterDuration, spellingMotion } from './fingerspelling.js';
import { signLearnerInstance } from '../nlp/signLearner.js';

const JOINTS = {
  rShoulder: 'rightShoulder', rElbow: 'rightElbow', rWrist: 'rightWrist',
  lShoulder: 'leftShoulder', lElbow: 'leftElbow', lWrist: 'leftWrist'
};
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const open = Object.fromEntries(FINGERS.map(name => [name, { curl: .03, spread: name === 'thumb' ? .65 : .45 }]));
const cup = Object.fromEntries(FINGERS.map(name => [name, { curl: name === 'thumb' ? .12 : .22, spread: .08 }]));

// Reference gestures map to standard high-fidelity sign clips
const REFERENCES = {
  get HELLO() { return SIGN_CLIPS.HELLO; },
  get HOW() { return SIGN_CLIPS.HOW; }
};

export class SignAnimationEngine {
  constructor(avatar) {
    this.avatar = avatar;
    this.speed = 1;
    this.isPlaying = false;
    this.isPaused = false;
    this.queue = [];
    this.currentToken = null;
    this.currentClipTime = 0;
    this.clipDuration = 1;
    this.totalTokens = 0;
    this.tokenIndex = 0;
    this.animated = Object.values(avatar.bones);
    this.neutral = this.capture();
  }

  capture() {
    return this.animated.map(j => ({ q: j.quaternion.clone(), s: j.scale.clone(), p: j.position.clone() }));
  }

  restore(pose) {
    this.animated.forEach((j, i) => { j.quaternion.copy(pose[i].q); j.scale.copy(pose[i].s); j.position.copy(pose[i].p); });
  }

  blendFrom(pose, amount) {
    this.animated.forEach((j, i) => {
      const target = j.quaternion.clone();
      j.quaternion.slerpQuaternions(pose[i].q, target, amount);
      j.scale.lerpVectors(pose[i].s, j.scale, amount);
      j.position.lerpVectors(pose[i].p, j.position, amount);
    });
  }

  setSpeed(value) { this.speed = Math.max(.25, Math.min(2, value)); }
  togglePause() { if (this.isPlaying) this.isPaused = !this.isPaused; return this.isPaused; }
  get progress() {
    return this.isPlaying ? ((this.tokenIndex - 1) + Math.min(1, this.currentClipTime / this.clipDuration)) / this.totalTokens : 0;
  }

  playSequence(tokens, onTokenChange, onComplete) {
    if (!tokens?.length) return;
    this.queue = [...tokens];
    this.totalTokens = tokens.length;
    this.tokenIndex = 0;
    this.onTokenChange = onTokenChange;
    this.onComplete = onComplete;
    this.isPlaying = true;
    this.isPaused = false;
    this.settle = null;
    this.startNextToken();
  }

  stop(notify = false) {
    this.queue = [];
    this.currentToken = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.settle = { pose: this.capture(), time: 0 };
    this.avatar.applyNeutralRestPose();
    if (notify) this.onComplete?.();
  }

  startNextToken() {
    if (!this.queue.length) {
      this.stop();
      this.onComplete?.();
      return;
    }
    this.sourcePose = this.capture();
    this.currentToken = this.queue.shift();
    this.currentClipTime = 0;
    this.clipDuration = (this.currentToken.duration || 1000) / 1000;
    this.tokenIndex++;

    // 1. Resolve keyframes: Built-in references -> Standard sign clips -> Dynamic Sign Learner / Extended library
    let rawFrames = REFERENCES[this.currentToken.clipKey] ||
                    SIGN_CLIPS[this.currentToken.clipKey] ||
                    signLearnerInstance.resolveFrames(this.currentToken.clipKey, this.currentToken.signLang);

    // If type is SIGN but no pre-recorded frames exist, auto-synthesize procedural gesture
    // NEVER leave frames empty for a SIGN so the avatar never stays frozen in the previous gesture!
    if ((!rawFrames || !rawFrames.length) && this.currentToken.type === 'SIGN') {
      const auto = signLearnerInstance.autoSynthesize(this.currentToken.text || this.currentToken.gloss, this.currentToken.signLang || 'asl');
      if (auto) {
        rawFrames = signLearnerInstance.resolveFrames(auto.key, this.currentToken.signLang);
      }
    }

    // Resolve sparse keyframes once; missing channels hold their prior value.
    let held = {};
    this.frames = (rawFrames || []).map(frame => {
      held = { ...held, ...frame };
      return held;
    });
    this.onTokenChange?.(this.currentToken, this.tokenIndex, this.totalTokens);
  }

  update(delta) {
    if (this.isPaused) return;
    if (!this.isPlaying) {
      this.avatar.setNMM();
      if (this.settle) {
        this.settle.time += delta;
        this.restore(this.neutral);
        this.blendFrom(this.settle.pose, ease(this.settle.time / .38));
        if (this.settle.time >= .38) this.settle = null;
      }
      return;
    }
    this.currentClipTime = Math.min(this.clipDuration, this.currentClipTime + delta * this.speed);
    this.restore(this.neutral);
    if (this.currentToken.type === 'FINGERSPELL') this.updateFingerspelling(this.currentClipTime);
    else this.updateSignClip(this.currentClipTime);
    this.avatar.setNMM(this.currentToken.nmm);
    const entrance = this.currentToken.type === 'FINGERSPELL' ? Math.min(.16, this.spellingTimeline[0].duration * .3) : .24;
    this.blendFrom(this.sourcePose, ease(this.currentClipTime / entrance));
    if (this.currentClipTime >= this.clipDuration) this.startNextToken();
  }

  updateSignClip(time) {
    if (!this.frames.length) return;
    const t = Math.min(1, time / this.clipDuration);
    let a = this.frames[0], b = this.frames.at(-1);
    for (let i = 0; i < this.frames.length - 1; i++) {
      if (t >= this.frames[i].time && t <= this.frames[i + 1].time) {
        a = this.frames[i]; b = this.frames[i + 1]; break;
      }
    }
    const alpha = ease((t - a.time) / Math.max(.001, b.time - a.time));
    for (const [key, name] of Object.entries(JOINTS)) {
      const j = this.avatar.bones[name];
      const start = a[key] || b[key];
      const end = b[key] || start;
      if (!start) continue;
      const qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(start.x ?? 0, start.y ?? 0, start.z ?? 0));
      const qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(end.x ?? 0, end.y ?? 0, end.z ?? 0));
      j.quaternion.slerpQuaternions(qa, qb, alpha);
    }
    for (const [key, side] of [['rHand', 'right'], ['lHand', 'left']]) {
      if (!a[key] && !b[key]) continue;
      const hand = {};
      for (const finger of FINGERS) {
        const pa = a[key]?.[finger] || b[key]?.[finger] || {};
        const pb = b[key]?.[finger] || pa;
        hand[finger] = {
          curl: THREE.MathUtils.lerp(pa.curl ?? .12, pb.curl ?? .12, alpha),
          spread: THREE.MathUtils.lerp(pa.spread ?? 0, pb.spread ?? 0, alpha)
        };
      }
      this.avatar.setHandshape(side, hand);
    }

    // Support procedural/learned IK positions if present
    const ikData = b.ik || a.ik;
    if (ikData) {
      if (ikData.right) {
        const ra = a.ik?.right || ikData.right;
        const rb = b.ik?.right || ra;
        const rx = THREE.MathUtils.lerp(ra[0], rb[0], alpha);
        const ry = THREE.MathUtils.lerp(ra[1], rb[1], alpha);
        const rz = THREE.MathUtils.lerp(ra[2], rb[2], alpha);
        const rw = a.rWrist || b.rWrist || { x: 0, y: 0, z: 0 };
        this.avatar.placeHand('right', [rx, ry, rz], [rw.x ?? 0, rw.y ?? 0, rw.z ?? 0]);
      }
      if (ikData.left) {
        const la = a.ik?.left || ikData.left;
        const lb = b.ik?.left || la;
        const lx = THREE.MathUtils.lerp(la[0], lb[0], alpha);
        const ly = THREE.MathUtils.lerp(la[1], lb[1], alpha);
        const lz = THREE.MathUtils.lerp(la[2], lb[2], alpha);
        const lw = a.lWrist || b.lWrist || { x: 0, y: 0, z: 0 };
        this.avatar.placeHand('left', [lx, ly, lz], [lw.x ?? 0, lw.y ?? 0, lw.z ?? 0]);
      }
    }

    this.placeGesture(this.currentToken.clipKey, t);
  }

  placeGesture(key, t) {
    const pulse = Math.sin(t * Math.PI * 4) * .025;
    const reach = ease(t);
    const hand = (side, target, rotation = [0, 0, 0], elbowHint) => this.avatar.placeHand(side, target, rotation, elbowHint);
    const both = (x, y, z, rotation) => {
      for (const side of ['right', 'left']) {
        const d = side === 'right' ? -1 : 1;
        hand(side, [d * x, y, z], rotation ? [rotation[0], d * rotation[1], d * rotation[2]] : [-.15, 0, 0]);
      }
    };

    // Ensure non-active left arm rests naturally for single-handed gestures
    const singleHanded = ['HELLO', 'FINE', 'FRIDAY', 'THANK_YOU', 'YOU', 'YOUR', 'ME', 'MY', 'UNDERSTAND', 'PLEASE', 'GOODBYE', 'YES', 'NO'];
    if (singleHanded.includes(key)) {
      this.avatar.bones.leftShoulder.rotation.set(.03, 0, .11);
      this.avatar.bones.leftElbow.rotation.set(-.12, 0, 0);
      this.avatar.bones.leftWrist.rotation.set(.05, -.12, 0);
      this.avatar.setHandshape('left', {
        thumb: { curl: 0.15, spread: 0 },
        index: { curl: 0.2 },
        middle: { curl: 0.2 },
        ring: { curl: 0.25 },
        pinky: { curl: 0.25 }
      });
    }

    switch (key) {
      case 'HELLO': {
        const wave = Math.sin(t * Math.PI * 4) * .025;
        hand('right', [-.24 + wave, 1.26, .20], [-.1, 0, wave * 2], [-.38, .95, -.05]);
        break;
      }
      case 'HOW':
        both(.11 + Math.sin(t * Math.PI) * .01, .76, .28, [-.15, -.2 + reach * .4, 0]);
        break;
      case 'TODAY': both(.21, .68 + pulse, .26, [.1, 0, 0]); break;
      case 'FINE': hand('right', [-.12, .86 + pulse, .22], [-.2, 0, 0]); break;
      case 'FRIDAY': hand('right', [-.26, 1.10, .23], [0, Math.sin(t * Math.PI * 2) * .3, 0]); break;
      case 'THANK_YOU': hand('right', [-.04 - reach * .08, 1.12 - reach * .18, .22 + reach * .16], [-.2 - reach * .2, 0, 0]); break;
      case 'YOU': case 'YOUR':
        hand('right', [-.16, .92, .30 + reach * .14], [0, 0, 0]); break;
      case 'ME': case 'MY':
        hand('right', [-.08, .88, .21], [-.2, 0, 0]); break;
      case 'WISH': both(.16, .86 + reach * .04, .23 + reach * .16, [-.1, 0, 0]); break;
      case 'HAPPY': both(.16, .86 + pulse, .23, [-.15, 0, 0]); break;
      case 'NAME': both(.10, .88 + pulse * .3, .28, [-.2, 0, 0]); break;
      case 'WHAT': both(.20 + reach * .06, .81, .28, [-.2, 0, 0]); break;
      case 'UNDERSTAND': hand('right', [-.20, 1.23, .23], [-.1, 0, 0]); break;
      case 'HELP':
        hand('right', [-.03, .82 + reach * .09, .33], [0, 0, 0]);
        hand('left', [.06, .74 + reach * .09, .31], [0, 0, 0]); break;
      case 'LOVE':
        hand('right', [.12, .96, .23], [-.2, 0, 0]);
        hand('left', [-.12, .94, .29], [-.2, 0, 0]); break;
      case 'NICE':
        hand('right', [-.14 + reach * .24, .82, .32], [0, 0, 0]);
        hand('left', [.04, .76, .32], [0, 0, 0]); break;
      case 'MEET': both(.21 - reach * .14, .85, .31, [0, 0, 0]); break;
      case 'PLEASE': hand('right', [-.06 + Math.sin(t * Math.PI * 2) * .045, .87 + Math.cos(t * Math.PI * 2) * .045, .22], [-.2, 0, 0]); break;
      case 'GOODBYE': case 'YES': case 'NO':
        hand('right', [-.26, 1.10 + pulse * .4, .23], [key === 'YES' ? pulse * 3 : 0, 0, 0]); break;
    }
  }

  updateFingerspelling(time) {
    if (this.spellingToken !== this.currentToken || this.spellingClipDuration !== this.clipDuration) this.prepareFingerspelling();
    const timeline = this.spellingTimeline;
    const index = Math.max(0, timeline.findIndex((item, i) => time < item.end || i === timeline.length - 1));
    const item = timeline[index];
    const progress = THREE.MathUtils.clamp((time - item.start) / item.duration, 0, 1);
    const repeated = index > 0 && timeline[index - 1].letter === item.letter && !['J', 'Z'].includes(item.letter);
    const separation = repeated ? .025 * Math.sin(Math.PI * THREE.MathUtils.clamp((progress - .3) / .6, 0, 1)) : 0;
    this.applySpellingLetter(item.letter, progress, separation);
    // The boundary starts exactly at the previous letter's endpoint, including J/Z.
    if (index > 0 && progress < .3) this.blendFrom(timeline[index - 1].endPose, ease(progress / .3));
  }

  prepareFingerspelling() {
    const letters = this.currentToken.letters?.length ? this.currentToken.letters : ['A'];
    const totalWeight = letters.reduce((sum, letter) => sum + spellingLetterDuration(letter), 0);
    const saved = this.capture();
    let start = 0;
    this.spellingTimeline = letters.map(letter => {
      const duration = this.clipDuration * spellingLetterDuration(letter) / totalWeight;
      this.restore(this.neutral);
      this.applySpellingLetter(letter, 1);
      const item = { letter, start, end: start + duration, duration, endPose: this.capture() };
      start += duration;
      return item;
    });
    this.restore(saved);
    this.spellingToken = this.currentToken;
    this.spellingClipDuration = this.clipDuration;
  }

  applySpellingLetter(letter, progress, separation = 0) {
    this.avatar.bones.rightShoulder.rotation.set(-.08, 0, -.55);
    this.avatar.bones.rightElbow.rotation.set(-.25, 0, -2.25);
    const pose = FINGERSPELL_POSES[letter] || FINGERSPELL_POSES.A;
    const { wrist, ...hand } = pose;
    const { rightShoulder: shoulder, rightElbow: elbow, rightWrist: handBone } = this.avatar.bones;
    // Keep the established palm orientation, then apply all three authored offsets.
    const orientation = shoulder.quaternion.clone().multiply(elbow.quaternion)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(wrist?.x ?? 0, wrist?.y ?? 0, wrist?.z ?? 0)));
    const offset = spellingMotion(letter, progress);
    this.avatar.placeHand('right', [-.30 + offset[0] - separation, 1.06 + offset[1], .25 + offset[2]]);
    // Compensate for the IK forearm rotation: tracing must not rotate the handshape.
    handBone.quaternion.copy(shoulder.quaternion).multiply(elbow.quaternion).invert().multiply(orientation);
    this.avatar.setHandshape('right', hand);

    // CRITICAL FIX: Left arm and hand must stay cleanly in resting neutral pose!
    // Prevents leftover floating arms from previous gestures!
    this.avatar.bones.leftShoulder.rotation.set(.03, 0, .11);
    this.avatar.bones.leftElbow.rotation.set(-.12, 0, 0);
    this.avatar.bones.leftWrist.rotation.set(.05, -.12, 0);
    this.avatar.setHandshape('left', {
      thumb: { curl: 0.15, spread: 0 },
      index: { curl: 0.2 },
      middle: { curl: 0.2 },
      ring: { curl: 0.25 },
      pinky: { curl: 0.25 }
    });
  }
}
