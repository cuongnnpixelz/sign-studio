// Illustrative fingerspelling poses. Language accuracy needs signer validation.
// Wrist angles are offsets from the common spelling orientation.

/**
 * Finger angles represent normalized curl:
 * 0.0 = fully straight / extended
 * 1.0 = fully curled / closed into palm
 * spread: lateral abduction/adduction
 */

export const FINGERSPELL_POSES = {
  // A: Fist with thumb straight up alongside index
  A: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.1, spread: 0.1 },
    index: { curl: 0.95 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // B: Flat hand, 4 fingers straight up, thumb tucked across palm
  B: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.85, spread: -0.4 },
    index: { curl: 0.05 },
    middle: { curl: 0.05 },
    ring: { curl: 0.05 },
    pinky: { curl: 0.05 }
  },
  // C: All fingers and thumb curved like a C
  C: {
    wrist: { x: 0.1, y: 0.3, z: 0 },
    thumb: { curl: 0.4, spread: 0.5 },
    index: { curl: 0.45 },
    middle: { curl: 0.45 },
    ring: { curl: 0.45 },
    pinky: { curl: 0.45 }
  },
  // D: Index straight up, thumb touching middle/ring/pinky tips
  D: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.6, spread: 0.2 },
    index: { curl: 0.0 },
    middle: { curl: 0.75 },
    ring: { curl: 0.8 },
    pinky: { curl: 0.85 }
  },
  // E: All fingers curled, fingertips touching thumb
  E: {
    wrist: { x: 0.1, y: 0, z: 0 },
    thumb: { curl: 0.8, spread: -0.2 },
    index: { curl: 0.85 },
    middle: { curl: 0.85 },
    ring: { curl: 0.85 },
    pinky: { curl: 0.85 }
  },
  // F: Index touches thumb (circle), other 3 fingers straight
  F: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.5, spread: 0.1 },
    index: { curl: 0.6 },
    middle: { curl: 0.05 },
    ring: { curl: 0.05 },
    pinky: { curl: 0.05 }
  },
  // G: Index and thumb pointing horizontally forward, others closed
  G: {
    wrist: { x: 0, y: 0.3, z: 1.5 },
    thumb: { curl: 0.1, spread: 0.3 },
    index: { curl: 0.1 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // H: Index and middle extended horizontally forward, thumb tucked
  H: {
    wrist: { x: 0, y: 0.3, z: 1.5 },
    thumb: { curl: 0.6, spread: 0.0 },
    index: { curl: 0.05 },
    middle: { curl: 0.05 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // I: Pinky straight up, other fingers in a fist
  I: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.85, spread: -0.2 },
    index: { curl: 0.95 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.0 }
  },
  // J: Pinky up tracing a J curve (wrist rotates)
  J: {
    wrist: { x: 0.2, y: -0.4, z: 0.3 },
    thumb: { curl: 0.85, spread: -0.2 },
    index: { curl: 0.95 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.0 }
  },
  // K: Index straight up, middle forward at angle, thumb between them
  K: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.2, spread: 0.3 },
    index: { curl: 0.0 },
    middle: { curl: 0.4 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // L: Index up, thumb out at 90 degrees (L shape)
  L: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.0, spread: 0.8 },
    index: { curl: 0.0 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // M: Thumb tucked under index, middle, ring fingers
  M: {
    wrist: { x: 0.2, y: 0, z: 0 },
    thumb: { curl: 0.9, spread: -0.4 },
    index: { curl: 0.8 },
    middle: { curl: 0.8 },
    ring: { curl: 0.8 },
    pinky: { curl: 0.95 }
  },
  // N: Thumb tucked under index and middle fingers
  N: {
    wrist: { x: 0.2, y: 0, z: 0 },
    thumb: { curl: 0.9, spread: -0.2 },
    index: { curl: 0.8 },
    middle: { curl: 0.8 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // O: All fingertips touching thumb forming an O
  O: {
    wrist: { x: 0.1, y: 0.2, z: 0 },
    thumb: { curl: 0.5, spread: 0.3 },
    index: { curl: 0.65 },
    middle: { curl: 0.65 },
    ring: { curl: 0.65 },
    pinky: { curl: 0.65 }
  },
  // P: Downward pointing K handshape
  P: {
    wrist: { x: 0.2, y: 0.1, z: 2.7 },
    thumb: { curl: 0.2, spread: 0.3 },
    index: { curl: 0.1 },
    middle: { curl: 0.5 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // Q: Downward pointing G handshape
  Q: {
    wrist: { x: 0.2, y: 0.2, z: 2.7 },
    thumb: { curl: 0.1, spread: 0.3 },
    index: { curl: 0.1 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // R: Index and middle fingers crossed, others curled
  R: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.85, spread: -0.2 },
    index: { baseCurl: 0.16, midCurl: 0.03, tipCurl: 0.02, splay: -0.22 },
    middle: { baseCurl: -0.06, midCurl: 0.05, tipCurl: 0.02, splay: 0.20 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // S: Fist with thumb folded across front of fingers
  S: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.85, spread: 0.0 },
    index: { curl: 0.95 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // T: Thumb tucked between index and middle
  T: {
    wrist: { x: 0.1, y: 0, z: 0 },
    thumb: { curl: 0.85, spread: 0.1 },
    index: { curl: 0.75 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // U: Index and middle straight together, thumb folded
  U: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.85, spread: -0.3 },
    index: { curl: 0.05, splay: 0 },
    middle: { curl: 0.05, splay: 0 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // V: Peace / Victory sign (Index and middle spread apart)
  V: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.85, spread: -0.3 },
    index: { curl: 0.05, splay: 0.24 },
    middle: { curl: 0.05, splay: -0.16 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // W: Three fingers up (Index, Middle, Ring)
  W: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.85, spread: -0.3 },
    index: { curl: 0.05 },
    middle: { curl: 0.05 },
    ring: { curl: 0.05 },
    pinky: { curl: 0.95 }
  },
  // X: Index finger hooked / bent like a hook
  X: {
    wrist: { x: 0, y: 0.1, z: 0 },
    thumb: { curl: 0.85, spread: 0.0 },
    index: { baseCurl: 0.12, midCurl: 1.25, tipCurl: 0.65 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // Y: 'Hang loose' (Thumb and pinky extended, middle 3 curled)
  Y: {
    wrist: { x: 0, y: 0, z: 0 },
    thumb: { curl: 0.0, spread: 0.9 },
    index: { curl: 0.95 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.0 }
  },
  // Z: Index finger tracing a Z in the air
  Z: {
    wrist: { x: -0.2, y: 0.2, z: 0 },
    thumb: { curl: 0.85, spread: -0.2 },
    index: { curl: 0.05 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  // --- VIETNAMESE MANUAL ALPHABET (VSL) SPECIAL LETTERS ---
  'Ă': {
    wrist: { x: 0.15, y: 0, z: 0.05 },
    thumb: { curl: 0.1, spread: 0.2 },
    index: { curl: 0.95 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  'Â': {
    wrist: { x: -0.15, y: 0, z: 0.08 },
    thumb: { curl: 0.1, spread: 0.15 },
    index: { curl: 0.95 },
    middle: { curl: 0.95 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.95 }
  },
  'Đ': {
    wrist: { x: 0, y: 0.2, z: -0.15 },
    thumb: { curl: 0.6, spread: 0.2 },
    index: { curl: 0.0 },
    middle: { curl: 0.75 },
    ring: { curl: 0.8 },
    pinky: { curl: 0.85 }
  },
  'Ê': {
    wrist: { x: -0.12, y: 0, z: 0.08 },
    thumb: { curl: 0.8, spread: -0.2 },
    index: { curl: 0.85 },
    middle: { curl: 0.85 },
    ring: { curl: 0.85 },
    pinky: { curl: 0.85 }
  },
  'Ô': {
    wrist: { x: -0.15, y: 0, z: 0.08 },
    thumb: { curl: 0.45, spread: 0.3 },
    index: { curl: 0.5 },
    middle: { curl: 0.5 },
    ring: { curl: 0.5 },
    pinky: { curl: 0.5 }
  },
  'Ơ': {
    wrist: { x: 0.12, y: 0.15, z: 0.1 },
    thumb: { curl: 0.45, spread: 0.4 },
    index: { curl: 0.5 },
    middle: { curl: 0.5 },
    ring: { curl: 0.5 },
    pinky: { curl: 0.3 }
  },
  'Ư': {
    wrist: { x: 0.12, y: 0.15, z: 0.1 },
    thumb: { curl: 0.85, spread: -0.3 },
    index: { curl: 0.05 },
    middle: { curl: 0.05 },
    ring: { curl: 0.95 },
    pinky: { curl: 0.3 }
  }
};

// Preserve Vietnamese letters while removing only tone marks. ASL uses A-Z.
export function spellingLetters(text, signLang = 'asl') {
  let value = text.normalize('NFD');
  if (signLang === 'vsl') {
    value = value.replace(/[\u0300\u0301\u0303\u0309\u0323]/g, '').normalize('NFC').toUpperCase();
    return [...value].filter(letter => /^[A-ZĂÂĐÊÔƠƯ]$/.test(letter));
  }
  return [...value.replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'D').toUpperCase()].filter(letter => /^[A-Z]$/.test(letter));
}

export const spellingLetterDuration = letter => ['J', 'Z'].includes(letter) ? 650 : 350;
export const spellingDuration = letters => Math.max(800, letters.reduce((sum, letter) => sum + spellingLetterDuration(letter), 0));

// Offsets in the avatar's signing plane, from the signer's perspective.
// Each stroke has its own segment; eased joins keep the tracing continuous.
const LETTER_PATHS = {
  J: [[0, 0, 0], [0, -.07, 0], [.015, -.105, 0], [.05, -.11, 0], [.075, -.085, 0]],
  Z: [[0, 0, 0], [-.09, 0, 0], [0, -.085, 0], [-.09, -.085, 0]]
};

export function spellingMotion(letter, progress) {
  const points = LETTER_PATHS[letter];
  if (!points) return [0, 0, 0];
  // Reserve the first 30% for forming the hand, then trace and hold the endpoint.
  const t = Math.max(0, Math.min(1, (progress - .3) / .6)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(t));
  const fraction = t - index;
  const blend = fraction * fraction * (3 - 2 * fraction);
  return points[index].map((value, axis) => value + (points[index + 1][axis] - value) * blend);
}
