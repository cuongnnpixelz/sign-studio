// Script to generate a high-fidelity ProDeaf Avatar GLB file
// Uses Three.js and GLTFExporter in Node.js to create public/avatar.glb

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

// Polyfill FileReader for Node.js
class MockFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = buf;
      if (this.onload) this.onload({ target: this });
      if (this.onloadend) this.onloadend({ target: this });
    }).catch(err => {
      if (this.onerror) this.onerror(err);
      if (this.onloadend) this.onloadend({ target: this });
    });
  }
}
globalThis.FileReader = MockFileReader;

console.log('--- Bắt đầu tạo mô hình 3D ProDeaf Avatar GLB ---');

const scene = new THREE.Scene();
scene.name = 'ProDeafAvatarScene';

// Material Definitions
const materials = {
  skin: new THREE.MeshStandardMaterial({
    name: 'SkinMat',
    color: 0xf1c6a7,
    roughness: 0.52,
    metalness: 0.04
  }),
  hair: new THREE.MeshStandardMaterial({
    name: 'HairMat',
    color: 0x2b1a11,
    roughness: 0.72,
    metalness: 0.08
  }),
  hairHighlight: new THREE.MeshStandardMaterial({
    name: 'HairHighlightMat',
    color: 0x3d2719,
    roughness: 0.65,
    metalness: 0.1
  }),
  eyebrow: new THREE.MeshStandardMaterial({
    name: 'EyebrowMat',
    color: 0x1c100a,
    roughness: 0.8
  }),
  eyeWhite: new THREE.MeshStandardMaterial({
    name: 'EyeWhiteMat',
    color: 0xffffff,
    roughness: 0.15
  }),
  eyeIris: new THREE.MeshStandardMaterial({
    name: 'EyeIrisMat',
    color: 0x452514,
    roughness: 0.1
  }),
  eyePupil: new THREE.MeshBasicMaterial({
    name: 'EyePupilMat',
    color: 0x050505
  }),
  eyeGlint: new THREE.MeshBasicMaterial({
    name: 'EyeGlintMat',
    color: 0xffffff
  }),
  lips: new THREE.MeshStandardMaterial({
    name: 'LipsMat',
    color: 0xd47373,
    roughness: 0.4,
    metalness: 0.05
  }),
  teeth: new THREE.MeshStandardMaterial({
    name: 'TeethMat',
    color: 0xfbfbfb,
    roughness: 0.2
  }),
  suitJacket: new THREE.MeshStandardMaterial({
    name: 'BlazerMat',
    color: 0x16181c,
    roughness: 0.78,
    metalness: 0.12
  }),
  lapelSilk: new THREE.MeshStandardMaterial({
    name: 'LapelMat',
    color: 0x121316,
    roughness: 0.55,
    metalness: 0.2
  }),
  shirtWhite: new THREE.MeshStandardMaterial({
    name: 'ShirtMat',
    color: 0xf6f8fb,
    roughness: 0.65,
    metalness: 0.05
  }),
  shirtButton: new THREE.MeshStandardMaterial({
    name: 'ButtonMat',
    color: 0xe2e8f0,
    roughness: 0.3,
    metalness: 0.4
  }),
  beltLeather: new THREE.MeshStandardMaterial({
    name: 'BeltLeatherMat',
    color: 0x2e1910,
    roughness: 0.45,
    metalness: 0.15
  }),
  beltBuckle: new THREE.MeshStandardMaterial({
    name: 'BeltBuckleMat',
    color: 0xd4d4d8,
    roughness: 0.2,
    metalness: 0.9
  }),
  jeansBlue: new THREE.MeshStandardMaterial({
    name: 'JeansMat',
    color: 0x3d7ec4,
    roughness: 0.82,
    metalness: 0.04
  }),
  jeansSeam: new THREE.MeshStandardMaterial({
    name: 'JeansSeamMat',
    color: 0xd99b43,
    roughness: 0.8
  }),
  watchMetal: new THREE.MeshStandardMaterial({
    name: 'WatchMetalMat',
    color: 0xe4e4e7,
    roughness: 0.2,
    metalness: 0.88
  }),
  watchStrap: new THREE.MeshStandardMaterial({
    name: 'WatchStrapMat',
    color: 0x18181b,
    roughness: 0.7
  })
};

