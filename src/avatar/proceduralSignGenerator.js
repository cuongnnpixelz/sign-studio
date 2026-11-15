// Procedural Sign Generator for ASL & VSL
// Generates anatomically correct 3D keyframes for signs dynamically
// Supports handshapes, locations, motions, and Non-Manual Markers (NMM)

export const HANDSHAPES = {
  flat: { index: { curl: 0.0 }, middle: { curl: 0.0 }, ring: { curl: 0.0 }, pinky: { curl: 0.0 }, thumb: { curl: 0.1, spread: 0.4 } },
  fist: { index: { curl: 0.95 }, middle: { curl: 0.95 }, ring: { curl: 0.95 }, pinky: { curl: 0.95 }, thumb: { curl: 0.8, spread: 0.0 } },
  point: { index: { curl: 0.05 }, middle: { curl: 0.95 }, ring: { curl: 0.95 }, pinky: { curl: 0.95 }, thumb: { curl: 0.7, spread: -0.1 } },
  cup: { index: { curl: 0.45 }, middle: { curl: 0.45 }, ring: { curl: 0.45 }, pinky: { curl: 0.45 }, thumb: { curl: 0.4, spread: 0.5 } },
  pinch: { index: { curl: 0.7 }, middle: { curl: 0.7 }, ring: { curl: 0.7 }, pinky: { curl: 0.7 }, thumb: { curl: 0.7, spread: 0.2 } },
  peace: { index: { curl: 0.05 }, middle: { curl: 0.05 }, ring: { curl: 0.95 }, pinky: { curl: 0.95 }, thumb: { curl: 0.7, spread: 0.1 } },
  thumbsUp: { index: { curl: 0.95 }, middle: { curl: 0.95 }, ring: { curl: 0.95 }, pinky: { curl: 0.95 }, thumb: { curl: 0.0, spread: 0.8 } },
  yShape: { index: { curl: 0.95 }, middle: { curl: 0.95 }, ring: { curl: 0.95 }, pinky: { curl: 0.0 }, thumb: { curl: 0.0, spread: 0.85 } },
  cShape: { index: { curl: 0.4 }, middle: { curl: 0.4 }, ring: { curl: 0.4 }, pinky: { curl: 0.4 }, thumb: { curl: 0.3, spread: 0.6 } },
  hShape: { index: { curl: 0.05 }, middle: { curl: 0.05 }, ring: { curl: 0.95 }, pinky: { curl: 0.95 }, thumb: { curl: 0.7, spread: -0.1 } }
};

export const MOTION_TYPES = [
  { id: 'tap', name: 'Chạm nhẹ (Tap 2 lần)', desc: 'Chạm vào vị trí 2 lần (Ăn, Biết, Nghĩ, Mẹ, Bố)' },
  { id: 'wave', name: 'Vẫy tay (Wave)', desc: 'Vẫy tay qua lại (Xin chào, Tạm biệt)' },
  { id: 'push', name: 'Đẩy ra trước (Push)', desc: 'Đưa tay từ ngực/mặt ra trước (Cảm ơn, Đi, Cho)' },
  { id: 'pull', name: 'Kéo về mình (Pull)', desc: 'Kéo tay về ngực (Muốn, Lấy, Của tôi)' },
  { id: 'rotate', name: 'Xoay tròn (Rotate)', desc: 'Xoay tròn nhẹ trước ngực hoặc trán (Làm ơn, Học)' },
  { id: 'cross', name: 'Bắt chéo ôm ngực (Cross)', desc: 'Hai tay bắt chéo trước ngực (Yêu, Dừng)' },
  { id: 'brush', name: 'Vuốt lên (Brush up)', desc: 'Hai tay vuốt nhẹ lên ngực (Vui vẻ, Khỏe)' },
  { id: 'nod', name: 'Gật tay (Nod)', desc: 'Cổ tay gật lên xuống (Đúng, Có)' },
  { id: 'shake', name: 'Lắc tay (Shake)', desc: 'Lắc tay qua lại (Không, Ở đâu, Cái gì)' },
  { id: 'sCurve', name: 'Vẽ chữ S (S-curve)', desc: 'Vẽ hình chữ S trước ngực (Việt Nam)' },
  { id: 'openClose', name: 'Mở hai tay (Open)', desc: 'Hai tay chụm rồi mở rộng (Sách, Nhà, Chào mừng)' }
];

