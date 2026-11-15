import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHybridApi } from '../server/hybridApi.js';
import { AVAILABLE_SIGNS, GLOSS_SCHEMA, mapHybridGloss } from '../src/nlp/hybridGloss.js';

const token = (gloss, spelling = gloss, nmm = { eyebrows: 'neutral', smile: 0 }) => ({ gloss, spelling, nmm });
const plan = { translation: 'Tomorrow I will visit Hanoi.', sentenceType: 'STATEMENT',
  tokens: [token('TOMORROW'), token('ME'), token('VISIT'), token('HANOI', 'Hà Nội')] };
const responseFor = value => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));

async function serve(t, options = {}) {
  const api = createHybridApi(options);
  const server = createServer((req, res) => api(req, res, () => { res.writeHead(404); res.end(); }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    post: (body = {}, options = {}) => fetch(`${base}/api/hybrid/gloss`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify({ text: 'Ngày mai tôi sẽ thăm Hà Nội.', sourceLanguage: 'vi-VN', targetSign: 'asl', ...body }),
      signal: options.signal
    })
  };
}

test('gloss preserves order, unknown vocabulary and proper names; NMM is bounded', () => {
  const result = mapHybridGloss(plan);
  assert.deepEqual(result.tokens.map(t => t.text), ['TOMORROW', 'ME', 'VISIT', 'HANOI']);
  assert.equal(result.tokens[1].clipKey, 'ME');
  assert.deepEqual(result.tokens[3].letters, ['H', 'A', 'N', 'O', 'I']);
  assert.equal(result.coverage.signs, 1);
  for (const key of AVAILABLE_SIGNS) assert.equal(mapHybridGloss({ ...plan, tokens: [token(key)] }).tokens[0].type, 'SIGN');
  const { nmm } = mapHybridGloss({ ...plan, tokens: [token('WHAT', 'WHAT', { eyebrows: 'furrowed', smile: 99, headTilt: -99, mouthOpen: Infinity })] }).tokens[0];
  assert.deepEqual(nmm, { eyebrows: 'furrowed', smile: 1, headTilt: -.25, headNod: 0, headShake: 0, mouthOpen: 0 });
  const digits = mapHybridGloss({ ...plan, tokens: [token('123', '123')] }).tokens[0].letters.join('');
  assert.equal(digits, 'ONETWOTHREE');
});

test('malformed or unplayable responses fail instead of dropping content', () => {
  // Regression: nested bounded arrays/numbers triggered HTTP 400 on the live model.
  assert(!/"(?:minimum|maximum|minItems|maxItems)":/.test(JSON.stringify(GLOSS_SCHEMA)));
  for (const value of [null, {}, { ...plan, tokens: [] }, { ...plan, tokens: Array(101).fill(token('ME')) },
    { ...plan, tokens: [token('NAME', '', null)] }, { ...plan, tokens: [token('UNKNOWN', '東京')] }]) {
    assert.throws(() => mapHybridGloss(value));
  }
  const result = mapHybridGloss({ ...plan, tokens: [token('__proto__', 'prototype'), token('constructor')] });
  assert(result.tokens.every(t => t.type === 'FINGERSPELL'));
});

test('unconfigured status contains no secret and requests never reach provider', async t => {
  const { base, post } = await serve(t, { env: {}, fetchImpl: () => assert.fail('Must not call provider') });
  const status = await (await fetch(`${base}/api/hybrid/status`)).json();
  assert.equal(status.configured, false);
  const response = await post();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'NOT_CONFIGURED');
});

test('Gemini request uses server key and JSON schema; repeated input is cached', async t => {
  let calls = 0;
  const { base, post } = await serve(t, { env: { GEMINI_API_KEY: 'test-server-secret' }, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(options.headers['x-goog-api-key'], 'test-server-secret');
    assert(!url.includes('test-server-secret'));
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert(body.generationConfig.responseJsonSchema.properties.tokens);
    assert.equal(JSON.parse(body.contents[0].parts[0].text).text, 'Ngày mai tôi sẽ thăm Hà Nội.');
    return responseFor(plan);
  } });
  assert(!(await (await fetch(`${base}/api/hybrid/status`)).text()).includes('test-server-secret'));
  const response = await post();
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.cached, false);
  assert.equal(value.tokens[1].clipKey, 'ME');
  assert.equal((await (await post()).json()).cached, true);
  assert.equal(calls, 1);
});

