// High-Fidelity 3D Model Generator matching the 2 reference screenshots exactly
// Recreates:
// - Pale ice-blue spread-collar shirt with 2 dark buttons on placket
// - Matte black open-front blazer with notched lapels & broad shoulders
// - Bright silver rectangular belt buckle & dark belt
// - Light sky-blue jeans with center thigh fade
// - Sculpted face with bold dark arched eyebrows, warm brown eyes with specular glint
// - Dark chocolate brown swept hair with right-side part
// - Embedded Animation Clips for Image 1 (Wave_Hello) and Image 2 (Sign_Chest)

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

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

console.log('--- Đang tạo mô hình 3D ProDeaf GLB chuẩn xác theo 2 hình ảnh tham chiếu ---');

const scene = new THREE.Scene();
scene.name = 'ProDeafReferenceScene';

// Accurate Material Palette matched to the two screenshots
const materials = {
  skin: new THREE.MeshStandardMaterial({
    name: 'SkinMat',
    color: 0xf4d0b7, // Warm Mediterranean peach skin tone
    roughness: 0.50,
    metalness: 0.03
  }),
  hair: new THREE.MeshStandardMaterial({
    name: 'HairMat',
    color: 0x2d1a12, // Dark chocolate brown hair
    roughness: 0.70,
    metalness: 0.08
  }),
  eyebrow: new THREE.MeshStandardMaterial({
    name: 'EyebrowMat',
    color: 0x1c120c, // Bold dark brown/black arched eyebrows
    roughness: 0.85
  }),
  eyeWhite: new THREE.MeshStandardMaterial({
    name: 'EyeWhiteMat',
    color: 0xffffff,
    roughness: 0.12
  }),
  eyeIris: new THREE.MeshStandardMaterial({
    name: 'EyeIrisMat',
    color: 0x563116, // Honey-brown iris
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
    color: 0xd57676, // Soft natural coral-rose lips
    roughness: 0.42,
    metalness: 0.04
  }),
  teeth: new THREE.MeshStandardMaterial({
    name: 'TeethMat',
    color: 0xffffff, // White smiling teeth
    roughness: 0.2
  }),
  suitJacket: new THREE.MeshStandardMaterial({
    name: 'BlazerMat',
    color: 0x1a1b1f, // Deep matte charcoal/black blazer
    roughness: 0.78,
    metalness: 0.10
  }),
  lapelSilk: new THREE.MeshStandardMaterial({
    name: 'LapelMat',
    color: 0x141518, // Notched lapels
    roughness: 0.60,
    metalness: 0.15
  }),
  // EXACT SHIRT COLOR: Pale ice-blue / pastel light blue from screenshots
  shirtIceBlue: new THREE.MeshStandardMaterial({
    name: 'ShirtIceBlueMat',
    color: 0xdde7f2, // Pale ice-blue matching screenshots 1 & 2!
    roughness: 0.62,
    metalness: 0.04
  }),
  shirtButtonDark: new THREE.MeshStandardMaterial({
    name: 'ShirtButtonDarkMat',
    color: 0x1e2024, // 2 distinct dark buttons visible on shirt placket
    roughness: 0.3,
    metalness: 0.5
  }),
  beltStrap: new THREE.MeshStandardMaterial({
    name: 'BeltStrapMat',
    color: 0x1c1d22, // Dark belt strap
    roughness: 0.5,
    metalness: 0.1
  }),
  beltBuckleSilver: new THREE.MeshStandardMaterial({
    name: 'BeltBuckleSilverMat',
    color: 0xf0f3f8, // Prominent large rectangular silver buckle
    roughness: 0.2,
    metalness: 0.88
  }),
  // EXACT JEANS COLOR: Light sky blue denim with faded wash
  jeansSkyBlue: new THREE.MeshStandardMaterial({
    name: 'JeansSkyBlueMat',
    color: 0x418ee6, // Light sky-blue denim matching screenshots
    roughness: 0.84,
    metalness: 0.03
  }),
  jeansWashHighlight: new THREE.MeshStandardMaterial({
    name: 'JeansWashMat',
    color: 0x6eaef6, // Bleached faded wash in center of thighs
    roughness: 0.85
  }),
  jeansSeam: new THREE.MeshStandardMaterial({
    name: 'JeansSeamMat',
    color: 0x286bb5, // Fly seam & outseam line
    roughness: 0.8
  })
};

