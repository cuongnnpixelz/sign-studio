import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AvatarModel } from '../src/avatar/avatarModel.js';
import { SignAnimationEngine } from '../src/avatar/animationMixer.js';
import { SIGN_CLIPS } from '../src/avatar/signClips.js';
import { translateSpeech } from '../src/nlp/translator.js';
import { convertTextToGloss } from '../src/nlp/textToGloss.js';
import { SIGN_LEXICON, SYNONYM_MAP } from '../src/nlp/signDictionary.js';
import { signLearnerInstance, BUILTIN_EXTENDED_SIGNS } from '../src/nlp/signLearner.js';
import { generateProceduralKeyframes } from '../src/avatar/proceduralSignGenerator.js';

console.log('--- Testing Sign Learner and Gesture Engine ---');

// 1. Test Procedural Sign Generator
const frames = generateProceduralKeyframes({
  handshape: 'pinch',
  location: 'mouth',
  motion: 'tap',
  twoHanded: false,
  nmm: { smile: 0.5 }
});
assert(Array.isArray(frames) && frames.length >= 3, 'Procedural keyframes must be generated');
assert.equal(frames[0].time, 0.0);
assert.equal(frames.at(-1).time, 1.0);
console.log('✓ Procedural Sign Generator creates valid keyframes');

// 2. Test Sign Learner registration & resolution
const custom = signLearnerInstance.teachSign({
  word: 'trà sữa',
  signLang: 'vsl',
  desc: 'Cử chỉ uống trà sữa',
  handshape: 'cup',
  location: 'mouth',
  motion: 'push',
  twoHanded: false
});
assert.equal(custom.key, 'TRÀ_SỮA');
const resolvedFrames = signLearnerInstance.resolveFrames('TRÀ_SỮA', 'vsl');
assert(Array.isArray(resolvedFrames) && resolvedFrames.length > 0, 'Learned sign must resolve keyframes');
console.log('✓ Sign Learner teaches, saves, and resolves new signs');

// 3. Test AI Auto-Synthesis
const synthesized = signLearnerInstance.autoSynthesize('con mèo');
assert(synthesized && synthesized.config, 'Auto-synthesis must return sign config');
console.log('✓ AI Auto-Synthesis generates plausible parameters for unknown words');

// 4. Test Translation Engine with expanded Vietnamese vocabulary
const trans1 = translateSpeech('Tôi muốn ăn cơm', 'vi');
assert.equal(trans1.translated, 'i want eat food', 'Translates expanded daily verbs correctly');

const trans2 = translateSpeech('bác sĩ ở đâu', 'vi');
assert.equal(trans2.translated, 'doctor where', 'Translates question and role correctly');

const trans3 = translateSpeech('chào bạn hôm nay tôi mệt', 'vi');
assert.equal(trans3.translated, 'hello you today i tired', 'Translates mixed greeting and state cleanly');
console.log('✓ Translation Engine handles expanded phrases and prevents tone collisions');

// 5. Test Text-To-Gloss: ASL & VSL resolution
const vslResult = convertTextToGloss('Tôi muốn ăn cơm', 'vsl');
assert(vslResult.tokens.length > 0, 'Must produce gloss tokens');
const eatToken = vslResult.tokens.find(t => t.clipKey === 'EAT');
assert(eatToken, 'EAT must be recognized as a sign gesture');
assert.equal(eatToken.type, 'SIGN');
assert.equal(eatToken.signLang, 'vsl');
console.log('✓ Text-To-Gloss maps extended gestures for VSL');

// 6. Test Unfamiliar Word: Fingerspelling without lingering gestures
const unknownResult = convertTextToGloss('tê giác Alex', 'vsl');
assert.equal(unknownResult.tokens[0].type, 'FINGERSPELL');
assert.deepEqual(unknownResult.tokens[0].letters, ['T', 'Ê'], 'VSL preserves the letter Ê');
assert.deepEqual(unknownResult.tokens[1].letters, ['G', 'I', 'A', 'C'], 'Word 2 with diacritics normalized cleanly');
console.log('✓ Unfamiliar words produce clean fingerspelling without dropping characters');

// 7. Test 3D Avatar Animation Mixer & Left Hand Rest Reset
const scene = new THREE.Scene();
const avatar = new AvatarModel(scene);
const engine = new SignAnimationEngine(avatar);

// Play a 2-handed gesture (HOW) first
engine.playSequence([
  { id: '1', clipKey: 'HOW', type: 'SIGN', duration: 1000 },
  { id: '2', clipKey: 'FINGERSPELL', type: 'FINGERSPELL', letters: ['T', 'E'], duration: 1000 }
]);

// Step through first token (HOW)
for (let t = 0; t < 1.0; t += 1/60) engine.update(1/60);

// Now in second token (FINGERSPELL): step past the 0.24s transition blend
for (let t = 0; t < 0.3; t += 1/60) engine.update(1/60);

const leftShoulderAngle = avatar.bones.leftShoulder.quaternion.angleTo(avatar.neutralRestShoulderL || avatar.bones.leftShoulder.quaternion);
assert(Math.abs(avatar.bones.leftShoulder.rotation.x - 0.03) < 0.05, 'Left shoulder must be at rest after transition');
assert(Math.abs(avatar.bones.leftElbow.rotation.x - (-0.12)) < 0.05, 'Left elbow must be at rest after transition');
console.log('✓ Avatar Animation Mixer smoothly rests left arm during fingerspelling (no lingering gestures)');

console.log('ALL TESTS PASSED SUCCESSFULLY! 🚀');
