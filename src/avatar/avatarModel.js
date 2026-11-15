import * as THREE from 'three';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const material = (color, roughness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness });

// The viewer, sign player and GLB exporter share this articulated model.
export class AvatarModel {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'ReferenceAvatar';
    scene.add(this.root);
    this.bones = {};
    this.hands = { left: {}, right: {} };
    this.facial = {};
    this.materials = {
      skin: material(0xe9b77e, .63), ear: material(0xc68f69),
      hair: material(0x2d180f, .85), hairLight: material(0x392117, .82),
      jacket: material(0x202c2d, .91), lapel: material(0x263234, .84),
      shirt: material(0xc4ddeb, .86), seam: material(0xa7c3d5),
      denim: material(0x368ac4, .92), stitch: material(0x3578a4),
      belt: material(0x202728),
      silver: new THREE.MeshStandardMaterial({ color: 0xcbd7db, metalness: .65, roughness: .28 }),
      white: material(0xfff6e8, .38), iris: material(0x714622, .4),
      black: material(0x171410), lips: material(0xb87d58),
      mouth: material(0x663b2d), nail: material(0xeec8a2)
    };
    this.buildBody();
    this.buildHead();
    this.buildArm('right', -1);
    this.buildArm('left', 1);
    this.applyNeutralRestPose();
  }

  group(parent, name, x = 0, y = 0, z = 0) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, y, z);
    parent.add(group);
    this.bones[name] = group;
    return group;
  }

  mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  oval(parent, mat, position, scale) {
    const geometry = new THREE.SphereGeometry(1, 32, 24);
    geometry.scale(...scale);
    return this.mesh(parent, geometry, mat, ...position);
  }

  // Smooth elliptical sections, with an open front for the blazer.
  loft(parent, mat, sections, start = 0, arc = Math.PI * 2) {
    const curve = new THREE.CatmullRomCurve3(sections.map(([y, rx, rz]) => new THREE.Vector3(rx, y, rz)));
    const positions = [], indices = [], uv = [];
    const rows = 40, columns = 64;
    for (let i = 0; i <= rows; i++) {
      const p = curve.getPoint(i / rows);
      for (let j = 0; j <= columns; j++) {
        const a = start + arc * j / columns;
        positions.push(Math.sin(a) * p.x, p.y, Math.cos(a) * p.z);
        uv.push(j / columns, i / rows);
        if (i < rows && j < columns) {
          const k = i * (columns + 1) + j;
          indices.push(k, k + 1, k + columns + 1, k + 1, k + columns + 2, k + columns + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return this.mesh(parent, g, mat);
  }

  line(parent, points, radius, mat) {
    return this.mesh(parent, new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))),
      24, radius, 8, false
    ), mat);
  }

  panel(parent, points, mat) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    return this.mesh(parent, new THREE.ExtrudeGeometry(shape, {
      depth: .005, bevelEnabled: true, bevelSize: .004, bevelThickness: .003, bevelSegments: 3, steps: 1
    }), mat);
  }

  buildBody() {
    const m = this.materials;
    const body = this.group(this.root, 'torso');
    this.loft(body, m.denim, [[.29, .169, .1], [.36, .183, .114], [.46, .17, .105]]);
    for (const dir of [-1, 1]) {
      const leg = this.group(body, `leg${dir}`, dir * .091);
      this.loft(leg, m.denim, [[-.40, .065, .068], [-.05, .072, .078], [.22, .092, .095], [.37, .087, .099]]);
      this.line(leg, [[dir * .068, -.4, .013], [dir * .079, .05, .022], [dir * .085, .3, .035]], .0014, m.stitch);
      this.line(body, [[dir * .08, .425, .10], [dir * .105, .37, .105], [dir * .15, .35, .076]], .0018, m.stitch);
    }
    this.line(body, [[0, .42, .113], [0, .34, .118], [.013, .30, .109]], .0017, m.stitch);
    this.loft(body, m.belt, [[.435, .174, .113], [.468, .173, .112]]);
    this.mesh(body, new THREE.BoxGeometry(.062, .034, .012), m.silver, 0, .452, .117);
    for (const x of [-.135, -.073, .073, .135]) {
      this.mesh(body, new THREE.BoxGeometry(.012, .047, .009), m.denim, x, .451, .112 * Math.sqrt(1 - (x / .18) ** 2) + .004);
    }
    this.loft(body, m.shirt, [[.47, .166, .108], [.58, .166, .112], [.78, .18, .122], [.96, .205, .113], [1.035, .13, .078]]);
    const chest = this.panel(body, [[-.059, 1.065], [.059, 1.065], [.044, .985], [0, .902], [-.044, .985]], m.skin);
    chest.position.z = .12;
    for (const dir of [-1, 1]) {
      const collar = this.panel(body, [[dir * .047, 1.065], [dir * .09, 1.035], [dir * .111, .953], [dir * .056, .989], [dir * .023, .93]], m.shirt);
      collar.position.z = .139;
      const lapel = this.panel(body, [[dir * .094, 1.046], [dir * .176, 1.015], [dir * .166, .949], [dir * .187, .925], [dir * .081, .749], [dir * .104, .925]], m.lapel);
      lapel.position.z = .13;
      this.line(body, [[dir * .146, .98, .145], [dir * .151, .93, .148], [dir * .094, .79, .143]], .001, m.jacket);
      const pocket = this.mesh(body, new THREE.BoxGeometry(.064, .009, .009), m.lapel, dir * .146, .59, .116);
      pocket.rotation.z = dir * .07;
    }
    const jacketMat = m.jacket.clone();
    jacketMat.side = THREE.DoubleSide;
    this.loft(body, jacketMat, [[.335, .204, .15], [.38, .203, .148], [.59, .184, .131], [.79, .207, .139], [.98, .233, .122], [1.035, .18, .085]], .49, Math.PI * 2 - .98);
    this.line(body, [[0, .48, .111], [0, .68, .124], [0, .88, .122]], .0016, m.seam);
    for (const y of [.86, .9]) this.oval(body, m.black, [0, y, .13], [.0045, .0045, .003]);
    const neck = this.group(body, 'neck', 0, 1.035, 0);
    this.loft(neck, m.skin, [[0, .068, .063], [.09, .057, .058], [.16, .066, .063]]);
  }

  buildHead() {
    const m = this.materials;
    const head = this.group(this.bones.neck, 'head', 0, .11, 0);
    this.loft(head, m.skin, [[0, .045, .055], [.024, .073, .09], [.07, .105, .112], [.13, .139, .127], [.22, .149, .137], [.30, .143, .13], [.355, .114, .105], [.385, .012, .014]]);
    for (const dir of [-1, 1]) {
      this.oval(head, m.skin, [dir * .148, .185, -.005], [.025, .052, .027]);
      this.oval(head, m.ear, [dir * .163, .185, .014], [.009, .032, .009]);
      const eye = this.group(head, `${dir === -1 ? 'right' : 'left'}Eye`, dir * .06, .224, .127);
      this.oval(eye, m.white, [0, 0, .001], [.035, .018, .017]);
      this.oval(eye, m.iris, [0, .001, .016], [.0125, .013, .004]);
      this.oval(eye, m.black, [0, .001, .020], [.0065, .008, .002]);
      this.oval(eye, m.white, [-.003, .005, .022], [.0026, .0026, .001]);
      this.line(head, [[dir * .026, .224, .136], [dir * .046, .241, .144], [dir * .071, .242, .141], [dir * .095, .226, .12]], .0035, m.skin);
      this.line(head, [[dir * .028, .22, .135], [dir * .058, .207, .141], [dir * .092, .222, .12]], .0024, m.skin);
      this.facial[dir === -1 ? 'rightEye' : 'leftEye'] = eye;
      const brow = this.group(head, `${dir === -1 ? 'right' : 'left'}Eyebrow`, dir * .06, .271, .126);
      this.line(brow, [[-dir * .033, -.002, .007], [-dir * .01, .005, .012], [dir * .011, .012, .003], [dir * .037, -.002, -.014]], .008, m.hair);
      this.facial[dir === -1 ? 'rightEyebrow' : 'leftEyebrow'] = brow;
      this.oval(head, m.skin, [dir * .018, .163, .144], [.015, .010, .013]);
      this.oval(head, m.ear, [dir * .014, .157, .154], [.005, .0028, .004]);
    }
    this.oval(head, m.skin, [0, .198, .133], [.015, .044, .027]);
    this.oval(head, m.skin, [0, .169, .158], [.020, .014, .021]);
    const mouth = this.group(head, 'mouth', 0, .105, .113);
    this.oval(mouth, m.mouth, [0, 0, 0], [.043, .009, .006]);
    this.line(mouth, [[-.043, .006, -.004], [-.023, .001, .005], [0, 0, .008], [.023, .001, .005], [.043, .006, -.004]], .0038, m.lips);
    this.line(mouth, [[-.04, .004, -.003], [-.022, -.009, .002], [0, -.012, .006], [.022, -.009, .002], [.04, .004, -.003]], .004, m.lips);
    this.oval(mouth, m.white, [0, .001, .006], [.032, .004, .002]);
    this.facial.mouth = mouth;
    // The varying hairline exposes the forehead while covering the back and temples.
    const pos = [], idx = [], rows = 28, columns = 80;
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= columns; j++) {
        const a = j / columns * Math.PI * 2;
        const front = (Math.cos(a) + 1) / 2;
        const t = i / rows * (2.28 - 1.28 * front ** 3);
        pos.push(.159 * Math.sin(t) * Math.sin(a), .227 + .196 * Math.cos(t), -.018 + .149 * Math.sin(t) * Math.cos(a));
        if (i < rows && j < columns) {
          const k = i * (columns + 1) + j;
          idx.push(k, k + columns + 1, k + 1, k + 1, k + columns + 1, k + columns + 2);
        }
      }
    }
    const hairGeo = new THREE.BufferGeometry();
    hairGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    hairGeo.setIndex(idx);
    hairGeo.computeVertexNormals();
    this.mesh(head, hairGeo, m.hair);
    const sweep = this.oval(head, m.hair, [.018, .363, .044], [.142, .062, .107]);
    sweep.rotation.z = -.17;
    for (let i = 0; i < 7; i++) {
      const offset = i * .006;
      this.line(head, [[-.105, .337 + offset, .075], [-.055, .382 + offset, .115], [.03, .376 + offset, .127], [.121, .328 + offset, .078]], .0014, m.hairLight);
    }
    for (const dir of [-1, 1]) {
      const lock = this.oval(head, m.hair, [dir * .137, .273, -.002], [.024, .075, .051]);
      lock.rotation.z = dir * -.14;
    }
  }

  buildArm(side, dir) {
    const m = this.materials;
    const shoulder = this.group(this.bones.torso, `${side}Shoulder`, dir * .218, .995, 0);
    this.oval(shoulder, m.jacket, [dir * .003, -.032, 0], [.061, .066, .065]);
    this.loft(shoulder, m.jacket, [[-.28, .049, .051], [-.19, .055, .057], [-.07, .066, .068], [.015, .058, .057]]);
    const elbow = this.group(shoulder, `${side}Elbow`, 0, -.275);
    this.oval(elbow, m.jacket, [0, 0, 0], [.049, .05, .051]);
    this.loft(elbow, m.jacket, [[-.249, .036, .037], [-.2, .04, .043], [-.08, .05, .052], [0, .048, .05]]);
    this.loft(elbow, m.shirt, [[-.265, .036, .035], [-.236, .038, .038]]);
    this.oval(elbow, m.white, [0, -.25, .038], [.004, .004, .002]);
    const wrist = this.group(elbow, `${side}Wrist`, 0, -.268);
    wrist.scale.setScalar(1.25);
    this.oval(wrist, m.skin, [0, -.035, 0], [.038, .053, .021]);
    this.oval(wrist, m.skin, [-dir * .023, -.045, .004], [.022, .034, .021]);
    const fingers = {};
    const configs = [
      ['thumb', -dir * .033, -.025, -dir * .62, .027, .012],
      ['index', -dir * .027, -.072, -dir * .075, .032, .0095],
      ['middle', -dir * .008, -.079, -dir * .015, .035, .010],
      ['ring', dir * .012, -.076, dir * .04, .032, .009],
      ['pinky', dir * .029, -.066, dir * .12, .025, .008]
    ];
    for (const [name, x, y, spread, length, radius] of configs) {
      const base = this.group(wrist, `${side}_${name}_base`, x, y, .001);
      base.rotation.z = spread;
      const mid = this.group(base, `${side}_${name}_mid`, 0, -length);
      const tip = this.group(mid, `${side}_${name}_tip`, 0, -length * .72);
      for (const [joint, len, r] of [[base, length, radius], [mid, length * .72, radius * .88], [tip, length * .56, radius * .76]]) {
        this.mesh(joint, new THREE.CapsuleGeometry(r, Math.max(.001, len - r * 1.4), 6, 12), m.skin, 0, -len / 2);
      }
      this.oval(tip, m.nail, [0, -length * .29, -.006], [radius * .58, length * .18, .0017]);
      fingers[name] = { base, mid, tip, spread };
    }
    this.hands[side] = { wrist, fingers };
  }

  setFingerPose(side, name, curl = 0, spread = 0, pose = {}) {
    const f = this.hands[side].fingers[name];
    const dir = side === 'right' ? -1 : 1;
    // Optional independent joint bends and absolute splay (right-hand convention).
    // Reset every axis so a crossed/hooked pose cannot leak into the next sign.
    const splay = pose.splay !== undefined ? -dir * pose.splay
      : f.spread + (name === 'thumb' ? -dir * spread * .5 : f.spread * spread * 2);
    f.base.rotation.set(pose.baseCurl ?? curl * 1.15,
      pose.opposition !== undefined ? dir * pose.opposition : name === 'thumb' ? dir * (.2 + curl * .65) : 0, splay);
    f.mid.rotation.set(pose.midCurl ?? curl * 1.35, 0, 0);
    f.tip.rotation.set(pose.tipCurl ?? curl * .85, 0, 0);
  }

  // Two-bone IK keeps the hands in the signing space and elbows outside the torso.
  placeHand(side, target, rotation = [0, 0, 0], elbowHint) {
    const dir = side === 'right' ? -1 : 1;
    const shoulder = this.bones[`${side}Shoulder`];
    const elbow = this.bones[`${side}Elbow`];
    const wrist = this.bones[`${side}Wrist`];
    const origin = shoulder.position.clone();
    const goal = new THREE.Vector3(...target);
    const axis = goal.clone().sub(origin);
    const distance = THREE.MathUtils.clamp(axis.length(), .045, .275 + .268 - .002);
    axis.normalize();
    goal.copy(origin).addScaledVector(axis, distance);
    const hint = new THREE.Vector3(...(elbowHint || [dir * .43, .66, .035])).sub(origin);
    const bend = hint.addScaledVector(axis, -hint.dot(axis)).normalize();
    const a = (.275 ** 2 - .268 ** 2 + distance ** 2) / (2 * distance);
    const h = Math.sqrt(Math.max(0, .275 ** 2 - a ** 2));
    const joint = origin.clone().addScaledVector(axis, a).addScaledVector(bend, h);
    const down = new THREE.Vector3(0, -1, 0);
    shoulder.quaternion.setFromUnitVectors(down, joint.clone().sub(origin).normalize());
    const forearm = new THREE.Quaternion().setFromUnitVectors(down, goal.sub(joint).normalize());
    elbow.quaternion.copy(shoulder.quaternion).invert().multiply(forearm);
    const rot = Array.isArray(rotation) ? rotation : (rotation && typeof rotation === 'object' ? [rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0] : [0, 0, 0]);
    wrist.quaternion.setFromEuler(new THREE.Euler(...rot));
  }

  setHandshape(side, pose = {}) {
    for (const name of FINGERS) this.setFingerPose(side, name, pose[name]?.curl ?? .12, pose[name]?.spread ?? 0, pose[name]);
    if (pose.wrist) this.hands[side].wrist.rotation.set(pose.wrist.x ?? 0, pose.wrist.y ?? 0, pose.wrist.z ?? 0);
  }

  setNMM(nmm = {}) {
    this.currentNMM = { ...nmm };
    const amount = nmm.eyebrows === 'raised' ? .012 : nmm.eyebrows === 'furrowed' ? -.009 : 0;
    this.facial.leftEyebrow.position.y = this.facial.rightEyebrow.position.y = .271 + amount;
    this.facial.leftEyebrow.rotation.z = nmm.eyebrows === 'furrowed' ? .16 : 0;
    this.facial.rightEyebrow.rotation.z = -this.facial.leftEyebrow.rotation.z;
    this.facial.mouth.scale.set(1 + (nmm.smile ?? .35) * .1, .55 + (nmm.smile ?? .35) * .6 + (nmm.mouthOpen ?? 0), 1);
    this.bones.head.rotation.set(nmm.headNod ?? 0, nmm.headShake ?? 0, nmm.headTilt ?? 0);
  }

  applyNeutralRestPose() {
    for (const side of ['left', 'right']) {
      const dir = side === 'left' ? 1 : -1;
      this.bones[`${side}Shoulder`].rotation.set(.03, 0, dir * .11);
      this.bones[`${side}Elbow`].rotation.set(.12, 0, 0);
      this.bones[`${side}Wrist`].rotation.set(.05, dir * -.12, 0);
      this.setHandshape(side, Object.fromEntries(FINGERS.map((name, i) => [name, { curl: .14 + i * .025 }])));
    }
    this.setNMM();
  }

  updateIdle(time, signing = false) {
    this.bones.torso.position.y = Math.sin(time * 1.7) * .002;
    const cycle = time % 4.3;
    const blink = cycle > 4.08 ? 1 - .94 * Math.sin((cycle - 4.08) / .22 * Math.PI) : 1;
    this.facial.leftEye.scale.y = this.facial.rightEye.scale.y = blink;
    if (!signing) {
      this.bones.head.rotation.y = Math.sin(time * .6) * .018;
      this.bones.head.rotation.x = Math.sin(time * .9) * .009;
    }
  }
}