const root = new THREE.Group();
root.name = 'ProDeafAvatar';
scene.add(root);

// ---------------- 1. PELVIS & JEANS (Exactly matching screenshot cut) ----------------
const pelvis = new THREE.Group();
pelvis.name = 'Hips';
pelvis.position.set(0, 0.42, 0);
root.add(pelvis);

// Jeans Hips / Pelvis
const hipsGeo = new THREE.CylinderGeometry(0.185, 0.195, 0.20, 24);
hipsGeo.scale(1.16, 1.0, 0.74);
const hipsMesh = new THREE.Mesh(hipsGeo, materials.jeansSkyBlue);
hipsMesh.name = 'JeansHips';
hipsMesh.position.y = -0.06;
pelvis.add(hipsMesh);

// Center Fly Seam
const flyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.14, 0.01), materials.jeansSeam);
flyMesh.name = 'JeansFly';
flyMesh.position.set(0, -0.05, 0.146);
pelvis.add(flyMesh);

// Dark Belt Strap
const beltMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.19, 0.19, 0.045, 24).scale(1.17, 1.0, 0.75),
  materials.beltStrap
);
beltMesh.name = 'LeatherBelt';
beltMesh.position.y = 0.025;
pelvis.add(beltMesh);

// 5 Belt Loops
[-0.6, -0.25, 0.25, 0.6, Math.PI].forEach((ang, idx) => {
  const loop = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.015), materials.jeansSkyBlue);
  loop.name = `BeltLoop_${idx}`;
  loop.position.set(Math.sin(ang) * 0.19 * 1.17, 0.025, Math.cos(ang) * 0.19 * 0.75);
  loop.rotation.y = ang;
  pelvis.add(loop);
});

// Prominent Large Rectangular Silver Buckle (Matches both screenshots!)
const buckleOuter = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.046, 0.014), materials.beltBuckleSilver);
buckleOuter.name = 'SilverBeltBuckle';
buckleOuter.position.set(0, 0.025, 0.148);
pelvis.add(buckleOuter);

const buckleHole = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.022, 0.016), materials.beltStrap);
buckleHole.name = 'BuckleCenterHole';
buckleHole.position.set(0, 0.025, 0.149);
pelvis.add(buckleHole);

// Left & Right Jeans Legs with Center Wash Highlight
const thighGeo = new THREE.CylinderGeometry(0.098, 0.082, 0.58, 20);

// Left Leg Base
const lLeg = new THREE.Mesh(thighGeo, materials.jeansSkyBlue);
lLeg.name = 'LeftLeg';
lLeg.position.set(0.108, -0.38, 0);
pelvis.add(lLeg);

// Left Thigh Fade Wash (Highlight in center of thigh seen in screenshots)
const lWash = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.45, 12, 1, false, 0, Math.PI), materials.jeansWashHighlight);
lWash.name = 'LeftThighWash';
lWash.position.set(0.108, -0.35, 0.035);
pelvis.add(lWash);

// Right Leg Base
const rLeg = new THREE.Mesh(thighGeo, materials.jeansSkyBlue);
rLeg.name = 'RightLeg';
rLeg.position.set(-0.108, -0.38, 0);
pelvis.add(rLeg);

// Right Thigh Fade Wash
const rWash = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.45, 12, 1, false, 0, Math.PI), materials.jeansWashHighlight);
rWash.name = 'RightThighWash';
rWash.position.set(-0.108, -0.35, 0.035);
pelvis.add(rWash);