const root = new THREE.Group();
root.name = 'ProDeafAvatar';
scene.add(root);

// 1. PELVIS & JEANS
const pelvis = new THREE.Group();
pelvis.name = 'Hips';
pelvis.position.set(0, 0.42, 0);
root.add(pelvis);

// Jeans Waistband & Hips
const hipsGeo = new THREE.CylinderGeometry(0.185, 0.195, 0.20, 24);
hipsGeo.scale(1.16, 1.0, 0.74);
const hipsMesh = new THREE.Mesh(hipsGeo, materials.jeansBlue);
hipsMesh.name = 'JeansHips';
hipsMesh.position.y = -0.06;
pelvis.add(hipsMesh);

// Jeans Fly Stitching
const flyGeo = new THREE.BoxGeometry(0.008, 0.14, 0.01);
const flyMesh = new THREE.Mesh(flyGeo, materials.jeansSeam);
flyMesh.name = 'JeansFly';
flyMesh.position.set(0, -0.05, 0.146);
pelvis.add(flyMesh);

// Belt Strap
const beltGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.045, 24);
beltGeo.scale(1.17, 1.0, 0.75);
const beltMesh = new THREE.Mesh(beltGeo, materials.beltLeather);
beltMesh.name = 'LeatherBelt';
beltMesh.position.y = 0.025;
pelvis.add(beltMesh);

// Belt Loops
const loopGeo = new THREE.BoxGeometry(0.012, 0.05, 0.015);
const loopAngles = [-0.6, -0.25, 0.25, 0.6, Math.PI];
loopAngles.forEach((ang, idx) => {
  const loop = new THREE.Mesh(loopGeo, materials.jeansBlue);
  loop.name = `BeltLoop_${idx}`;
  loop.position.set(Math.sin(ang) * 0.19 * 1.17, 0.025, Math.cos(ang) * 0.19 * 0.75);
  loop.rotation.y = ang;
  pelvis.add(loop);
});

// Metallic Belt Buckle
const buckleOuter = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.012), materials.beltBuckle);
buckleOuter.name = 'BeltBuckle';
buckleOuter.position.set(0, 0.025, 0.148);
pelvis.add(buckleOuter);

// Legs (Light blue denim jeans)
const thighGeo = new THREE.CylinderGeometry(0.098, 0.082, 0.58, 20);

const lLeg = new THREE.Mesh(thighGeo, materials.jeansBlue);
lLeg.name = 'LeftLeg';
lLeg.position.set(0.108, -0.38, 0);
pelvis.add(lLeg);

const lSeam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.56, 0.01), materials.jeansSeam);
lSeam.name = 'LeftJeansSeam';
lSeam.position.set(0.202, -0.38, 0);
pelvis.add(lSeam);

const rLeg = new THREE.Mesh(thighGeo, materials.jeansBlue);
rLeg.name = 'RightLeg';
rLeg.position.set(-0.108, -0.38, 0);
pelvis.add(rLeg);

const rSeam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.56, 0.01), materials.jeansSeam);
rSeam.name = 'RightJeansSeam';
rSeam.position.set(-0.202, -0.38, 0);
pelvis.add(rSeam);

// 2. TORSO (Spine & Chest)
const spine = new THREE.Group();
spine.name = 'Spine';
spine.position.set(0, 0.06, 0);
pelvis.add(spine);

// White Shirt Body
const shirtGeo = new THREE.CylinderGeometry(0.19, 0.178, 0.45, 24);
shirtGeo.scale(1.12, 1.0, 0.70);
const shirtMesh = new THREE.Mesh(shirtGeo, materials.shirtWhite);
shirtMesh.name = 'WhiteShirt';
shirtMesh.position.y = 0.225;
spine.add(shirtMesh);

// Shirt Placket
const placket = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.44, 0.012), materials.shirtWhite);
placket.name = 'ShirtPlacket';
placket.position.set(0, 0.225, 0.128);
spine.add(placket);

