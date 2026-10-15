import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBridgeServer } from '../src/server.js';
import { initProject } from '../src/memory.js';

const key = 'test-key-12345678901234567890';
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
const rawPost = (url, body, headers = {}) => new Promise((resolve, reject) => {
  const request = http.request(`${url}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...headers }
  }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
  request.on('error', reject);
  request.end(JSON.stringify(body));
});

test('HTTP bridge injects current memory, rejects untrusted requests and preserves failures', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'memory-http-'));
  await initProject(root);
  await writeFile(path.join(root, 'memory.md'), '暗號：青鳥', 'utf8');
  const prompts = [];
  let fail = false;
  let delay = 0;
  const upstream = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    prompts.push(body.messages[0].content);
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.headers.authorization, `Bearer ${key}`);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    res.writeHead(fail ? 429 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(fail ? { error: 'private upstream details' } : {
      choices: [{ message: { content: '收到記憶' }, finish_reason: 'stop' }]
    }));
  });
  const upstreamUrl = await listen(upstream);
  const bridge = createBridgeServer({ project: root, apiKey: key, upstream: { baseUrl: `${upstreamUrl}/v1`, apiKey: key, model: 'test-model', timeoutMs: 2000 } });
  const url = await listen(bridge);
  const request = (body, extra = {}) => fetch(`${url}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...extra }, body: JSON.stringify(body)
  });
  const body = { model: 'test-model', messages: [{ role: 'user', content: '請讀記憶' }], stream: false };
  try {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal((await request(body, { authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await request(body, { origin: 'https://evil.example' })).status, 403);
    assert.equal(await rawPost(url, body, { host: 'evil.example' }), 403);
    assert.equal((await request({ ...body, stream: true })).status, 400);
    assert.equal((await request({ ...body, project: 'C:/secret' })).status, 400);
    assert.equal((await request({ ...body, tools: [] })).status, 400);
    assert.equal((await request({ ...body, model: 'other' })).status, 400);
    assert.equal((await request({ ...body, messages: [{ role: 'user', content: 'a'.repeat(70000) }] })).status, 413);
    const first = await request(body);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).choices[0].message.content, '收到記憶');
    assert.match(prompts[0], /青鳥/);
    await writeFile(path.join(root, 'memory.md'), '暗號：白鷺', 'utf8');
    assert.equal((await request(body)).status, 200);
    assert.match(prompts[1], /白鷺/);
    assert.doesNotMatch(prompts[1], /青鳥/);
    fail = true;
    const failure = await request(body);
    assert.equal(failure.status, 502);
    assert.doesNotMatch(await failure.text(), /private upstream|test-key/);
    fail = false;
    delay = 200;
    const pending = request(body);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal((await request(body)).status, 409);
    assert.equal((await pending).status, 200);
    const rows = (await readFile(path.join(root, '.memory-bridge', 'turns.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(rows.length, 3);
  } finally {
    await close(bridge); await close(upstream);
    await rm(root, { recursive: true, force: true });
  }
});

test('server refuses missing auth configuration', () => {
  assert.throws(() => createBridgeServer({ project: '.', apiKey: '', upstream: {} }));
});
