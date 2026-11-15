import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { AvatarModel } from '../src/avatar/avatarModel.js';
import { SignAnimationEngine } from '../src/avatar/animationMixer.js';
import { FINGERSPELL_POSES, spellingLetters, spellingDuration } from '../src/avatar/fingerspelling.js';
import { convertTextToGloss } from '../src/nlp/textToGloss.js';
import { mapHybridGloss } from '../src/nlp/hybridGloss.js';

const avatar = new AvatarModel(new THREE.Scene());
const engine = new SignAnimationEngine(avatar);
function play(letters, duration = 2000) {
  engine.stop();
  engine.playSequence([{ type: 'FINGERSPELL', clipKey: 'FINGERSPELL', letters, duration }]);
}
function sample(time) {
  engine.restore(engine.neutral);
  engine.updateFingerspelling(time);
  avatar.root.updateMatrixWorld(true);
}
const wristPosition = () => avatar.bones.rightWrist.getWorldPosition(new THREE.Vector3());
const wristRotation = () => avatar.bones.rightWrist.getWorldQuaternion(new THREE.Quaternion());
function tipInPalm(name) {
  return avatar.bones.rightWrist.worldToLocal(avatar.hands.right.fingers[name].tip.getWorldPosition(new THREE.Vector3()));
}

test('U/V have measurably different finger spacing; R crosses the fingers in depth', () => {
  play(['U']); sample(1);
  const uGap = tipInPalm('index').distanceTo(tipInPalm('middle'));
  play(['V']); sample(1);
  const vGap = tipInPalm('index').distanceTo(tipInPalm('middle'));
  assert(vGap > uGap * 1.5, 'V must visibly open the fingers');
  play(['R']); sample(1);
  const index = tipInPalm('index'), middle = tipInPalm('middle');
  assert(index.x < middle.x, 'R fingertips must cross their initial lateral order');
  assert(Math.abs(index.z - middle.z) > .01, 'Crossed fingers need depth separation');
});

test('all three authored wrist axes affect the final hand orientation', () => {
  play(['K']); sample(1); const k = wristRotation();
  play(['P']); sample(1); assert(k.angleTo(wristRotation()) > .5);
  play(['G']); sample(1); const g = wristRotation();
  play(['Q']); sample(1); assert(g.angleTo(wristRotation()) > .8);
  for (const letter of ['P', 'Q']) {
    play([letter]); sample(1);
    const finger = avatar.hands.right.fingers.index;
    const direction = finger.tip.getWorldPosition(new THREE.Vector3()).sub(finger.base.getWorldPosition(new THREE.Vector3())).normalize();
    assert(direction.y < -.5, `${letter} must point downward`);
  }
  const before = FINGERSPELL_POSES.U.wrist;
  try {
    play(['U']); sample(1); const neutral = wristRotation();
    for (const axis of ['x', 'y', 'z']) {
      FINGERSPELL_POSES.U.wrist = { x: 0, y: 0, z: 0, [axis]: .4 };
      play(['U']); sample(1);
      assert(Math.abs(neutral.angleTo(wristRotation()) - .4) < 1e-6, axis);
    }
  } finally { FINGERSPELL_POSES.U.wrist = before; }
});

test('J traces a hook and Z traces three strokes; static letters stay still', () => {
  play(['Z'], 1000);
  const z = [.3, .5, .7, .9].map(t => { sample(t); return wristPosition(); });
  assert(z[1].x < z[0].x - .07);
  assert(z[2].x > z[1].x + .07 && z[2].y < z[1].y - .07);
  assert(z[3].x < z[2].x - .07);
  play(['J'], 1000);
  sample(.3); const start = wristPosition();
  sample(.6); const bottom = wristPosition();
  sample(.9); const end = wristPosition();
  assert(bottom.y < start.y - .08 && end.x > bottom.x + .04 && end.y > bottom.y);
  play(['I'], 1000); sample(.3); const i = wristPosition(); sample(.9);
  assert(i.distanceTo(wristPosition()) < 1e-8);
  assert(spellingDuration(['J', 'Z']) > spellingDuration(['A', 'B']));
});

test('letter boundaries are continuous for both finger rotations and moving arms', () => {
  for (const letters of [['A', 'B'], ['Z', 'A'], ['J', 'R'], ['R', 'U']]) {
    play(letters); sample(0);
    const boundary = engine.spellingTimeline[0].end;
    sample(boundary - .0001); const before = engine.capture();
    sample(boundary + .0001); const after = engine.capture();
    for (let j = 0; j < before.length; j++) assert(before[j].q.angleTo(after[j].q) < .002, `${letters}: joint ${j}`);
  }
  play(['A', 'B']); sample(1.15);
  const bend = avatar.hands.right.fingers.index.base.rotation.x;
  assert(bend > .05 * 1.15 && bend < .95 * 1.15, 'Intermediate pose must interpolate');
  play(['O', 'O']); sample(.6); const first = wristPosition(); sample(1.6);
  assert(first.distanceTo(wristPosition()) > .02, 'Repeated letters remain visibly separated');
});

test('VSL retains special letters through tokenization in NFC and NFD; ASL remains romanized', () => {
  const text = 'Ắ Ầ Đ Ế Ộ Ớ Ữ';
  for (const input of [text, text.normalize('NFD')]) {
    const result = convertTextToGloss(input, 'vsl');
    assert.deepEqual(result.tokens.flatMap(t => t.letters), [...'ĂÂĐÊÔƠƯ']);
    assert(result.tokens.every(t => t.letters.every(l => Object.hasOwn(FINGERSPELL_POSES, l))));
  }
  assert.deepEqual(spellingLetters(text, 'asl'), [...'AADEOOU']);
  const hybrid = mapHybridGloss({ translation: 'Dang', sentenceType: 'STATEMENT', tokens: [{ gloss: 'DANG', spelling: 'Đặng', nmm: {} }] });
  assert.deepEqual(hybrid.tokens[0].letters, [...'DANG']);
});

test('independent joints form X and reset cleanly; pause/speed/stop still work', () => {
  play(['X']); sample(.8);
  const finger = avatar.hands.right.fingers.index;
  assert(finger.mid.rotation.x > finger.base.rotation.x * 5);
  play(['R']); sample(.8); play(['U']); sample(.8);
  assert.equal(finger.base.rotation.z, 0);
  engine.togglePause(); const paused = engine.capture(); engine.update(.1);
  assert.deepEqual(engine.capture(), paused);
  engine.togglePause(); engine.setSpeed(2); const clock = engine.currentClipTime; engine.update(.1);
  assert(Math.abs(engine.currentClipTime - clock - .2) < 1e-8);
  engine.stop(); engine.update(.5); assert(!engine.isPlaying);
  engine.setSpeed(1);
  for (const letter of Object.keys(FINGERSPELL_POSES)) {
    play([letter]);
    for (const time of [0, .1, .5, 1, 1.9]) {
      sample(time);
      for (const joint of engine.animated) assert(joint.matrixWorld.elements.every(Number.isFinite), letter);
    }
  }
});