test('input, target, method and origin validation protect provider calls', async t => {
  const { base, post } = await serve(t, { env: { GEMINI_API_KEY: 'test' }, fetchImpl: () => assert.fail('Must not call provider') });
  for (const body of [{ text: '' }, { text: 'x'.repeat(501) }, { text: 99 }, { targetSign: 'vsl' }, { sourceLanguage: 'invalid' }, { sourceLanguage: 'fr-FR' }, { sourceLanguage: 'it-IT' }, { sourceLanguage: 'pt-BR' }, { sourceLanguage: 'es-ES' }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post({}, { headers: { Origin: 'https://unrelated.example' } })).status, 403);
  assert.equal((await post({}, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await fetch(`${base}/api/hybrid/gloss`)).status, 405);
  assert.equal((await fetch(`${base}/api/hybrid/missing`)).status, 404);
});

test('quota, rejected key, provider failures and malformed content give usable errors', async t => {
  for (const [status, code] of [[400, 'PROVIDER_REQUEST'], [429, 'QUOTA'], [403, 'API_KEY'], [404, 'MODEL_UNAVAILABLE'], [500, 'PROVIDER_ERROR']]) {
    const { post } = await serve(t, { env: { GEMINI_API_KEY: 'test' }, fetchImpl: async () => new Response('private upstream details', { status }) });
    const result = await (await post()).json();
    assert.equal(result.code, code);
    assert(!JSON.stringify(result).includes('private upstream'));
  }
  for (const payload of [{ candidates: [] }, { candidates: [{ finishReason: 'MAX_TOKENS' }] }, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{broken' }] } }] }]) {
    const { post } = await serve(t, { env: { GEMINI_API_KEY: 'test' }, fetchImpl: async () => Response.json(payload) });
    const response = await post();
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'INVALID_RESPONSE');
  }
});

test('timeouts abort the upstream request', async t => {
  const { post } = await serve(t, { env: { GEMINI_API_KEY: 'test' }, timeoutMs: 30,
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }) });
  const response = await post();
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, 'TIMEOUT');
});

test('client disconnect cancels upstream work', async t => {
  let started;
  let aborted;
  const ready = new Promise(resolve => { started = resolve; });
  const cancelled = new Promise(resolve => { aborted = resolve; });
  const { post } = await serve(t, { env: { GEMINI_API_KEY: 'test' }, fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted(); reject(signal.reason); }, { once: true });
    started();
  }) });
  const controller = new AbortController();
  const pending = post({}, { signal: controller.signal }).catch(error => error);
  await ready;
  controller.abort();
  await pending;
  await cancelled;
});

test('network permission and DNS failures are distinguished without exposing secrets', async t => {
  for (const [cause, expected] of [
    [Object.assign(new Error('private details'), { code: 'EACCES' }), 'NETWORK_PERMISSION'],
    [new AggregateError([Object.assign(new Error('private details'), { code: 'EPERM' })]), 'NETWORK_PERMISSION'],
    [Object.assign(new Error('private details'), { code: 'ENOTFOUND' }), 'DNS']
  ]) {
    const { post } = await serve(t, { env: { GEMINI_API_KEY: 'test' }, fetchImpl: async () => { throw new TypeError('fetch failed', { cause }); } });
    const response = await post();
    const result = await response.json();
    assert.equal(response.status, 502);
    assert.equal(result.code, expected);
    assert(!JSON.stringify(result).includes('private details'));
  }
});

test('connection button verifies provider authentication/model without generating text', async t => {
  let calls = 0;
  const { base } = await serve(t, { env: { GEMINI_API_KEY: 'test-secret' }, fetchImpl: async (url, options) => {
    calls++;
    assert(!url.includes(':generateContent'));
    assert.equal(options.method, 'GET');
    assert.equal(options.headers['x-goog-api-key'], 'test-secret');
    return Response.json({ supportedGenerationMethods: ['generateContent'] });
  } });
  const result = await fetch(`${base}/api/hybrid/check`, { method: 'POST' });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).reachable, true);
  assert.equal(calls, 1);
  assert.equal((await fetch(`${base}/api/hybrid/check`, { method: 'POST' })).status, 429);
});

test('connection check surfaces invalid credentials rather than reporting configured as connected', async t => {
  const { base } = await serve(t, { env: { GEMINI_API_KEY: 'test' }, fetchImpl: async () => new Response('', { status: 403 }) });
  const result = await fetch(`${base}/api/hybrid/check`, { method: 'POST' });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, 'API_KEY');
});