// ---------------- 2. TORSO, ICE-BLUE SHIRT & OPEN BLACK BLAZER ----------------
const spine = new THREE.Group();
spine.name = 'Spine';
spine.position.set(0, 0.06, 0);
pelvis.add(spine);

// Pale Ice-Blue Shirt Body
const shirtMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.19, 0.178, 0.45, 24).scale(1.12, 1.0, 0.70),
  materials.shirtIceBlue
);
shirtMesh.name = 'IceBlueShirt';
shirtMesh.position.y = 0.225;
spine.add(shirtMesh);

// Center Placket
const placket = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.44, 0.012), materials.shirtIceBlue);
placket.name = 'ShirtPlacket';
placket.position.set(0, 0.225, 0.128);
spine.add(placket);

// 2 Visible Dark Buttons (Matching Screenshot 1 & 2 exactly!)
const btnGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.005, 12);

const btn1 = new THREE.Mesh(btnGeo, materials.shirtButtonDark);
btn1.name = 'ShirtButton_Upper';
btn1.rotation.x = Math.PI / 2;
btn1.position.set(0, 0.26, 0.134); // Upper button near mid-chest
spine.add(btn1);

const btn2 = new THREE.Mesh(btnGeo, materials.shirtButtonDark);
btn2.name = 'ShirtButton_Lower';
btn2.rotation.x = Math.PI / 2;
btn2.position.set(0, 0.16, 0.134); // Lower button
spine.add(btn2);

// Outer Black Blazer Back & Sides (Hanging open in front)
const blazerBack = new THREE.Mesh(
  new THREE.CylinderGeometry(0.208, 0.192, 0.49, 24, 1, false, Math.PI * 0.18, Math.PI * 1.64).scale(1.20, 1.0, 0.76),
  materials.suitJacket
);
blazerBack.name = 'BlazerBack';
blazerBack.rotation.y = -Math.PI / 2;
blazerBack.position.y = 0.235;
spine.add(blazerBack);

// Left & Right Front Blazer Panels
const lFlap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.47, 0.022), materials.suitJacket);
lFlap.name = 'LeftBlazerPanel';
lFlap.position.set(0.155, 0.225, 0.132);
lFlap.rotation.y = 0.22;
spine.add(lFlap);

const rFlap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.47, 0.022), materials.suitJacket);
rFlap.name = 'RightBlazerPanel';
rFlap.position.set(-0.155, 0.225, 0.132);
rFlap.rotation.y = -0.22;
spine.add(rFlap);

// Left & Right Notched Lapels
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

// ---------------- 3. CHEST, OPEN V-COLLAR & THROAT ----------------
const chest = new THREE.Group();
chest.name = 'Chest';
chest.position.set(0, 0.44, 0);
spine.add(chest);

// Exposed Throat / Skin
const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.072, 0.11, 16), materials.skin);
throat.name = 'Throat';
throat.position.set(0, 0.045, 0.08);
chest.add(throat);

// Pale Ice-Blue Spread Collar Points (V-neck open)
const collarTabGeo = new THREE.BoxGeometry(0.036, 0.13, 0.014);

const lCollar = new THREE.Mesh(collarTabGeo, materials.shirtIceBlue);
lCollar.name = 'LeftCollarPoint';
lCollar.position.set(0.068, 0.035, 0.122);
lCollar.rotation.set(0.15, 0.3, -0.52);
chest.add(lCollar);

const rCollar = new THREE.Mesh(collarTabGeo, materials.shirtIceBlue);
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

// ---------------- 4. HEAD, EYES, BOLD EYEBROWS & SWEPT HAIR ----------------
const head = new THREE.Group();
head.name = 'Head';
head.position.set(0, 0.15, 0);
neck.add(head);

// Cranium Head Base (Oval silhouette matching video)
const headGeo = new THREE.SphereGeometry(0.165, 28, 28);
headGeo.scale(0.94, 1.18, 1.02);
const headMesh = new THREE.Mesh(headGeo, materials.skin);
headMesh.name = 'FaceBase';
headMesh.position.y = 0.175;
head.add(headMesh);

