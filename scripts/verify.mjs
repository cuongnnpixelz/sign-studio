import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AvatarModel } from '../src/avatar/avatarModel.js';
import { SignAnimationEngine } from '../src/avatar/animationMixer.js';
import { SIGN_CLIPS } from '../src/avatar/signClips.js';
import { translateSpeech } from '../src/nlp/translator.js';
import { convertTextToGloss } from '../src/nlp/textToGloss.js';

const avatar = new AvatarModel(new THREE.Scene());
const engine = new SignAnimationEngine(avatar);
const token = (clipKey, duration = 1000) => ({ type: 'SIGN', clipKey, duration });
const step = (seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) engine.update(dt); };
const rest = avatar.bones.rightShoulder.quaternion.clone();
engine.playSequence([token('HELLO', 3000)]);
step(.8);
assert(avatar.bones.rightShoulder.quaternion.angleTo(rest) > .4, 'Visible shoulder must move');
engine.togglePause();
const paused = engine.currentClipTime;
const pose = avatar.bones.rightShoulder.quaternion.clone();
step(.5);
assert.equal(engine.currentClipTime, paused);
assert(pose.angleTo(avatar.bones.rightShoulder.quaternion) < 1e-6);
engine.togglePause();
engine.setSpeed(2);
engine.update(.1);
assert(Math.abs(engine.currentClipTime - paused - .2) < 1e-6, 'Speed changes the active clip clock');
engine.stop();
step(.5);
assert(avatar.bones.rightShoulder.quaternion.angleTo(rest) < 1e-6, 'Stop settles to rest');
engine.setSpeed(1);
let completed = 0;
const sequence = [];
engine.playSequence([token('HELLO'), token('HOW')], (t, i) => sequence.push([t.clipKey, i]), () => completed++);
step(2.5);
assert.deepEqual(sequence, [['HELLO', 1], ['HOW', 2]]);
assert.equal(completed, 1);
assert.equal(engine.isPlaying, false);

for (const key of Object.keys(SIGN_CLIPS)) {
  engine.playSequence([token(key)]);
  step(.6);
  avatar.root.updateMatrixWorld(true);
  for (const joint of Object.values(avatar.bones)) {
    assert(joint.matrixWorld.elements.every(Number.isFinite), `${key}: finite joint transforms`);
  }
}
engine.playSequence([token('HOW')]);
step(.5);
avatar.root.updateMatrixWorld(true);
for (const side of ['right', 'left']) {
  const wrist = avatar.bones[`${side}Wrist`].getWorldPosition(new THREE.Vector3());
  assert(wrist.z > .25 && wrist.y > .7 && wrist.y < .8 && Math.abs(wrist.x) < .19, 'Reference hands stay together in front of the chest');
}

assert.equal(translateSpeech('Tôi khỏe cảm ơn bạn còn bạn', 'vi').translated, 'i am fine thank you and you');
assert.equal(translateSpeech('giúp bạn', 'vi').translated, 'help you');
assert.equal(translateSpeech('Hello, how are you?', 'en').translated, 'Hello, how are you?');
assert.throws(() => translateSpeech('Bonjour', 'fr'), /Chỉ hỗ trợ/);
assert.throws(() => convertTextToGloss('Hello', 'libras'), /Chỉ hỗ trợ/);
const fallback = convertTextToGloss('friend Alex');
assert(fallback.tokens.every(t => t.type === 'FINGERSPELL'), 'Unavailable clips use explicit fingerspelling');
assert.deepEqual(fallback.tokens.at(-1).letters, ['A', 'L', 'E', 'X']);
console.log('PASS: avatar movement, pause/resume, speed, stop, sequence callbacks, all clips, chest IK, translation and fallback.');
