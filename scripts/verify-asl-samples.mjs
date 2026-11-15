import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { inspectAnimation } from '../src/avatar/externalAnimation.js';

const base = new URL('../public/asl-samples/studio-galt/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', base), 'utf8'));
let bytes = 0;
for (const sample of manifest) {
  const buffer = fs.readFileSync(new URL(sample.file, base));
  assert.equal(buffer.length, sample.bytes);
  assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'), sample.sha256);
  const model = new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
  assert(model.animations.length > 0);
  for (const clip of model.animations) {
    const report = inspectAnimation(model, clip);
    assert(report.fingerBones >= 30, `${sample.name}: missing fingers`);
    console.log(`${sample.name}: ${report.duration.toFixed(2)}s, ${report.bones.length} bones, ${report.fingerBones} finger bones, ${report.tracks} tracks`);
  }
  bytes += buffer.length;
}
console.log(`Verified ${manifest.length} samples, ${bytes} bytes; technical validation only, not linguistic ASL review.`);