// 4 Shirt Buttons
const buttonGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12);
[0.10, 0.18, 0.26, 0.34].forEach((y, idx) => {
  const btn = new THREE.Mesh(buttonGeo, materials.shirtButton);
  btn.name = `ShirtButton_${idx}`;
  btn.rotation.x = Math.PI / 2;
  btn.position.set(0, y, 0.134);
  spine.add(btn);
});

// Outer Blazer
const blazerBackGeo = new THREE.CylinderGeometry(0.208, 0.192, 0.49, 24, 1, false, Math.PI * 0.18, Math.PI * 1.64);
blazerBackGeo.scale(1.20, 1.0, 0.76);
const blazerBack = new THREE.Mesh(blazerBackGeo, materials.suitJacket);
blazerBack.name = 'BlazerBack';
blazerBack.rotation.y = -Math.PI / 2;
blazerBack.position.y = 0.235;
spine.add(blazerBack);

// Left & Right Front Panels
const lFlapGeo = new THREE.BoxGeometry(0.09, 0.47, 0.022);
const lFlap = new THREE.Mesh(lFlapGeo, materials.suitJacket);
lFlap.name = 'LeftBlazerPanel';
lFlap.position.set(0.155, 0.225, 0.132);
lFlap.rotation.y = 0.22;
spine.add(lFlap);

const rFlap = new THREE.Mesh(lFlapGeo, materials.suitJacket);
rFlap.name = 'RightBlazerPanel';
rFlap.position.set(-0.155, 0.225, 0.132);
rFlap.rotation.y = -0.22;
spine.add(rFlap);

// Notched Lapels
const lapelGeo = new THREE.BoxGeometry(0.052, 0.32, 0.016);
const lLapel = new THREE.Mesh(lapelGeo, materials.lapelSilk);
lLapel.name = 'LeftNotchLapel';
lLapel.position.set(0.125, 0.33, 0.150);
lLapel.rotation.set(-0.05, 0.2, -0.16);
spine.add(lLapel);

const rLapel = new THREE.Mesh(lapelGeo, materials.lapelSilk);
rLapel.name = 'RightNotchLapel';
rLapel.position.set(-0.125, 0.33, 0.150);
rLapel.rotation.set(-0.05, -0.2, 0.16);
spine.add(rLapel);

// Breast Pocket
const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.01), materials.lapelSilk);
pocket.name = 'BreastPocket';
pocket.position.set(0.14, 0.31, 0.148);
pocket.rotation.z = -0.05;
spine.add(pocket);

// 3. CHEST & NECK
const chest = new THREE.Group();
chest.name = 'Chest';
chest.position.set(0, 0.44, 0);
spine.add(chest);

// Open V-Neck & Throat
const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.072, 0.11, 16), materials.skin);
throat.name = 'Throat';
throat.position.set(0, 0.045, 0.08);
chest.add(throat);

// Spread Collar Left & Right Points
const collarTabGeo = new THREE.BoxGeometry(0.035, 0.13, 0.014);
const lCollar = new THREE.Mesh(collarTabGeo, materials.shirtWhite);
lCollar.name = 'LeftCollarPoint';
lCollar.position.set(0.068, 0.035, 0.122);
lCollar.rotation.set(0.15, 0.3, -0.52);
chest.add(lCollar);

const rCollar = new THREE.Mesh(collarTabGeo, materials.shirtWhite);
rCollar.name = 'RightCollarPoint';
rCollar.position.set(-0.068, 0.035, 0.122);
rCollar.rotation.set(0.15, -0.3, 0.52);
chest.add(rCollar);

// Neck
const neck = new THREE.Group();
neck.name = 'Neck';
neck.position.set(0, 0.09, 0);
chest.add(neck);

const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.076, 0.14, 16), materials.skin);
neckMesh.name = 'NeckMesh';
neckMesh.position.y = 0.07;
neck.add(neckMesh);

// 4. HEAD, SCULPTED FACE & HAIR
const head = new THREE.Group();
head.name = 'Head';
head.position.set(0, 0.15, 0);
neck.add(head);