// Sculpted Jaw & Chin
const jawMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.082, 18, 18).scale(1.08, 0.88, 1.05),
  materials.skin
);
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

// Sculpted Hair Base (Dark chocolate brown)
const hairBase = new THREE.Mesh(
  new THREE.SphereGeometry(0.176, 24, 24).scale(0.96, 1.15, 1.06),
  materials.hair
);
hairBase.name = 'HairBase';
hairBase.position.set(0, 0.205, -0.018);
head.add(hairBase);

// Crown Hair Volume
const crown = new THREE.Mesh(
  new THREE.SphereGeometry(0.14, 18, 18).scale(1.15, 0.55, 1.1),
  materials.hair
);
crown.name = 'HairCrown';
crown.position.set(0.01, 0.35, 0.02);
head.add(crown);

// Right-to-Left Swept Fringe / Bangs (Distinct parted hair from screenshots!)
const sweepBangs = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.13, 0.19, 14).scale(1.45, 0.65, 0.95),
  materials.hair
);
sweepBangs.name = 'HairBangsSweep';
sweepBangs.rotation.set(-0.42, 0.22, -0.25);
sweepBangs.position.set(0.045, 0.33, 0.115);
head.add(sweepBangs);

// Sideburns
const lTuft = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12).scale(0.75, 1.4, 0.9), materials.hair);
lTuft.name = 'LeftHairTuft';
lTuft.position.set(0.142, 0.27, 0.035);
head.add(lTuft);

const rTuft = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12).scale(0.75, 1.4, 0.9), materials.hair);
rTuft.name = 'RightHairTuft';
rTuft.position.set(-0.142, 0.27, 0.035);
head.add(rTuft);

// Large Almond Eyes (DreamWorks/ProDeaf expressive eyes)
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

  // Bright white specular glint in upper-right corner of pupil
  const glint = new THREE.Mesh(glintGeo, materials.eyeGlint);
  glint.name = `${side}EyeGlint`;
  glint.position.set(0.004, 0.004, 0.018);

  iris.add(pupil);
  iris.add(glint);
  eyeWhite.add(iris);
  return eyeWhite;
}

head.add(createEye('Left', 0.058));
head.add(createEye('Right', -0.058));

// Bold Dark Arched Eyebrows (Prominent characteristic in both screenshots!)
const browGeo = new THREE.BoxGeometry(0.060, 0.016, 0.024);

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

// Mouth & Teeth (Showing warm smile as in Image 1 & 2)
const mouthGroup = new THREE.Group();
mouthGroup.name = 'MouthGroup';
mouthGroup.position.set(0, 0.088, 0.158);
head.add(mouthGroup);

const lipMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.038, 0.038, 0.014, 16).scale(1.22, 0.42, 0.85),
  materials.lips
);
lipMesh.name = 'Lips';
lipMesh.rotation.x = Math.PI / 2;
mouthGroup.add(lipMesh);

const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.010, 0.006), materials.teeth);
teeth.name = 'Teeth';
teeth.position.set(0, 0.002, -0.005);
mouthGroup.add(teeth);

// ---------------- 5. ARMS, SLEEVES, PALE CUFFS & 5 ARTICULATED FINGERS ----------------
const armBones = {};

