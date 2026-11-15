import * as THREE from 'three';

const position = node => node.getWorldPosition(new THREE.Vector3());
const rotation = node => node.getWorldQuaternion(new THREE.Quaternion());
const fingerNames = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

// Transfers the signing rig's world-space rotations into a Mixamo bind pose.
// Bone translations/scales and inverse bind matrices are left intact.
export class RetargetedAvatar {
  constructor(model, driver) {
    this.root = new THREE.Group();
    this.root.name = 'ImportedSigningCharacter';
    this.root.add(model);
    this.model = model;
    this.driver = driver;
    this.bindings = [];
    this.nodes = {};
    model.traverse(node => {
      if (node.isBone) this.nodes[node.name.replace(/[^a-z0-9]/gi, '').replace(/^mixamorig/i, '')] = node;
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        // Skinned bounds change with every gesture; avoid stale T-pose culling.
        node.frustumCulled = false;

        // Restore faithful Mixamo rendering: fix hair/eyelash transparency & skin non-metal shading
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of materials) {
          if (!mat) continue;
          const matName = (mat.name || '').toLowerCase();
          const meshName = (node.name || '').toLowerCase();
          const isHairOrLash = matName.includes('hair') || meshName.includes('hair') || meshName.includes('eyelash');

          if (isHairOrLash) {
            mat.transparent = true;
            mat.opacity = 1.0;
            mat.alphaTest = 0.5;
            mat.side = THREE.DoubleSide;
            mat.depthWrite = true;
            mat.metalness = 0.0;
            mat.roughness = 0.8;
          } else {
            if (mat.metalness > 0.05) {
              mat.metalness = 0.0;
            }
            if (mat.roughness > 0.95 || mat.roughness < 0.2) {
              mat.roughness = 0.7;
            }
          }
          mat.needsUpdate = true;
        }
      }
    });
    const required = ['Head', ...['Left', 'Right'].flatMap(side => [
      `${side}Arm`, `${side}ForeArm`, `${side}Hand`,
      ...fingerNames.flatMap(finger => [1, 2, 3, 4].map(i => `${side}Hand${finger}${i}`))
    ])];
    const missing = required.filter(name => !this.nodes[name]);
    if (missing.length) throw new Error(`Thiếu khớp Mixamo: ${missing.join(', ')}`);

    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y;
    if (!Number.isFinite(height) || height < .001) throw new Error('Kích thước mô hình không hợp lệ.');
    this.root.scale.setScalar(1.9 / height);
    const center = box.getCenter(new THREE.Vector3());
    this.root.position.set(-center.x * this.root.scale.x, -.4 - box.min.y * this.root.scale.x, -center.z * this.root.scale.x);
    this.baseY = this.root.position.y;
    this.root.updateMatrixWorld(true);

    this.armChains = [];
    for (const side of ['Left', 'Right']) {
      const sourceSide = side.toLowerCase();
      const dir = side === 'Left' ? 1 : -1;
      const hand = this.nodes[`${side}Hand`];
      const across = position(this.nodes[`${side}HandIndex1`]).sub(position(this.nodes[`${side}HandPinky1`])).multiplyScalar(-dir).normalize();
      // Project the palm's transverse axis onto each segment's normal plane.
      // This resolves twist as well as swing, including the thumb's angled bind pose.
      const makeBinding = (source, target, child) => {
        const y = position(target).sub(position(child)).normalize();
        const x = across.clone().addScaledVector(y, -across.dot(y)).normalize();
        const z = new THREE.Vector3().crossVectors(x, y).normalize();
        x.crossVectors(y, z).normalize();
        const frame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        const correction = frame.invert().multiply(rotation(target));
        const b = { source, target, correction };
        this.bindings.push(b);
        return b;
      };
      const shoulder = makeBinding(driver.bones[`${sourceSide}Shoulder`], this.nodes[`${side}Arm`], this.nodes[`${side}ForeArm`]);
      const elbow = makeBinding(driver.bones[`${sourceSide}Elbow`], this.nodes[`${side}ForeArm`], hand);
      const wrist = makeBinding(driver.bones[`${sourceSide}Wrist`], hand, this.nodes[`${side}HandMiddle1`]);
      const fingers = [];
      for (const finger of fingerNames) {
        const joints = driver.hands[sourceSide].fingers[finger.toLowerCase()];
        ['base', 'mid', 'tip'].forEach((joint, i) =>
          fingers.push(makeBinding(joints[joint], this.nodes[`${side}Hand${finger}${i + 1}`], this.nodes[`${side}Hand${finger}${i + 2}`]))
        );
      }
      this.armChains.push({ side, shoulder, elbow, wrist, fingers });
    }
    this.headBind = this.nodes.Head.quaternion.clone();

    // Initialize procedural facial blendshapes for realistic expressions & natural blinking
    let bodyMesh = null;
    let eyelashesMesh = null;
    model.traverse(node => {
      if (node.isMesh && (node.name.includes('Body') || node.name.includes('Ch23_Body'))) bodyMesh = node;
      if (node.isMesh && (node.name.includes('Eyelashes') || node.name.includes('Ch23_Eyelashes'))) eyelashesMesh = node;
    });
    if (bodyMesh) this.initFacialMorphs(bodyMesh, eyelashesMesh);

    this.update();
  }

  initFacialMorphs(bodyMesh, eyelashesMesh) {
    const geo = bodyMesh.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const count = pos.count;

    const deltaSmile = new Float32Array(count * 3);
    const deltaOpen = new Float32Array(count * 3);
    const deltaRaise = new Float32Array(count * 3);
    const deltaFurrow = new Float32Array(count * 3);
    const deltaBlink = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // 1. mouthSmile: corners lift & widen organically
      if (y > 1.55 && y < 1.62 && z > 0.08 && Math.abs(x) < 0.065) {
        const sx = Math.sign(x);
        const dx = Math.abs(x) - 0.038;
        const dy = y - 1.582;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.04) {
          const w = Math.pow(1 - dist / 0.04, 2);
          deltaSmile[i * 3] = sx * w * 0.012;
          deltaSmile[i * 3 + 1] = w * 0.024;
          deltaSmile[i * 3 + 2] = w * 0.005;
        }
      }

      // 2. mouthOpen: lower lip & jaw drops
      if (y > 1.52 && y <= 1.585 && z > 0.08 && Math.abs(x) < 0.045) {
        const wx = Math.max(0, 1 - Math.abs(x) / 0.045);
        const wy = Math.max(0, 1 - Math.abs(y - 1.575) / 0.045);
        const w = wx * wy;
        if (w > 0.01) {
          deltaOpen[i * 3 + 1] = -w * 0.032;
          deltaOpen[i * 3 + 2] = -w * 0.008;
        }
      }

      // 3. browRaise: eyebrows arch upward
      if (y > 1.66 && y < 1.73 && z > 0.08 && Math.abs(x) < 0.065) {
        const dx = Math.abs(x) - 0.035;
        const dy = y - 1.685;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.042) {
          const w = Math.pow(1 - dist / 0.042, 2);
          deltaRaise[i * 3 + 1] = w * 0.025;
          deltaRaise[i * 3 + 2] = w * 0.006;
        }
      }

      // 4. browFurrow: inner brows pull down & inward
      if (y > 1.66 && y < 1.715 && z > 0.08 && Math.abs(x) < 0.045) {
        const sx = Math.sign(x);
        const wx = Math.max(0, 1 - Math.abs(x) / 0.045);
        const wy = Math.max(0, 1 - Math.abs(y - 1.685) / 0.03);
        const w = wx * wy;
        if (w > 0.01) {
          deltaFurrow[i * 3] = -sx * w * 0.014;
          deltaFurrow[i * 3 + 1] = -w * 0.020;
          deltaFurrow[i * 3 + 2] = w * 0.008;
        }
      }

      // 5. eyeBlink: upper eyelid lowers cleanly over eyeball
      if (y >= 1.635 && y <= 1.670 && z > 0.085 && Math.abs(x) > 0.015 && Math.abs(x) < 0.055) {
        const dx = Math.abs(x) - 0.035;
        const dy = y - 1.655;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.028) {
          const w = Math.pow(1 - dist / 0.028, 2);
          deltaBlink[i * 3 + 1] = -w * 0.026;
          deltaBlink[i * 3 + 2] = w * 0.006;
        }
      }
    }

    geo.morphTargetsRelative = true;
    geo.morphAttributes.position = [
      new THREE.BufferAttribute(deltaSmile, 3),
      new THREE.BufferAttribute(deltaOpen, 3),
      new THREE.BufferAttribute(deltaRaise, 3),
      new THREE.BufferAttribute(deltaFurrow, 3),
      new THREE.BufferAttribute(deltaBlink, 3)
    ];
    bodyMesh.updateMorphTargets();
    if (bodyMesh.material) bodyMesh.material.needsUpdate = true;
    this.facialMesh = bodyMesh;

    if (eyelashesMesh?.geometry?.attributes?.position) {
      const eGeo = eyelashesMesh.geometry;
      const eCount = eGeo.attributes.position.count;
      const deltaLashBlink = new Float32Array(eCount * 3);
      for (let i = 0; i < eCount; i++) {
        deltaLashBlink[i * 3 + 1] = -0.026;
        deltaLashBlink[i * 3 + 2] = 0.006;
      }
      eGeo.morphTargetsRelative = true;
      eGeo.morphAttributes.position = [new THREE.BufferAttribute(deltaLashBlink, 3)];
      eyelashesMesh.updateMorphTargets();
      if (eyelashesMesh.material) eyelashesMesh.material.needsUpdate = true;
      this.eyelashesMesh = eyelashesMesh;
    }

    this.currentSmile = 0.35;
    this.currentOpen = 0.0;
    this.currentRaise = 0.0;
    this.currentFurrow = 0.0;
    this.currentBlink = 0.0;
    this.blinkTimer = 0;
    this.nextBlinkInterval = 2.4;
  }

  update(delta = 0.016, elapsedTime = performance.now() * 0.001) {
    this.driver.root.updateMatrixWorld(true);
    this.root.position.y = this.baseY + this.driver.bones.torso.position.y;
    this.root.updateMatrixWorld(true);
    for (const chain of this.armChains) {
      // 1. Shoulder
      const desiredWorldArm = rotation(chain.shoulder.source).multiply(chain.shoulder.correction);
      chain.shoulder.target.quaternion.copy(rotation(chain.shoulder.target.parent).invert().multiply(desiredWorldArm));
      chain.shoulder.target.updateMatrixWorld(true);

      // 2. ForeArm (Elbow)
      const desiredWorldForeArm = rotation(chain.elbow.source).multiply(chain.elbow.correction);
      chain.elbow.target.quaternion.copy(rotation(chain.elbow.target.parent).invert().multiply(desiredWorldForeArm));
      chain.elbow.target.updateMatrixWorld(true);

      // 3. Wrist & Forearm Anatomical Roll Sharing
      // Skinned meshes exhibit the "candy-wrapper artifact" (zero-radius wrist pinch) when
      // linear blend skinning interpolates a large axial twist (~180°) across a single joint.
      // In human anatomy, 70-80% of pronation/supination rolls along the radius/ulna.
      // Distributing the axial twist between ForeArm (60%) and Hand (40%) keeps the relative
      // joint angle well within safe non-collapsing thresholds while preserving 100% exact
      // hand and finger world-space positions.
      const desiredWorldHand = rotation(chain.wrist.source).multiply(chain.wrist.correction);
      const handRel = rotation(chain.elbow.target).invert().multiply(desiredWorldHand);

      // Swing-twist decomposition around forearm longitudinal axis (+Y)
      let ty = handRel.y;
      let tw = handRel.w;
      if (tw < 0) { ty = -ty; tw = -tw; }
      const tLen = Math.hypot(ty, tw);
      if (tLen > 0.0001) {
        ty /= tLen;
        tw /= tLen;
        let twistAngle = 2 * Math.atan2(ty, tw);
        while (twistAngle > Math.PI) twistAngle -= 2 * Math.PI;
        while (twistAngle < -Math.PI) twistAngle += 2 * Math.PI;

        const forearmTwistAngle = twistAngle * 0.6;
        const qForearmTwist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), forearmTwistAngle);
        chain.elbow.target.quaternion.multiply(qForearmTwist);
        chain.elbow.target.updateMatrixWorld(true);
      }

      chain.wrist.target.quaternion.copy(rotation(chain.elbow.target).invert().multiply(desiredWorldHand));
      chain.wrist.target.updateMatrixWorld(true);

      // 4. Fingers
      for (const fb of chain.fingers) {
        const desiredWorld = rotation(fb.source).multiply(fb.correction);
        fb.target.quaternion.copy(rotation(fb.target.parent).invert().multiply(desiredWorld));
        fb.target.updateMatrixWorld(true);
      }
    }

    // Natural Head Micro-movement, Alive Breathing & Emotional Gestures
    if (this.nodes.Head) {
      const breath = Math.sin(elapsedTime * 2.2) * 0.015;
      const nmm = this.driver.currentNMM || {};
      const idleNod = Math.sin(elapsedTime * 1.5) * 0.02;
      const idleTilt = Math.sin(elapsedTime * 1.1) * 0.015;
      const idleShake = Math.sin(elapsedTime * 0.8) * 0.015;

      const nod = (nmm.headNod || 0) * 1.4 + breath + idleNod;
      const tilt = (nmm.headTilt || 0) * 1.4 + idleTilt;
      const shake = (nmm.headShake || 0) * 1.4 + idleShake;
      const driverHeadRot = this.driver.bones.head.rotation;

      const emotionEuler = new THREE.Euler(
        driverHeadRot.x + nod,
        driverHeadRot.y + shake,
        driverHeadRot.z + tilt,
        'YXZ'
      );
      const qEmotion = new THREE.Quaternion().setFromEuler(emotionEuler);
      this.nodes.Head.quaternion.copy(this.headBind).multiply(qEmotion);
      this.nodes.Head.updateMatrixWorld(true);
    }

    // Procedural Facial Expressions, Mouthing & Dynamic Blinking
    if (this.facialMesh?.morphTargetInfluences) {
      this.blinkTimer += delta;
      if (this.blinkTimer >= this.nextBlinkInterval) {
        const blinkProgress = (this.blinkTimer - this.nextBlinkInterval) / 0.18;
        if (blinkProgress <= 1.0) {
          this.currentBlink = Math.sin(blinkProgress * Math.PI);
        } else {
          this.currentBlink = 0;
          this.blinkTimer = 0;
          this.nextBlinkInterval = 2.2 + Math.random() * 1.6;
        }
      } else {
        this.currentBlink = 0;
      }

      const nmm = this.driver.currentNMM || {};
      const targetSmile = Math.min(1, Math.max(0, nmm.smile ?? 0.35));
      
      // Natural speech mouthing during signing or when emotion is active
      const isSigning = (nmm.emotion && nmm.emotion !== 'STATEMENT') || (nmm.mouthOpen > 0);
      const speechMouthing = isSigning ? Math.abs(Math.sin(elapsedTime * 9)) * 0.4 : 0;
      const targetOpen = Math.min(1, Math.max(0, (nmm.mouthOpen ?? 0.0) + speechMouthing));
      
      const targetRaise = nmm.eyebrows === 'raised' ? 1.0 : 0.0;
      const targetFurrow = nmm.eyebrows === 'furrowed' ? 1.0 : 0.0;

      const lerpFactor = Math.min(1, delta * 12);
      this.currentSmile = THREE.MathUtils.lerp(this.currentSmile, targetSmile, lerpFactor);
      this.currentOpen = THREE.MathUtils.lerp(this.currentOpen, targetOpen, lerpFactor);
      this.currentRaise = THREE.MathUtils.lerp(this.currentRaise, targetRaise, lerpFactor);
      this.currentFurrow = THREE.MathUtils.lerp(this.currentFurrow, targetFurrow, lerpFactor);

      this.facialMesh.morphTargetInfluences[0] = this.currentSmile;
      this.facialMesh.morphTargetInfluences[1] = this.currentOpen;
      this.facialMesh.morphTargetInfluences[2] = this.currentRaise;
      this.facialMesh.morphTargetInfluences[3] = this.currentFurrow;
      this.facialMesh.morphTargetInfluences[4] = this.currentBlink;

      if (this.eyelashesMesh?.morphTargetInfluences) {
        this.eyelashesMesh.morphTargetInfluences[0] = this.currentBlink;
      }
    }
  }
}
