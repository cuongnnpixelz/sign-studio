// Uses the isolated development Chrome on port 9223; no provider requests.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { connect } from './browser-qa.mjs';

const c = await connect();
try {
  await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1000, deviceScaleFactor: 1, mobile: false });
  await c.send('Page.navigate', { url: 'http://127.0.0.1:3001/' });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    ready = await c.evaluate('!!window.signStudio?.characterAvatar');
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, 'Vest loads');
  await c.evaluate(`signStudio.cancelDemo(); signStudio.cancelPending(); signStudio.esp32Bridge.disconnect();
    signStudio.translationMode='local'; document.body.classList.add('presentation-mode');
    signStudio.controls.minDistance=.1; signStudio.controls.maxDistance=6;
    window.qaLabel=document.createElement('div');qaLabel.style.cssText='position:fixed;top:20px;left:20px;font:32px sans-serif;z-index:9999;color:black;background:white;padding:12px';document.body.append(qaLabel);`);
  const outputs = [];
  for (const [letter, progress] of [['U', .6], ['V', .6], ['R', .6], ['P', .6], ['Q', .6], ['J', .3], ['J', .6], ['J', .9], ['Z', .3], ['Z', .5], ['Z', .7], ['Z', .9], ['Ă', .6], ['Đ', .6]]) {
    const report = await c.evaluate(`(async()=>{
      const THREE=await import('/node_modules/three/build/three.module.js');
      const app=signStudio, engine=app.signEngine;
      engine.playSequence([{type:'FINGERSPELL',clipKey:'FINGERSPELL',letters:[${JSON.stringify(letter)}],duration:1000}]);
      engine.updateFingerspelling(${progress});engine.isPaused=true;
      app.characterAvatar.update(0,0);
      const target=app.characterAvatar.nodes.RightHand.getWorldPosition(new THREE.Vector3());
      app.controls.target.copy(target);
      app.camera.position.copy(app.controls.target).add(new THREE.Vector3(0,.015,.9));
      app.controls.update();app.renderer.render(app.scene,app.camera);
      qaLabel.textContent=${JSON.stringify(letter + ' · ' + progress)};
      const rig=app.characterAvatar;
      const tips=Object.fromEntries(['Index','Middle','Pinky'].map(f=>[f,rig.nodes['RightHand'+f+'4'].getWorldPosition(new THREE.Vector3()).toArray()]));
      return {letter:${JSON.stringify(letter)},progress:${progress},hand:target.toArray(),tips};
    })()`);
    outputs.push(report);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(`artifacts/fingerspelling-${letter}-${progress}.png`, Buffer.from(shot.data, 'base64'));
  }
  assert.equal(c.errors.length, 0, JSON.stringify(c.errors));
  const sample = letter => outputs.find(item => item.letter === letter);
  const gap = item => Math.hypot(...item.tips.Index.map((value, axis) => value - item.tips.Middle[axis]));
  assert(gap(sample('V')) > gap(sample('U')) * 1.4, 'U/V remain distinct on the Vest rig');
  for (const letter of ['P', 'Q']) assert(sample(letter).tips.Index[1] < sample(letter).hand[1], `${letter} points down on Vest`);
  const z = outputs.filter(item => item.letter === 'Z');
  assert(z[1].hand[0] < z[0].hand[0] && z[2].hand[0] > z[1].hand[0] && z[3].hand[0] < z[2].hand[0], 'Vest retains the Z path');
  await fs.writeFile('artifacts/fingerspelling-browser-results.json', JSON.stringify(outputs, null, 2));
  console.log('PASS: Vest renders 14 spelling poses/motion samples without browser exceptions.');
} finally { c.close(); }