// Cranium Head Base
const headGeo = new THREE.SphereGeometry(0.165, 28, 28);
headGeo.scale(0.94, 1.18, 1.02);
const headMesh = new THREE.Mesh(headGeo, materials.skin);
headMesh.name = 'FaceBase';
headMesh.position.y = 0.175;
head.add(headMesh);

// Jaw & Chin
const jawGeo = new THREE.SphereGeometry(0.082, 18, 18);
jawGeo.scale(1.08, 0.88, 1.05);
const jawMesh = new THREE.Mesh(jawGeo, materials.skin);
jawMesh.name = 'JawChin';
jawMesh.position.set(0, 0.065, 0.085);
head.add(jawMesh);

// Ears
const earGeo = new THREE.SphereGeometry(0.038, 14, 14);
earGeo.scale(0.35, 1.15, 0.75);

const lEar = new THREE.Mesh(earGeo, materials.skin);
lEar.name = 'LeftEar';
lEar.position.set(0.158, 0.175, 0.01);
lEar.rotation.set(0, 0.2, 0.1);
head.add(lEar);

const rEar = new THREE.Mesh(earGeo, materials.skin);
rEar.name = 'RightEar';
rEar.position.set(-0.158, 0.175, 0.01);
rEar.rotation.set(0, -0.2, -0.1);
head.add(rEar);

// Sculpted Hair Base
const hairBaseGeo = new THREE.SphereGeometry(0.176, 24, 24);
hairBaseGeo.scale(0.96, 1.15, 1.06);
const hairBase = new THREE.Mesh(hairBaseGeo, materials.hair);
hairBase.name = 'HairBase';
hairBase.position.set(0, 0.205, -0.018);
head.add(hairBase);

// Crown Hair Volume
const crownGeo = new THREE.SphereGeometry(0.14, 18, 18);
crownGeo.scale(1.15, 0.55, 1.1);
const crown = new THREE.Mesh(crownGeo, materials.hair);
crown.name = 'HairCrown';
crown.position.set(0.01, 0.35, 0.02);
head.add(crown);

// Side-part Bangs Sweep (Right to left)
const sweepGeo = new THREE.CylinderGeometry(0.035, 0.13, 0.19, 14);
sweepGeo.scale(1.45, 0.65, 0.95);
const sweepBangs = new THREE.Mesh(sweepGeo, materials.hairHighlight);
sweepBangs.name = 'HairBangsSweep';
sweepBangs.rotation.set(-0.42, 0.22, -0.25);
sweepBangs.position.set(0.045, 0.33, 0.115);
head.add(sweepBangs);

// Side Hair Tufts
const lTuft = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), materials.hair);
lTuft.name = 'LeftHairTuft';
lTuft.scale.set(0.75, 1.4, 0.9);
lTuft.position.set(0.142, 0.27, 0.035);
head.add(lTuft);

const rTuft = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), materials.hair);
rTuft.name = 'RightHairTuft';
rTuft.scale.set(0.75, 1.4, 0.9);
rTuft.position.set(-0.142, 0.27, 0.035);
head.add(rTuft);

// Eyes (Almond DreamWorks style with Brown Iris, Pupil, Glint)
const eyeWhiteGeo = new THREE.SphereGeometry(0.031, 18, 18);
const irisGeo = new THREE.SphereGeometry(0.017, 16, 16);
const pupilGeo = new THREE.SphereGeometry(0.009, 14, 14);
const glintGeo = new THREE.SphereGeometry(0.0035, 8, 8);

function createEye(side, posX) {
  const eyeWhite = new THREE.Mesh(eyeWhiteGeo, materials.eyeWhite);
  eyeWhite.name = `${side}EyeWhite`;
  eyeWhite.position.set(posX, 0.185, 0.138);

  const iris = new THREE.Mesh(irisGeo, materials.eyeIris);
  iris.name = `${side}EyeIris`;
  iris.position.set(0, 0, 0.022);

  const pupil = new THREE.Mesh(pupilGeo, materials.eyePupil);
  pupil.name = `${side}EyePupil`;
  pupil.position.set(0, 0, 0.016);

  const glint = new THREE.Mesh(glintGeo, materials.eyeGlint);
  glint.name = `${side}EyeGlint`;
  glint.position.set(0.005, 0.005, 0.018);

  iris.add(pupil);
  iris.add(glint);
  eyeWhite.add(iris);
  return eyeWhite;
}