export const LOCATIONS = {
  chest: { name: 'Trước ngực', rTarget: [-.12, .88, .22], lTarget: [.12, .88, .22] },
  chin: { name: 'Cằm', rTarget: [-.02, 1.15, .22], lTarget: [.02, 1.15, .22] },
  mouth: { name: 'Miệng', rTarget: [-.02, 1.18, .22], lTarget: [.02, 1.18, .22] },
  forehead: { name: 'Trán / Thái dương', rTarget: [-.20, 1.25, .22], lTarget: [.20, 1.25, .22] },
  front: { name: 'Phía trước mặt', rTarget: [-.18, .92, .32], lTarget: [.18, .92, .32] },
  waist: { name: 'Ngang eo', rTarget: [-.14, .74, .25], lTarget: [.14, .74, .25] }
};

/**
 * Procedurally generates keyframes for a sign gesture
 * @param {Object} options
 * @param {string} options.handshape - 'flat', 'fist', 'point', 'cup', 'pinch', 'peace', 'thumbsUp', 'yShape', 'cShape', 'hShape'
 * @param {string} options.location - 'chest', 'chin', 'mouth', 'forehead', 'front', 'waist'
 * @param {string} options.motion - 'tap', 'wave', 'push', 'pull', 'rotate', 'cross', 'brush', 'nod', 'shake', 'sCurve', 'openClose'
 * @param {boolean} options.twoHanded - whether both hands move
 * @param {Object} options.nmm - Non-Manual Markers (smile, eyebrows, headTilt, headNod, headShake)
 * @returns {Array<Object>} Generated keyframes
 */
