import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { compatibleClip, inspectAnimation } from '../src/avatar/externalAnimation.js';

function rig(prefix = '') {
  const root = new THREE.Group();
  const arm = new THREE.Bone(); arm.name = `${prefix}RightArm`;
  const hand = new THREE.Bone(); hand.name = `${prefix}RightHand`; hand.position.y = 1;
  root.add(arm); arm.add(hand);
  return { root, arm, hand };
}
function clip(name = 'RightHand.quaternion') {
  return new THREE.AnimationClip('technical-test-not-ASL', 1, [new THREE.QuaternionKeyframeTrack(name, [0, 1], [0, 0, 0, 1, 0, 0, Math.sin(0.2), Math.cos(0.2)])]);
}
test('compatible animation changes target joint, leaving source clip intact', () => {
  const source = rig(), target = rig('mixamorig:');
  const original = clip();
  const mapped = compatibleClip(source.root, target.root, original);
  assert.deepEqual(mapped.issues, []);
  const mixer = new THREE.AnimationMixer(target.root);
  mixer.clipAction(mapped.clip).play(); mixer.update(0.5);
  assert(target.hand.quaternion.angleTo(new THREE.Quaternion()) > 0.1);
  assert.equal(original.tracks[0].name, 'RightHand.quaternion');
});
test('missing joints and changed bind poses are rejected', () => {
  const source = rig(), target = rig();
  target.arm.rotation.z = 0.5;
  assert.equal(compatibleClip(source.root, target.root, clip()).clip, null);
  target.arm.rotation.z = 0;
  target.hand.name = 'OtherHand';
  assert.equal(compatibleClip(source.root, target.root, clip()).clip, null);
});
test('translation tracks are not silently dropped', () => {
  const source = rig(), target = rig();
  const motion = clip();
  motion.tracks.push(new THREE.VectorKeyframeTrack('RightArm.position', [0, 1], [0, 0, 0, 0, 1, 0]));
  assert.equal(compatibleClip(source.root, target.root, motion).clip, null);
});
test('empty, nonfinite and duplicate-bone data are rejected', () => {
  const source = rig();
  assert.throws(() => inspectAnimation(source.root, new THREE.AnimationClip('empty', 0, [])));
  const bad = clip(); bad.tracks[0].values[0] = Infinity;
  assert.throws(() => inspectAnimation(source.root, bad));
  source.hand.name = source.arm.name;
  assert.throws(() => inspectAnimation(source.root, clip()));
});