head.add(createEye('Left', 0.058));
head.add(createEye('Right', -0.058));

// Curved Arched Eyebrows
const browGeo = new THREE.BoxGeometry(0.058, 0.015, 0.022);

const lBrow = new THREE.Mesh(browGeo, materials.eyebrow);
lBrow.name = 'LeftEyebrow';
lBrow.position.set(0.062, 0.235, 0.156);
lBrow.rotation.z = -0.08;
head.add(lBrow);

const rBrow = new THREE.Mesh(browGeo, materials.eyebrow);
rBrow.name = 'RightEyebrow';
rBrow.position.set(-0.062, 0.235, 0.156);
rBrow.rotation.z = 0.08;
head.add(rBrow);

// Nose
const noseBridge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.085, 0.022), materials.skin);
noseBridge.name = 'NoseBridge';
noseBridge.position.set(0, 0.165, 0.168);
noseBridge.rotation.x = -0.22;
head.add(noseBridge);

const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), materials.skin);
noseTip.name = 'NoseTip';
noseTip.position.set(0, 0.135, 0.180);
head.add(noseTip);

// Mouth & Teeth
const mouthGroup = new THREE.Group();
mouthGroup.name = 'MouthGroup';
mouthGroup.position.set(0, 0.088, 0.158);
head.add(mouthGroup);

const lipGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.014, 16);
lipGeo.scale(1.22, 0.42, 0.85);
const lipsMesh = new THREE.Mesh(lipGeo, materials.lips);
lipsMesh.name = 'Lips';
lipsMesh.rotation.x = Math.PI / 2;
mouthGroup.add(lipsMesh);

const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.010, 0.006), materials.teeth);
teeth.name = 'Teeth';
teeth.position.set(0, 0.002, -0.005);
mouthGroup.add(teeth);