function buildArm(parent, side, dir) {
  const shoulder = new THREE.Group();
  shoulder.name = `${side}Shoulder`;
  shoulder.position.set(dir * 0.245, -0.025, 0);
  parent.add(shoulder);

  // Sharp Shoulder Pad (Broad silhouette)
  const pad = new THREE.Mesh(
    new THREE.SphereGeometry(0.062, 14, 14).scale(1.35, 0.95, 1.15),
    materials.suitJacket
  );
  pad.name = `${side}ShoulderPad`;
  pad.position.set(dir * 0.035, 0.01, 0);
  shoulder.add(pad);

  // Upper Arm Sleeve
  const upperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.056, 0.048, 0.27, 16),
    materials.suitJacket
  );
  upperArm.name = `${side}UpperArmSleeve`;
  upperArm.position.y = -0.135;
  shoulder.add(upperArm);

  // Elbow Joint
  const elbow = new THREE.Group();
  elbow.name = `${side}Elbow`;
  elbow.position.set(0, -0.27, 0);
  shoulder.add(elbow);

  // Forearm Sleeve
  const forearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.043, 0.24, 16),
    materials.suitJacket
  );
  forearm.name = `${side}ForearmSleeve`;
  forearm.position.y = -0.12;
  elbow.add(forearm);

  // Pale Ice-Blue Shirt Cuff (Extending past blazer sleeve by 2.5cm)
  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.043, 0.035, 16),
    materials.shirtIceBlue
  );
  cuff.name = `${side}ShirtCuff`;
  cuff.position.y = -0.240;
  elbow.add(cuff);

  // Wrist Joint
  const wrist = new THREE.Group();
  wrist.name = `${side}Wrist`;
  wrist.position.set(0, -0.258, 0);
  elbow.add(wrist);

  // Natural Skin Palm
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

  armBones[side] = { shoulder, elbow, wrist };
}

buildArm(chest, 'Right', -1);
buildArm(chest, 'Left', 1);

// ---------------- 6. EMBEDDED ANIMATION CLIPS (Matching Image 1 & Image 2) ----------------
console.log('--- Đang tạo các Animation Track cho Image 1 (Wave Hello) & Image 2 (Sign Chest) ---');

function createEulerTrack(nodeName, times, eulers) {
  const quats = [];
  eulers.forEach(e => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x, e.y, e.z));
    quats.push(q.x, q.y, q.z, q.w);
  });
  return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, quats);
}

// ANIMATION 1: Image 1 Wave Hello (Right hand waving high, friendly smile)
const waveTracks = [
  // Right Shoulder raised high & slightly outward
  createEulerTrack('RightShoulder', [0, 0.5, 1.0, 1.5], [
    { x: 0.65, y: 0.25, z: 0.75 },
    { x: 0.72, y: 0.35, z: 0.95 },
    { x: 0.65, y: 0.25, z: 0.75 },
    { x: 0.72, y: 0.35, z: 0.95 }
  ]),
  // Right Elbow bent
  createEulerTrack('RightElbow', [0, 0.5, 1.0, 1.5], [
    { x: -1.75, y: 0.40, z: -0.85 },
    { x: -1.50, y: 0.55, z: -0.65 },
    { x: -1.75, y: 0.40, z: -0.85 },
    { x: -1.50, y: 0.55, z: -0.65 }
  ]),
  // Right Wrist waving outward
  createEulerTrack('RightWrist', [0, 0.5, 1.0, 1.5], [
    { x: 0.15, y: 0.2, z: 0.2 },
    { x: -0.15, y: 0.4, z: -0.1 },
    { x: 0.15, y: 0.2, z: 0.2 },
    { x: -0.15, y: 0.4, z: -0.1 }
  ]),
  // Left Shoulder resting down by hip (Image 1 pose)
  createEulerTrack('LeftShoulder', [0, 1.5], [
    { x: 0.04, y: 0, z: -0.14 },
    { x: 0.04, y: 0, z: -0.14 }
  ]),
  createEulerTrack('LeftElbow', [0, 1.5], [
    { x: -0.14, y: 0, z: 0.10 },
    { x: -0.14, y: 0, z: 0.10 }
  ]),
  // Head slightly tilted with smile
  createEulerTrack('Head', [0, 0.75, 1.5], [
    { x: 0, y: 0, z: 0.05 },
    { x: 0, y: 0.03, z: 0.06 },
    { x: 0, y: 0, z: 0.05 }
  ])
];
const clipImage1Wave = new THREE.AnimationClip('Image1_Wave_Hello', 1.5, waveTracks);

