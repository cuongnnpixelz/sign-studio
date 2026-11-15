import assert from 'node:assert/strict';
const tabs = await (await fetch('http://127.0.0.1:9224/json')).json();
const tab = tabs.find(t => t.url.includes('asl-animation-lab.html'));
assert(tab, 'Lab browser tab exists');
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const reply = JSON.parse(event.data);
  const callback = pending.get(reply.id);
  if (callback) { pending.delete(reply.id); callback(reply); }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 20000);
    pending.set(++id, reply => { clearTimeout(timer); reply.error ? reject(reply.error) : resolve(reply.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
try {
  const state = await evaluate(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (let i=0;i<80 && document.getElementById('load-sample').disabled;i++) await wait(100);
    const count = document.getElementById('sample').options.length;
    const result = [];
    for (let index=0;index<count;index++) {
      document.getElementById('sample').selectedIndex = index;
      document.getElementById('load-sample').click();
      for (let i=0;i<100 && document.getElementById('load-sample').disabled;i++) await wait(100);
      const status = document.getElementById('status').textContent;
      const details = JSON.parse(document.getElementById('details').textContent);
      result.push({file:details.file,status,bones:details.bones.length,targetDisabled:document.getElementById('target').disabled});
    }
    document.getElementById('play').click();
    return {result,pausedLabel:document.getElementById('play').textContent,canvas:!!document.querySelector('canvas')};
  })()`);
  assert.equal(state.result.length, 8);
  assert(state.canvas);
  assert.equal(state.pausedLabel, 'Tiếp tục');
  for (const sample of state.result) {
    assert(sample.status.startsWith('Đang xem chuyển động'), sample.status);
    assert.equal(sample.bones, 53);
  }
  console.log(JSON.stringify(state, null, 2));
} finally { socket.close(); }