// 5. ARMS, SLEEVES, WRISTWATCH & FINGERS
function buildArm(parent, side, dir) {
  const shoulder = new THREE.Group();
  shoulder.name = `${side}Shoulder`;
  shoulder.position.set(dir * 0.245, -0.025, 0);
  parent.add(shoulder);

  // Shoulder Pad
  const padGeo = new THREE.SphereGeometry(0.062, 14, 14);
  padGeo.scale(1.35, 0.95, 1.15);
  const pad = new THREE.Mesh(padGeo, materials.suitJacket);
  pad.name = `${side}ShoulderPad`;
  pad.position.set(dir * 0.035, 0.01, 0);
  shoulder.add(pad);

  // Upper Arm Blazer Sleeve
  const upperArmGeo = new THREE.CylinderGeometry(0.056, 0.048, 0.27, 16);
  const upperArm = new THREE.Mesh(upperArmGeo, materials.suitJacket);
  upperArm.name = `${side}UpperArmSleeve`;
  upperArm.position.y = -0.135;
  shoulder.add(upperArm);

  // Elbow Joint
  const elbow = new THREE.Group();
  elbow.name = `${side}Elbow`;
  elbow.position.set(0, -0.27, 0);
  shoulder.add(elbow);

  // Forearm Blazer Sleeve
  const forearmGeo = new THREE.CylinderGeometry(0.048, 0.043, 0.24, 16);
  const forearm = new THREE.Mesh(forearmGeo, materials.suitJacket);
  forearm.name = `${side}ForearmSleeve`;
  forearm.position.y = -0.12;
  elbow.add(forearm);

  // White Shirt Cuff
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.042, 0.032, 16), materials.shirtWhite);
  cuff.name = `${side}ShirtCuff`;
  cuff.position.y = -0.238;
  elbow.add(cuff);

  // Wristwatch on Left Arm
  if (side === 'left') {
    const watchStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.024, 18), materials.watchStrap);
    watchStrap.name = 'WatchStrap';
    watchStrap.position.y = -0.248;
    elbow.add(watchStrap);

    const watchCase = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 16), materials.watchMetal);
    watchCase.name = 'WatchCase';
    watchCase.rotation.z = Math.PI / 2;
    watchCase.position.set(0.047, -0.248, 0);
    elbow.add(watchCase);
  }

  // Wrist Joint
  const wrist = new THREE.Group();
  wrist.name = `${side}Wrist`;
  wrist.position.set(0, -0.255, 0);
  elbow.add(wrist);

  // Palm
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.082, 0.024), materials.skin);
  palm.name = `${side}HandPalm`;
  palm.position.y = -0.041;
  wrist.add(palm);

  // 5 Articulated Fingers
  const fingerConfigs = [
    { name: 'Thumb', x: dir * 0.042, y: -0.025, z: 0.012, rotZ: dir * 0.5, len: 0.033, thick: 0.014 },
    { name: 'Index', x: dir * 0.025, y: -0.082, z: 0.0, rotZ: dir * 0.05, len: 0.037, thick: 0.012 },
    { name: 'Middle', x: 0.0, y: -0.085, z: 0.0, rotZ: 0.0, len: 0.040, thick: 0.012 },
    { name: 'Ring', x: -dir * 0.022, y: -0.081, z: 0.0, rotZ: -dir * 0.05, len: 0.036, thick: 0.011 },
    { name: 'Pinky', x: -dir * 0.040, y: -0.075, z: 0.0, rotZ: -dir * 0.1, len: 0.030, thick: 0.010 }
  ];

  fingerConfigs.forEach(cfg => {
    const base = new THREE.Group();
    base.name = `${side}${cfg.name}_Base`;
    base.position.set(cfg.x, cfg.y, cfg.z);
    base.rotation.z = cfg.rotZ;
    wrist.add(base);

    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(cfg.thick * 0.9, cfg.thick, cfg.len, 10), materials.skin);
    p1.name = `${side}${cfg.name}_P1`;
    p1.position.y = -cfg.len / 2;
    base.add(p1);

    const mid = new THREE.Group();
    mid.name = `${side}${cfg.name}_Mid`;
    mid.position.set(0, -cfg.len, 0);
    base.add(mid);

    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(cfg.thick * 0.8, cfg.thick * 0.9, cfg.len * 0.8, 10), materials.skin);
    p2.name = `${side}${cfg.name}_P2`;
    p2.position.y = -(cfg.len * 0.8) / 2;
    mid.add(p2);

    const tip = new THREE.Group();
    tip.name = `${side}${cfg.name}_Tip`;
    tip.position.set(0, -cfg.len * 0.8, 0);
    mid.add(tip);

    const p3 = new THREE.Mesh(new THREE.CylinderGeometry(cfg.thick * 0.6, cfg.thick * 0.8, cfg.len * 0.65, 10), materials.skin);
    p3.name = `${side}${cfg.name}_P3`;
    p3.position.y = -(cfg.len * 0.65) / 2;
    tip.add(p3);
  });

  // Natural Rest Pose for arms
  shoulder.rotation.set(0.04, 0, dir * -0.14);
  elbow.rotation.set(-0.14, 0, dir * 0.10);
  wrist.rotation.set(0.1, dir * 0.15, 0);
}

buildArm(chest, 'right', -1);
buildArm(chest, 'left', 1);

console.log('--- Mô hình 3D hoàn chỉnh! Đang tiến hành export sang GLB nhị phân ---');

// Export to GLB
const exporter = new GLTFExporter();
const glbBuffer = await exporter.parseAsync(scene, {
  binary: true,
  embedImages: true,
  includeCustomExtensions: true
});

const outputDir = path.resolve('public');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'avatar.glb');
fs.writeFileSync(outputPath, Buffer.from(glbBuffer));

// Also create a copy named prodeaf_avatar.glb
const namedPath = path.join(outputDir, 'prodeaf_avatar.glb');
fs.writeFileSync(namedPath, Buffer.from(glbBuffer));

const sizeKB = (glbBuffer.byteLength / 1024).toFixed(1);
console.log(`✅ Xuất file GLB thành công rực rỡ!`);
console.log(`📁 Đường dẫn: ${outputPath}`);
console.log(`📦 Kích thước: ${sizeKB} KB (${glbBuffer.byteLength} bytes)`);