export function generateProceduralKeyframes(options = {}) {
  const handshapeName = options.handshape || 'flat';
  const locName = options.location || 'chest';
  const motionName = options.motion || 'push';
  const twoHanded = !!options.twoHanded;
  const nmm = options.nmm || { smile: 0.4 };

  const handPose = HANDSHAPES[handshapeName] || HANDSHAPES.flat;
  const loc = LOCATIONS[locName] || LOCATIONS.chest;

  const baseHandR = { ...handPose };
  const baseHandL = twoHanded ? { ...handPose } : undefined;

  // Base IK points
  const [rx, ry, rz] = loc.rTarget;
  const [lx, ly, lz] = loc.lTarget;

  const frames = [];

  switch (motionName) {
    case 'tap': {
      // 2 taps toward location (e.g. eat, think, know)
      frames.push(
        { time: 0.0, rShoulder: { x: 0.3, y: -0.1, z: 0.2 }, rElbow: { x: -1.2, y: 0.2, z: -0.2 }, rWrist: { x: 0, y: 0, z: 0 }, rHand: baseHandR, ik: { right: [rx, ry, rz - 0.08] } },
        { time: 0.35, rShoulder: { x: 0.45, y: -0.2, z: 0.25 }, rElbow: { x: -1.5, y: 0.3, z: -0.1 }, rWrist: { x: 0.3, y: 0, z: 0 }, ik: { right: [rx, ry, rz] }, nmm },
        { time: 0.55, rElbow: { x: -1.3, y: 0.2, z: -0.2 }, ik: { right: [rx, ry, rz - 0.06] } },
        { time: 0.8, rElbow: { x: -1.5, y: 0.3, z: -0.1 }, rWrist: { x: 0.3, y: 0, z: 0 }, ik: { right: [rx, ry, rz] }, nmm },
        { time: 1.0, rShoulder: { x: 0.35, y: -0.1, z: 0.2 }, rElbow: { x: -1.2, y: 0.2, z: -0.2 }, rWrist: { x: 0, y: 0, z: 0 }, ik: { right: [rx, ry, rz - 0.05] } }
      );
      break;
    }
    case 'wave': {
      // Wave side to side
      frames.push(
        { time: 0.0, rShoulder: { x: 0.6, y: 0.2, z: 0.5 }, rElbow: { x: -1.5, y: 0.3, z: -0.6 }, rWrist: { x: 0.1, y: 0.2, z: 0.0 }, rHand: baseHandR, ik: { right: [rx, ry + 0.1, rz] } },
        { time: 0.35, rWrist: { x: 0.2, y: 0.45, z: -0.2 }, ik: { right: [rx - 0.05, ry + 0.12, rz] }, nmm },
        { time: 0.7, rWrist: { x: -0.1, y: -0.1, z: 0.2 }, ik: { right: [rx + 0.05, ry + 0.1, rz] }, nmm },
        { time: 1.0, rWrist: { x: 0.1, y: 0.2, z: 0.0 }, ik: { right: [rx, ry + 0.1, rz] } }
      );
      break;
    }
    case 'push': {
      // Push outward forward (thank you, give, go)
      frames.push(
        { time: 0.0, rShoulder: { x: 0.3, y: -0.1, z: 0.2 }, rElbow: { x: -1.6, y: 0.2, z: -0.2 }, rWrist: { x: 0.3, y: -0.1, z: 0.1 }, rHand: baseHandR, ik: { right: [rx, ry, rz] } },
        { time: 0.6, rShoulder: { x: 0.5, y: 0.0, z: 0.2 }, rElbow: { x: -1.0, y: 0.1, z: 0.0 }, rWrist: { x: -0.1, y: 0.1, z: 0.0 }, ik: { right: [rx, ry - 0.06, rz + 0.16] }, nmm },
        { time: 1.0, rShoulder: { x: 0.4, y: 0.0, z: 0.2 }, rElbow: { x: -0.9, y: 0.1, z: -0.1 }, rWrist: { x: 0.0, y: 0.0, z: 0.0 }, ik: { right: [rx, ry - 0.04, rz + 0.12] } }
      );
      break;
    }
    case 'pull': {
      // Pull toward body (want, come, my)
      frames.push(
        { time: 0.0, rShoulder: { x: 0.5, y: 0.0, z: 0.2 }, rElbow: { x: -0.9, y: 0.1, z: 0.0 }, rWrist: { x: -0.2, y: 0.1, z: 0 }, rHand: baseHandR, ik: { right: [rx, ry, rz + 0.16] } },
        { time: 0.6, rShoulder: { x: 0.3, y: -0.2, z: 0.25 }, rElbow: { x: -1.7, y: 0.2, z: -0.2 }, rWrist: { x: 0.4, y: -0.2, z: 0.1 }, ik: { right: [rx, ry, rz] }, nmm },
        { time: 1.0, rShoulder: { x: 0.28, y: -0.15, z: 0.2 }, rElbow: { x: -1.5, y: 0.2, z: -0.2 }, ik: { right: [rx, ry, rz + 0.02] } }
      );
      break;
    }
    case 'rotate': {
      // Rotate circular motion
      frames.push(
        { time: 0.0, rShoulder: { x: 0.4, y: -0.1, z: 0.25 }, rElbow: { x: -1.4, y: 0.2, z: -0.2 }, rWrist: { x: 0.1, y: 0, z: 0 }, rHand: baseHandR, ik: { right: [rx, ry, rz] } },
        { time: 0.35, rWrist: { x: 0.3, y: 0.2, z: -0.1 }, ik: { right: [rx + 0.04, ry + 0.04, rz] }, nmm },
        { time: 0.7, rWrist: { x: -0.1, y: -0.2, z: 0.1 }, ik: { right: [rx - 0.04, ry - 0.04, rz] }, nmm },
        { time: 1.0, rWrist: { x: 0.1, y: 0, z: 0 }, ik: { right: [rx, ry, rz] } }
      );
      break;
    }
    case 'cross': {
      // Two arms crossing over chest (love, stop)
      frames.push(
        { time: 0.0, rShoulder: { x: 0.2, y: 0, z: 0.2 }, lShoulder: { x: 0.2, y: 0, z: -0.2 }, rHand: baseHandR, lHand: baseHandL },
        { time: 0.5, rShoulder: { x: 0.5, y: -0.4, z: 0.45 }, lShoulder: { x: 0.5, y: 0.4, z: -0.45 }, rElbow: { x: -1.9, y: -0.2, z: 0.2 }, lElbow: { x: -1.9, y: 0.2, z: -0.2 }, ik: { right: [.10, .95, .24], left: [-.10, .93, .28] }, nmm },
        { time: 1.0, rShoulder: { x: 0.45, y: -0.3, z: 0.4 }, lShoulder: { x: 0.45, y: 0.3, z: -0.4 }, ik: { right: [.10, .95, .24], left: [-.10, .93, .28] } }
      );
      return frames;
    }
    case 'brush': {
      // Brush upward twice on chest (happy, fine)
      frames.push(
        { time: 0.0, rShoulder: { x: 0.3, y: -0.1, z: 0.2 }, lShoulder: { x: 0.3, y: 0.1, z: -0.2 }, rHand: baseHandR, lHand: baseHandL, ik: { right: [rx, ry - 0.06, rz], left: [lx, ly - 0.06, lz] } },
        { time: 0.4, rElbow: { x: -1.6, y: 0.1, z: -0.1 }, lElbow: { x: -1.6, y: -0.1, z: 0.1 }, ik: { right: [rx, ry + 0.05, rz], left: [lx, ly + 0.05, lz] }, nmm },
        { time: 0.65, ik: { right: [rx, ry - 0.04, rz], left: [lx, ly - 0.04, lz] } },
        { time: 0.88, ik: { right: [rx, ry + 0.05, rz], left: [lx, ly + 0.05, lz] }, nmm },
        { time: 1.0, ik: { right: [rx, ry, rz], left: [lx, ly, lz] } }
      );
      return frames;
    }
    case 'sCurve': {
      // Vietnam 'S' shape gesture: draws curve from upper right to middle to lower chest
      frames.push(
        { time: 0.0, rShoulder: { x: 0.45, y: 0.1, z: 0.3 }, rElbow: { x: -1.4, y: 0.2, z: -0.2 }, rWrist: { x: 0, y: 0, z: 0 }, rHand: baseHandR, ik: { right: [-.18, 1.05, .26] } },
        { time: 0.3, ik: { right: [-.10, .98, .27] }, nmm },
        { time: 0.6, ik: { right: [-.20, .88, .27] }, nmm },
        { time: 0.85, ik: { right: [-.12, .76, .26] }, nmm },
        { time: 1.0, ik: { right: [-.14, .76, .26] } }
      );
      break;
    }
    case 'openClose': {
      // Both hands together then open out (book, house, door)
      frames.push(
        { time: 0.0, rShoulder: { x: 0.3, y: 0, z: 0.2 }, lShoulder: { x: 0.3, y: 0, z: -0.2 }, rHand: baseHandR, lHand: baseHandL, ik: { right: [-.04, .88, .30], left: [.04, .88, .30] } },
        { time: 0.55, rWrist: { x: 0.2, y: 0.4, z: -0.2 }, lWrist: { x: 0.2, y: -0.4, z: 0.2 }, ik: { right: [-.24, .88, .30], left: [.24, .88, .30] }, nmm },
        { time: 1.0, ik: { right: [-.22, .88, .30], left: [.22, .88, .30] } }
      );
      return frames;
    }
    case 'nod': {
      // Up and down wrist nod (yes)
      frames.push(
        { time: 0.0, rShoulder: { x: 0.4, y: 0, z: 0.2 }, rElbow: { x: -1.2, y: 0.1, z: -0.2 }, rHand: baseHandR, ik: { right: [rx, ry, rz] } },
        { time: 0.35, rWrist: { x: 0.5, y: 0, z: 0 }, ik: { right: [rx, ry - 0.04, rz] }, nmm },
        { time: 0.65, rWrist: { x: -0.1, y: 0, z: 0 }, ik: { right: [rx, ry + 0.02, rz] } },
        { time: 0.85, rWrist: { x: 0.5, y: 0, z: 0 }, ik: { right: [rx, ry - 0.04, rz] }, nmm },
        { time: 1.0, rWrist: { x: 0, y: 0, z: 0 }, ik: { right: [rx, ry, rz] } }
      );
      break;
    }
    case 'shake': {
      // Side to side horizontal shake (no, what, where)
      frames.push(
        { time: 0.0, rShoulder: { x: 0.35, y: 0, z: 0.2 }, rElbow: { x: -1.2, y: 0.2, z: -0.2 }, rHand: baseHandR, ik: { right: [rx, ry, rz] } },
        { time: 0.3, rWrist: { x: 0.1, y: 0.3, z: -0.2 }, ik: { right: [rx - 0.05, ry, rz] }, nmm },
        { time: 0.65, rWrist: { x: -0.1, y: -0.3, z: 0.2 }, ik: { right: [rx + 0.05, ry, rz] }, nmm },
        { time: 1.0, rWrist: { x: 0, y: 0, z: 0 }, ik: { right: [rx, ry, rz] } }
      );
      break;
    }
    default: {
      frames.push(
        { time: 0.0, rShoulder: { x: 0.3, y: 0, z: 0.2 }, rElbow: { x: -1.2, y: 0.1, z: -0.2 }, rHand: baseHandR, ik: { right: [rx, ry, rz] } },
        { time: 0.5, rWrist: { x: 0.2, y: 0, z: 0 }, ik: { right: [rx, ry + 0.05, rz + 0.05] }, nmm },
        { time: 1.0, rWrist: { x: 0, y: 0, z: 0 }, ik: { right: [rx, ry, rz] } }
      );
    }
  }

  // If two-handed, mirror right side to left side where not already set
  if (twoHanded) {
    frames.forEach(f => {
      if (!f.lShoulder && f.rShoulder) {
        f.lShoulder = { x: f.rShoulder.x, y: -f.rShoulder.y, z: -f.rShoulder.z };
      }
      if (!f.lElbow && f.rElbow) {
        f.lElbow = { x: f.rElbow.x, y: -f.rElbow.y, z: -f.rElbow.z };
      }
      if (!f.lWrist && f.rWrist) {
        f.lWrist = { x: f.rWrist.x, y: -f.rWrist.y, z: -f.rWrist.z };
      }
      if (!f.lHand) {
        f.lHand = baseHandL;
      }
      if (f.ik && f.ik.right && !f.ik.left) {
        f.ik.left = [-f.ik.right[0], f.ik.right[1], f.ik.right[2]];
      }
    });
  }

  return frames;
}
