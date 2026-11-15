import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { inspectAnimation, compatibleClip } from './avatar/externalAnimation.js';

const ui = Object.fromEntries(['motion-file', 'clip', 'speed', 'play', 'restart', 'target', 'source', 'status', 'report', 'details', 'viewport'].map(id => [id, document.getElementById(id)]));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#eef2f6');
scene.add(new THREE.HemisphereLight(0xffffff, 0x687386, 2));
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(2, 4, 3);
scene.add(light);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
ui.viewport.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
new ResizeObserver(() => {
  const { clientWidth: width, clientHeight: height } = ui.viewport;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}).observe(ui.viewport);

let source, target, wrapper, helper, mixer, action, clips = [], version = 0, fileName = '', report;
let sourcePose = [], targetPose = [];
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  mixer?.update(Math.min(clock.getDelta(), 0.05));
  controls.update();
  renderer.render(scene, camera);
}
frame();
const setStatus = text => { ui.status.textContent = text; };
function pose(root) {
  const result = [];
  root.traverse(node => result.push([node, node.position.clone(), node.quaternion.clone(), node.scale.clone()]));
  return result;
}
function restore(saved) {
  for (const [node, p, q, s] of saved) { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(s); }
}
function stop() {
  if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); }
  mixer = action = null;
  restore(sourcePose); restore(targetPose);
  if (helper) { scene.remove(helper); helper.dispose(); helper = null; }
  if (wrapper) {
    scene.remove(wrapper);
    // Restore original model coordinates after preview normalization.
    for (const child of [...wrapper.children]) wrapper.remove(child);
    wrapper = null;
  }
}
function dispose(root) {
  root?.traverse(node => {
    node.geometry?.dispose();
    for (const material of [node.material].flat().filter(Boolean)) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}
function display(root, clip) {
  stop();
  wrapper = new THREE.Group();
  wrapper.add(root);
  scene.add(wrapper);
  root.updateMatrixWorld(true);
  // Include joints even when the FBX has no mesh.
  const box = new THREE.Box3().setFromObject(root);
  root.traverse(node => { if (node.isBone) box.expandByPoint(node.getWorldPosition(new THREE.Vector3())); });
  const height = box.max.y - box.min.y;
  if (!Number.isFinite(height) || height < 0.001) throw new Error('Không xác định được kích thước khung xương.');
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.8 / height;
  wrapper.scale.setScalar(scale);
  wrapper.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  wrapper.updateMatrixWorld(true);
  helper = new THREE.SkeletonHelper(root);
  helper.material.depthTest = false;
  helper.renderOrder = 10;
  scene.add(helper);
  camera.position.set(0, 1.2, 3.6);
  controls.target.set(0, 0.95, 0);
  controls.update();
  mixer = new THREE.AnimationMixer(root);
  mixer.timeScale = Number(ui.speed.value);
  action = mixer.clipAction(clip);
  action.play();
  ui.play.textContent = 'Tạm dừng';
}
function showSource() {
  try {
    display(source, clips[Number(ui.clip.value)]);
    setStatus('Đang xem chuyển động trên khung xương gốc. Chưa xác nhận nội dung ASL.');
  } catch (error) { stop(); setStatus(error.message); }
}
function check() {
  stop();
  const clip = clips[Number(ui.clip.value)];
  const inspection = inspectAnimation(source, clip);
  const compatibility = target ? compatibleClip(source, target, clip) : { issues: ['Chưa tải được nhân vật Vest.'] };
  report = { file: fileName, ...inspection, target: 'Vest', issues: compatibility.issues,
    aslVerified: false, dictionaryImported: false };
  ui.details.textContent = JSON.stringify(report, null, 2);
  ui.target.disabled = !compatibility.clip;
  return compatibility.clip;
}
async function loadFile(file) {
  if (!file) return;
  const current = ++version;
  stop(); dispose(source); source = null; sourcePose = []; clips = []; report = null;
  ui.clip.replaceChildren();
  for (const id of ['clip', 'play', 'restart', 'target', 'source', 'report']) ui[id].disabled = true;
  ui.details.textContent = 'Đang đọc tệp…';
  setStatus('Đang nạp animation cục bộ…');
  let loaded;
  try {
    if (!/\.(fbx|glb)$/i.test(file.name)) throw new Error('Chỉ hỗ trợ FBX hoặc GLB.');
    if (file.size > 100 * 1024 * 1024) throw new Error('Tệp vượt quá giới hạn 100 MB.');
    const buffer = await file.arrayBuffer();
    // Local uploads must not cause network requests for external textures/buffers.
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => {
      if (/^(blob:|data:)/.test(url)) return url;
      throw new Error('Tệp tham chiếu tài nguyên ngoài. Hãy xuất GLB tự chứa hoặc FBX không có texture ngoài.');
    });
    if (/\.fbx$/i.test(file.name)) {
      loaded = new FBXLoader(manager).parse(buffer, '');
      loaded.userData.labClips = loaded.animations;
    } else {
      const asset = await new GLTFLoader(manager).parseAsync(buffer, '');
      loaded = asset.scene;
      loaded.userData.labClips = asset.animations;
    }
    if (current !== version) { dispose(loaded); return; }
    if (!loaded.userData.labClips.length) throw new Error('Tệp chỉ có mô hình, không có animation.');
    for (const clip of loaded.userData.labClips) inspectAnimation(loaded, clip);
    source = loaded; sourcePose = pose(source); clips = source.userData.labClips; fileName = file.name;
    clips.forEach((clip, i) => ui.clip.add(new Option(`${clip.name || `Clip ${i + 1}`} (${clip.duration.toFixed(2)}s)`, String(i))));
    ui.clip.value = '0';
    check(); showSource();
    for (const id of ['clip', 'play', 'restart', 'source', 'report']) ui[id].disabled = false;
  } catch (error) {
    if (current !== version) { dispose(loaded); return; }
    stop(); dispose(loaded); source = null; sourcePose = []; clips = [];
    setStatus(`Không nạp được: ${error.message}`);
    ui.details.textContent = 'Chưa có animation hợp lệ.';
  }
}
ui['motion-file'].addEventListener('change', event => loadFile(event.target.files[0]));
const sampleSelect = document.getElementById('sample');
const sampleButton = document.getElementById('load-sample');
const sampleBase = `${import.meta.env.BASE_URL}asl-samples/studio-galt/`;
fetch(`${sampleBase}manifest.json`).then(response => {
  if (!response.ok) throw new Error('Chưa có danh sách mẫu.');
  return response.json();
}).then(samples => {
  sampleSelect.replaceChildren();
  for (const sample of samples) {
    if (!/^[a-z0-9-]+\.fbx$/.test(sample.file)) continue;
    sampleSelect.add(new Option(sample.name, sample.file));
  }
  sampleSelect.disabled = sampleButton.disabled = !sampleSelect.options.length;
}).catch(() => { sampleSelect.replaceChildren(new Option('Chưa có mẫu cục bộ')); });
sampleButton.addEventListener('click', async () => {
  sampleButton.disabled = true;
  ui['motion-file'].disabled = true;
  try {
    setStatus('Đang mở mẫu cục bộ…');
    const filename = sampleSelect.value;
    const response = await fetch(`${sampleBase}${filename}`);
    if (!response.ok) throw new Error('Không đọc được tệp mẫu.');
    await loadFile(new File([await response.blob()], filename));
  } catch (error) { setStatus(error.message); }
  finally { sampleButton.disabled = false; ui['motion-file'].disabled = false; }
});
ui.clip.addEventListener('change', () => { check(); showSource(); });
ui.source.addEventListener('click', showSource);
ui.target.addEventListener('click', () => {
  try {
    const clip = check();
    if (!clip) { showSource(); return; }
    display(target, clip);
    setStatus('Đang thử trên Vest. Cần kiểm tra hình tay và ý nghĩa ký hiệu trước khi đưa vào từ điển.');
  } catch (error) { stop(); setStatus(error.message); }
});
ui.play.addEventListener('click', () => {
  if (!action) return;
  action.paused = !action.paused;
  ui.play.textContent = action.paused ? 'Tiếp tục' : 'Tạm dừng';
});
ui.restart.addEventListener('click', () => { action?.reset().play(); ui.play.textContent = 'Tạm dừng'; });
ui.speed.addEventListener('change', () => { if (mixer) mixer.timeScale = Number(ui.speed.value); });
ui.report.addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'animation-inspection.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}vest.glb`).then(asset => {
  target = asset.scene;
  target.traverse(node => { if (node.isMesh) node.frustumCulled = false; });
  targetPose = pose(target);
  if (source) { check(); showSource(); }
}).catch(() => setStatus('Chưa tải được Vest. Vẫn có thể xem animation trên khung xương gốc.'));
