import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function connect() {
  const tabs = await (await fetch('http://127.0.0.1:9223/json')).json();
  const socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
    if (pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      data.error ? reject(data.error) : resolve(data.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  return { send, evaluate, errors, close: () => socket.close() };
}

if (process.argv[2] === 'verify') {
  const c = await connect();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await c.send('Runtime.enable');
  await c.send('Page.reload');
  await wait(1800);
  for (let i = 0; i < 60 && !await c.evaluate(`!!window.signStudio?.characterAvatar`); i++) await wait(250);
  assert(await c.evaluate(`!!signStudio.characterAvatar && signStudio.currentAvatar === 'character'`), 'Imported character loads by default');
  await c.evaluate(`window.signStudio.switchPose('Idle')`);
  await c.evaluate(`document.getElementById('btn-pose-img1').click()`);
  await wait(650);
  const moving = await c.evaluate(`({angle:window.signStudio.avatar.bones.rightShoulder.rotation.z,visible:window.signStudio.characterAvatar.root.visible && !window.signStudio.avatar.root.visible})`);
  assert(moving.visible && Math.abs(moving.angle) > .3);
  await c.evaluate(`document.getElementById('pause-btn').click()`);
  const pausedTime = await c.evaluate(`window.signStudio.signEngine.currentClipTime`);
  await wait(350);
  assert.equal(await c.evaluate(`window.signStudio.signEngine.currentClipTime`), pausedTime);
  const rigChecks = await c.evaluate(`(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const rig=signStudio.characterAvatar;
    const {SIGN_CLIPS}=await import('/src/avatar/signClips.js');
    let allFinite=true;
    for(const key of Object.keys(SIGN_CLIPS)){
      signStudio.signEngine.playSequence([{type:'SIGN',clipKey:key,duration:1000}]);
      for(let i=0;i<24;i++) signStudio.signEngine.update(1/60);
      rig.update();
      rig.model.traverse(n=>{
        if(n.isBone) allFinite &&= n.matrixWorld.elements.every(Number.isFinite);
        if(n.isSkinnedMesh) {
          n.skeleton.update();
          for(let i=0;i<n.geometry.attributes.position.count;i+=113) {
            const p=n.getVertexPosition(i,new THREE.Vector3());
            allFinite &&= p.toArray().every(Number.isFinite) && p.length()<10;
          }
        }
      });
    }
    signStudio.signEngine.playSequence([{type:'FINGERSPELL',letters:['A'],duration:2000}]);
    for(let i=0;i<30;i++) signStudio.signEngine.update(1/60);
    rig.update();
    const fist=rig.nodes.RightHandIndex2.quaternion.clone();
    signStudio.signEngine.playSequence([{type:'FINGERSPELL',letters:['B'],duration:2000}]);
    for(let i=0;i<30;i++) signStudio.signEngine.update(1/60);
    rig.update();
    const fingerAngle=fist.angleTo(rig.nodes.RightHandIndex2.quaternion);
    signStudio.signEngine.isPaused=true;
    return {allFinite,fingerAngle,bindingCount:rig.bindings.length};
  })()`);
  assert(rigChecks.allFinite && rigChecks.fingerAngle > .5 && rigChecks.bindingCount === 36, 'Imported skeleton and skin deform across all signs and fingerspelling');
  await c.evaluate(`document.getElementById('pause-btn').click(); document.querySelector('[data-speed="1.25"]').click()`);
  assert.equal(await c.evaluate(`window.signStudio.signEngine.speed`), 1.25);
  await c.evaluate(`{const select=document.getElementById('character-model-select');select.value='procedural';select.dispatchEvent(new Event('change'));}`);
  assert(await c.evaluate(`signStudio.avatar.root.visible && !signStudio.characterAvatar.root.visible`));
  await c.evaluate(`{const select=document.getElementById('character-model-select');select.value='character';select.dispatchEvent(new Event('change'));}`);
  assert(await c.evaluate(`!signStudio.avatar.root.visible && signStudio.characterAvatar.root.visible`));
  await c.evaluate(`window.signStudio.processUtterance('Hello'); window.signStudio.processUtterance('I love you')`);
  await wait(550);
  assert.equal(await c.evaluate(`window.signStudio.lastOriginalText`), 'I love you');
  assert((await c.evaluate(`window.signStudio.lastProcessedTokens.map(t=>t.clipKey)`)).includes('LOVE'));
  await c.evaluate(`document.getElementById('stop-btn').click(); window.signStudio.processUtterance('Hello'); document.getElementById('stop-btn').click()`);
  await wait(400);
  assert.equal(await c.evaluate(`window.signStudio.signEngine.isPlaying`), false);
  await c.evaluate(`window.signStudio.subtitleSync.setSpeechSubtitles('<img src=x onerror="window.qaInjected=true">', '', 'Test')`);
  assert.equal(await c.evaluate(`document.querySelector('#speech-subtitle-box img') === null && !window.qaInjected`), true);
  await c.evaluate(`document.querySelector('[data-lang="vi-VN"].flag-ball').click(); window.signStudio.processUtterance('Xin chào')`);
  await wait(450);
  assert.equal(await c.evaluate(`window.signStudio.lastProcessedTokens[0].clipKey`), 'HELLO');
  await c.evaluate(`document.getElementById('stop-btn').click(); document.getElementById('demo-btn').click(); window.signStudio.signEngine.setSpeed(2)`);
  for (let i = 0; i < 150; i++) {
    await wait(300);
    if (!await c.evaluate(`window.signStudio.demoActive`)) break;
  }
  assert.equal(await c.evaluate(`window.signStudio.demoActive`), false, 'Four demo scenes must finish');
  assert.equal(await c.evaluate(`window.signStudio.demoIndex`), 4);
  await c.evaluate(`document.getElementById('focus-btn').click()`);
  assert.equal(await c.evaluate(`document.body.classList.contains('presentation-mode')`), true);
  await c.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await c.evaluate(`document.body.classList.contains('presentation-mode')`), false);
  await c.evaluate(`document.getElementById('theme-toggle-btn').click()`);
  assert.equal(await c.evaluate(`document.body.classList.contains('dark-theme')`), true);
  await c.evaluate(`document.getElementById('theme-toggle-btn').click(); window.signStudio.switchPose('Image2_Sign_Chest')`);
  await wait(900);
  await c.evaluate(`window.signStudio.signEngine.isPaused=true`);
  let shot = await c.send('Page.captureScreenshot');
  await fs.writeFile('artifacts/desktop-verified.png', Buffer.from(shot.data, 'base64'));
  await c.send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await wait(600);
  assert(await c.evaluate(`document.documentElement.scrollWidth <= 390`), 'No horizontal overflow on mobile');
  assert(await c.evaluate(`document.getElementById('canvas-container').clientHeight >= 300`), 'Usable mobile stage');
  shot = await c.send('Page.captureScreenshot', {captureBeyondViewport:true});
  await fs.writeFile('artifacts/mobile-verified.png', Buffer.from(shot.data, 'base64'));
  await c.send('Emulation.clearDeviceMetricsOverride');
  const exported = await c.evaluate(`(async()=>{
    const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const data=await new GLTFExporter().parseAsync(signStudio.characterAvatar.root,{binary:true});
    const parsed=await new GLTFLoader().parseAsync(data,'');
    let meshes=0,bones=0,skins=0;parsed.scene.traverse(n=>{if(n.isMesh) meshes++;if(n.isBone) bones++;if(n.isSkinnedMesh) skins++});
    window.qaModelBuffer=data;
    return {bytes:data.byteLength,meshes,bones,skins};
  })()`);
  assert(exported.bytes > 100000 && exported.meshes === 7 && exported.skins === 7 && exported.bones >= 60, 'Imported GLB export preserves skeleton and seven skinned meshes');
  await c.evaluate(`signStudio.loadCustomModelFile(new File([window.qaModelBuffer],'qa-avatar.glb'))`);
  for (let i = 0; i < 60 && !await c.evaluate(`!!signStudio.customModel`); i++) await wait(250);
  assert.equal(await c.evaluate(`!!signStudio.customModel && !signStudio.avatar.root.visible`), true);
  await c.evaluate(`signStudio.processUtterance('Hello')`);
  await wait(500);
  assert.equal(await c.evaluate(`!signStudio.customModel && signStudio.characterAvatar.root.visible && !signStudio.avatar.root.visible && signStudio.signEngine.isPlaying`), true);
  await c.evaluate(`signStudio.switchPose('Idle'); delete window.qaModelBuffer`);
  assert.deepEqual(c.errors, [], 'No uncaught browser errors');
  console.log('PASS: browser motion, pause, speed, latest request, stop cancellation, safe subtitles, VI input, four-scene demo, presentation, theme, mobile, GLB export/import and restoring the signing avatar.');
  c.close();
}

if (process.argv[2] === 'state') {
  const c = await connect();
  console.log(await c.evaluate(`({index:signStudio.demoIndex,active:signStudio.demoActive,time:signStudio.signEngine.currentClipTime,speed:signStudio.signEngine.speed,total:signStudio.signEngine.totalTokens,token:signStudio.signEngine.tokenIndex,tokens:signStudio.lastProcessedTokens})`));
  c.close();
}

if (process.argv[2] === 'reference') {
  const c = await connect();
  await c.send('Page.navigate', { url: 'http://127.0.0.1:3001/' });
  await new Promise(r => setTimeout(r, 2500));
  console.log(await c.evaluate(`(async () => {
    const video = document.createElement('video');
    video.src = '/Multilingual%20Speech%20to%20Sign%20Language%20Translator%20(1).mp4';
    video.muted = true;
    await new Promise((resolve,reject) => {video.onloadedmetadata=resolve;video.onerror=reject;});
    window.referenceVideo = video;
    return {duration:video.duration,width:video.videoWidth,height:video.videoHeight};
  })()`));
  await fs.mkdir('artifacts', { recursive: true });
  const data = await c.evaluate(`(async () => {
    const v=window.referenceVideo, canvas=document.createElement('canvas');
    canvas.width=1200;canvas.height=900;
    const ctx=canvas.getContext('2d');
    for (let i=0;i<6;i++){
      v.currentTime=[5,13,25,36,50,65][i];
      await new Promise(r=>v.onseeked=r);
      ctx.drawImage(v,(i%3)*400,Math.floor(i/3)*450,400,410);
      ctx.font='20px sans-serif';ctx.fillText([5,13,25,36,50,65][i]+'s',(i%3)*400+10,Math.floor(i/3)*450+440);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  await fs.writeFile('artifacts/video-reference.png', Buffer.from(data, 'base64'));
  const shot = await c.send('Page.captureScreenshot');
  await fs.writeFile('artifacts/before.png', Buffer.from(shot.data, 'base64'));
  c.close();
}

if (process.argv[2] === 'capture') {
  const c = await connect();
  await c.send('Page.reload');
  await new Promise(r => setTimeout(r, 2500));
  console.log(await c.evaluate(`({ready:!!window.signStudio,status:document.getElementById('status-text').textContent})`));
  await c.evaluate(`window.signStudio.switchPose('Idle')`);
  await new Promise(r => setTimeout(r, 600));
  for (const [name, pose] of [['idle', 'Idle'], ['wave', 'Image1_Wave_Hello'], ['chest', 'Image2_Sign_Chest']]) {
    await c.evaluate(`window.signStudio.switchPose('${pose}')`);
    await new Promise(r => setTimeout(r, 1300));
    await c.evaluate(`window.signStudio.signEngine.isPaused = true`);
    const shot = await c.send('Page.captureScreenshot');
    await fs.writeFile(`artifacts/after-${name}.png`, Buffer.from(shot.data, 'base64'));
  }
  c.close();
}
