import * as THREE from 'three';

// Conservative compatibility gate. Different rest poses must be retargeted,
// not silently played as if their local joint rotations were interchangeable.
export function boneKey(name) {
  return name.replace(/^mixamorig[:_]?/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function indexBones(root) {
  const bones = new Map();
  root.traverse(node => {
    if (!node.isBone) return;
    const key = boneKey(node.name);
    if (bones.has(key)) throw new Error(`Tên khớp bị trùng: ${node.name}`);
    bones.set(key, node);
  });
  return bones;
}

export function inspectAnimation(root, clip) {
  const bones = indexBones(root);
  if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.tracks.length) {
    throw new Error('Tệp không có chuyển động hợp lệ để phát.');
  }
  for (const track of clip.tracks) {
    if (!track.validate() || !Array.from(track.values).every(Number.isFinite)) {
      throw new Error(`Dữ liệu chuyển động không hợp lệ: ${track.name}`);
    }
  }
  return { clip: clip.name, duration: clip.duration, tracks: clip.tracks.length,
    bones: [...bones.values()].map(node => node.name),
    fingerBones: [...bones.keys()].filter(name => /thumb|index|middle|ring|pinky|little/.test(name)).length };
}

export function compatibleClip(source, target, clip) {
  inspectAnimation(source, clip);
  const sourceBones = indexBones(source);
  const targetBones = indexBones(target);
  const issues = new Set();
  const tracks = [];
  const checked = new Set();
  function checkChain(bone) {
    if (!bone?.isBone || checked.has(bone)) return;
    checked.add(bone);
    const destination = targetBones.get(boneKey(bone.name));
    if (!destination) { issues.add(`Thiếu khớp đích: ${bone.name}`); return; }
    const parentKey = node => node.parent?.isBone ? boneKey(node.parent.name) : null;
    if (parentKey(bone) !== parentKey(destination)) issues.add(`Khác cấu trúc: ${bone.name}`);
    if (bone.quaternion.angleTo(destination.quaternion) > 0.03) issues.add(`Khác tư thế gốc: ${bone.name}`);
    if (bone.scale.distanceTo(destination.scale) > 0.001) issues.add(`Khác tỉ lệ khớp: ${bone.name}`);
    checkChain(bone.parent);
  }
  for (const track of clip.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const name = parsed.objectName === 'bones' ? parsed.objectIndex : parsed.nodeName;
    const bone = sourceBones.get(boneKey(String(name || '')));
    if (!bone || parsed.propertyName !== 'quaternion' || track.getValueSize() !== 4) {
      issues.add(`Cần chuyển đổi track: ${track.name}`);
      continue;
    }
    checkChain(bone);
    const destination = targetBones.get(boneKey(bone.name));
    if (destination) {
      const copy = track.clone();
      copy.name = `${destination.uuid}.quaternion`;
      tracks.push(copy);
    }
  }
  // Coordinate frames above the skeleton also affect rotation interpretation.
  for (const root of [source, target]) {
    root.updateMatrixWorld(true);
    const bones = indexBones(root);
    for (const bone of bones.values()) {
      if (bone.parent?.isBone) continue;
      const q = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
      if (q.angleTo(new THREE.Quaternion()) > 0.03) issues.add('Khác hệ trục của mô hình; cần chuyển đổi trước.');
    }
  }
  if (!tracks.length) issues.add('Không tìm thấy track xoay khớp phù hợp.');
  return { issues: [...issues], clip: issues.size ? null : new THREE.AnimationClip(clip.name, clip.duration, tracks) };
}