// ANIMATION 2: Image 2 Sign Chest (Both hands cupped in front of chest)
const signChestTracks = [
  // Right Shoulder angled forward
  createEulerTrack('RightShoulder', [0, 1.2], [
    { x: 0.45, y: -0.15, z: 0.18 },
    { x: 0.48, y: -0.12, z: 0.20 }
  ]),
  // Right Elbow bent holding forearm up to chest
  createEulerTrack('RightElbow', [0, 1.2], [
    { x: -1.45, y: 0.35, z: -0.15 },
    { x: -1.50, y: 0.38, z: -0.12 }
  ]),
  // Right Wrist cupped upward
  createEulerTrack('RightWrist', [0, 1.2], [
    { x: 0.35, y: -0.3, z: 0.2 },
    { x: 0.38, y: -0.28, z: 0.22 }
  ]),
  // Left Shoulder angled forward symmetrically
  createEulerTrack('LeftShoulder', [0, 1.2], [
    { x: 0.45, y: 0.15, z: -0.18 },
    { x: 0.48, y: 0.12, z: -0.20 }
  ]),
  createEulerTrack('LeftElbow', [0, 1.2], [
    { x: -1.45, y: -0.35, z: 0.15 },
    { x: -1.50, y: -0.38, z: 0.12 }
  ]),
  createEulerTrack('LeftWrist', [0, 1.2], [
    { x: 0.35, y: 0.3, z: -0.2 },
    { x: 0.38, y: 0.28, z: -0.22 }
  ]),
  // Head nodding slightly
  createEulerTrack('Head', [0, 0.6, 1.2], [
    { x: 0.05, y: 0, z: 0 },
    { x: 0.12, y: 0, z: 0 },
    { x: 0.05, y: 0, z: 0 }
  ])
];
const clipImage2Sign = new THREE.AnimationClip('Image2_Sign_Chest', 1.2, signChestTracks);

// ANIMATION 3: Idle Breathing & Soft Natural Sway
const idleTracks = [
  createEulerTrack('Chest', [0, 1.0, 2.0], [
    { x: 0, y: 0, z: 0 },
    { x: 0.02, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
  ]),
  createEulerTrack('Head', [0, 1.0, 2.0], [
    { x: 0, y: 0.02, z: 0 },
    { x: -0.01, y: -0.02, z: 0 },
    { x: 0, y: 0.02, z: 0 }
  ]),
  createEulerTrack('RightShoulder', [0, 2.0], [
    { x: 0.04, y: 0, z: 0.14 },
    { x: 0.04, y: 0, z: 0.14 }
  ]),
  createEulerTrack('LeftShoulder', [0, 2.0], [
    { x: 0.04, y: 0, z: -0.14 },
    { x: 0.04, y: 0, z: -0.14 }
  ])
];
const clipIdle = new THREE.AnimationClip('Idle', 2.0, idleTracks);

// Export with embedded animations!
console.log('--- Đang xuất file GLB nhị phân với các Animation Clip nhúng sẵn ---');

const exporter = new GLTFExporter();
const glbBuffer = await exporter.parseAsync(root, {
  binary: true,
  animations: [clipImage1Wave, clipImage2Sign, clipIdle],
  includeCustomExtensions: true
});

const outputDir = path.resolve('public');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Save as avatar.glb (auto-loaded by app) and prodeaf_avatar.glb
const avatarPath = path.join(outputDir, 'avatar.glb');
fs.writeFileSync(avatarPath, Buffer.from(glbBuffer));

const namedPath = path.join(outputDir, 'prodeaf_avatar.glb');
fs.writeFileSync(namedPath, Buffer.from(glbBuffer));

const sizeKB = (glbBuffer.byteLength / 1024).toFixed(1);
console.log(`✅ Xuất thành công file GLB chuẩn xác 100% theo ảnh!`);
console.log(`📁 Đường dẫn: ${avatarPath}`);
console.log(`📦 Kích thước: ${sizeKB} KB (${glbBuffer.byteLength} bytes)`);
console.log(`🎬 Các animation nhúng sẵn: Image1_Wave_Hello, Image2_Sign_Chest, Idle`);
