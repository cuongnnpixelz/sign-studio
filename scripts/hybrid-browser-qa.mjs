import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { connect } from './browser-qa.mjs';

const c = await connect();
const run = expression => c.evaluate(`(async () => { ${expression} })()`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await c.evaluate(expression)) return;
    await wait(100);
  }
  assert.fail(`Timed out: ${expression}`);
}
try {
  await c.send('Runtime.enable');
  await c.send('Page.navigate', { url: 'http://127.0.0.1:3001/' });
  await until('!!window.signStudio?.characterAvatar');
  await until(`!document.getElementById('check-hybrid-btn').disabled`);
  await c.evaluate(`signStudio.switchPose('Idle');
    document.getElementById('translation-mode').value='hybrid';
    document.getElementById('translation-mode').dispatchEvent(new Event('change'));
    document.querySelector('.flag-ball[data-lang="vi-VN"]').click();`);
  assert.equal(await c.evaluate(`signStudio.currentTargetSign === 'asl' && document.getElementById('target-sign-select').disabled`), true);
  // This script is for an unconfigured local server. No paid provider is called.
  assert.equal(await run(`return (await (await fetch('/api/hybrid/status')).json()).configured;`), false);
  await c.evaluate(`document.getElementById('manual-input').value='Ngày mai tôi đến Hà Nội'; document.getElementById('send-input-btn').click()`);
  await until(`!signStudio.translationController`);
  assert.equal(await c.evaluate(`document.getElementById('manual-input').value`), 'Ngày mai tôi đến Hà Nội');
  assert(await c.evaluate(`document.getElementById('translation-result').textContent.includes('Chưa kết nối Gemini')`));
  assert.equal(await c.evaluate(`signStudio.signEngine.isPlaying`), false);

  await c.evaluate(`(async () => {
    const {mapHybridGloss} = await import('/src/nlp/hybridGloss.js');
    window.qaResult = {...mapHybridGloss({translation:'Tomorrow I visit Hanoi.',sentenceType:'STATEMENT',tokens:[
      {gloss:'TOMORROW',spelling:'tomorrow',nmm:{eyebrows:'raised',smile:0}},
      {gloss:'ME',spelling:'me',nmm:{eyebrows:'neutral',smile:0}},
      {gloss:'VISIT',spelling:'visit',nmm:{eyebrows:'neutral',smile:0}},
      {gloss:'HANOI',spelling:'Hà Nội',nmm:{eyebrows:'neutral',smile:0}}
    ]}),model:'Gemini (phản hồi giả lập kiểm thử)',provider:'gemini',cached:false};
    window.qaFetch = window.fetch;
    window.qaCalls = 0;
    window.fetch = async (url, options) => {
      if (url !== '/api/hybrid/gloss') return qaFetch(url, options);
      qaCalls++;
      return Response.json(qaResult);
    };
  })()`);
  await c.evaluate(`document.getElementById('send-input-btn').click()`);
  await until('!signStudio.translationController');
  assert.equal(await c.evaluate(`document.getElementById('manual-input').value`), '');
  assert.equal(await c.evaluate(`signStudio.lastProcessedTokens.length`), 4);
  assert.equal(await c.evaluate(`signStudio.signEngine.isPlaying`), true);
  assert.equal(await c.evaluate(`signStudio.lastProcessedTokens[0].nmm.eyebrows`), 'raised');
  assert(await c.evaluate(`document.getElementById('translation-fallback').textContent.includes('HANOI')`));
  await c.evaluate(`document.getElementById('pause-btn').click()`);
  assert.equal(await c.evaluate(`signStudio.signEngine.isPaused`), true);
  const calls = await c.evaluate('qaCalls');
  await c.evaluate(`document.getElementById('replay-btn').click()`);
  assert.equal(await c.evaluate('qaCalls'), calls, 'Replay must not request the provider');

  await c.evaluate(`window.fetch = async (url, options) => {
    if(url !== '/api/hybrid/gloss') return qaFetch(url, options);
    const {text} = JSON.parse(options.body);
    if(text === 'slow') return new Promise(resolve => { window.qaResolveSlow=() => resolve(Response.json({...qaResult,translation:'STALE'})); });
    return Response.json({...qaResult,translation:'LATEST'});
  }; void signStudio.processUtterance('slow');`);
  await run(`await signStudio.processUtterance('fast'); qaResolveSlow();`);
  await wait(100);
  assert.equal(await c.evaluate('signStudio.lastTranslatedText'), 'LATEST');

  await c.evaluate(`window.qaAborted=false; window.fetch = async (url, options) => {
    if(url !== '/api/hybrid/gloss') return qaFetch(url, options);
    return new Promise((resolve,reject) => options.signal.addEventListener('abort', () => {
      qaAborted=true; reject(new DOMException('Cancelled','AbortError'));
    },{once:true}));
  }; signStudio.processUtterance('pending'); document.getElementById('stop-btn').click();`);
  assert(await c.evaluate(`qaAborted && !signStudio.signEngine.isPlaying && !document.getElementById('center-loading-spinner').classList.contains('visible')`));
  assert(await c.evaluate(`document.getElementById('translation-result').textContent.includes('hủy')`));

  await run(`window.fetch = async (url, options) => url === '/api/hybrid/gloss'
    ? Response.json({error:'Hết hạn mức thử nghiệm'}, {status:429}) : qaFetch(url,options);
    await signStudio.processUtterance('quota');`);
  assert(await c.evaluate(`document.getElementById('translation-result').textContent.includes('Hết hạn mức') && !signStudio.signEngine.isPlaying`));
  await c.evaluate(`document.getElementById('replay-btn').click()`);
  assert.equal(await c.evaluate(`document.querySelector('#speech-subtitle-box .sub-body').textContent`), 'fast');

  await run(`window.fetch = async (url, options) => url === '/api/hybrid/gloss'
    ? Response.json(qaResult) : qaFetch(url,options);
    document.getElementById('character-model-select').value='procedural';
    document.getElementById('character-model-select').dispatchEvent(new Event('change'));
    await signStudio.processUtterance('Ngày mai tôi đến Hà Nội.');`);
  await until('signStudio.signEngine.currentClipTime > .3');
  await c.evaluate(`document.getElementById('pause-btn').click()`);
  assert(await c.evaluate(`signStudio.avatar.facial.leftEyebrow.position.y > .28`));
  assert(await c.evaluate(`document.getElementById('translation-result').textContent.includes('Blazer diễn')`));
  const capture = async name => {
    const shot = await c.send('Page.captureScreenshot', { captureBeyondViewport: true });
    await fs.writeFile(`artifacts/${name}.png`, Buffer.from(shot.data, 'base64'));
  };
  await fs.mkdir('artifacts', { recursive: true });
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await wait(150);
  await capture('hybrid-desktop');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait(150);
  assert(await c.evaluate(`document.documentElement.scrollWidth <= 390`), 'No mobile horizontal overflow');
  assert(await c.evaluate(`document.getElementById('canvas-container').clientHeight >= 300`), 'Avatar remains visible');
  await capture('hybrid-mobile');
  assert.deepEqual(c.errors, [], 'No uncaught exceptions');
  console.log('PASS: Hybrid UI, missing key, safe ASL target, new vocabulary, NMM, playback, cancellation, latest result, quota, mobile. Provider responses were mocked; no paid API calls.');
} finally {
  await c.evaluate(`if(window.qaFetch) window.fetch=qaFetch; window.signStudio?.switchPose('Idle')`).catch(() => {});
  await c.send('Emulation.clearDeviceMetricsOverride');
  // Restore the real unconfigured app after the mock checks.
  await c.send('Page.reload');
  c.close();
}
