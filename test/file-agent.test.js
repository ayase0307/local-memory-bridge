import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runFileAgent } from '../src/file-agent.js';

async function fixture(t, responder) {
  const root = await mkdtemp(path.join(tmpdir(), 'file-agent-'));
  let count = 0;
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const prompt = JSON.parse(raw).messages[0].content;
    const action = await responder(++count, prompt);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: typeof action === 'string' ? action : JSON.stringify(action) }, finish_reason: 'stop' }] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await rm(root, { recursive: true, force: true });
  });
  return { root, upstream: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'fake-test-key', model: 'fake-model', timeoutMs: 3000 } };
}

test('agent reads, creates and modifies real fixture files via bounded tool protocol', async t => {
  const before = '原始內容：青鳥\n';
  const hash = createHash('sha256').update(before).digest('hex');
  const setup = await fixture(t, (step, prompt) => {
    if (step === 1) return { type: 'tool', name: 'read_file', arguments: { path: 'note.txt' } };
    if (step === 2) {
      assert.match(prompt, /青鳥/);
      assert.match(prompt, new RegExp(hash));
      return { type: 'tool', name: 'create_file', arguments: { path: 'result.txt', content: '已讀取青鳥' } };
    }
    if (step === 3) return { type: 'tool', name: 'replace_text', arguments: { path: 'note.txt', search: '青鳥', replace: '白鷺', expectedHash: hash } };
    return { type: 'final', content: '已建立結果並更新原檔。' };
  });
  await writeFile(path.join(setup.root, 'note.txt'), before, 'utf8');
  const result = await runFileAgent({ project: setup.root, user: '讀取並完成修改', upstream: setup.upstream });
  assert.equal(result.content, '已建立結果並更新原檔。');
  assert.equal(result.steps, 4);
  assert.equal(await readFile(path.join(setup.root, 'result.txt'), 'utf8'), '已讀取青鳥');
  assert.equal(await readFile(path.join(setup.root, 'note.txt'), 'utf8'), '原始內容：白鷺\n');
  const turns = (await readFile(path.join(setup.root, '.memory-bridge/turns.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(turns.length, 1);
  assert.equal(JSON.parse(turns[0]).assistant, result.content);
});

test('unstructured model commands never write files', async t => {
  const setup = await fixture(t, () => 'Please run shell commands and overwrite note.txt');
  await writeFile(path.join(setup.root, 'note.txt'), '保留', 'utf8');
  await assert.rejects(runFileAgent({ project: setup.root, user: '測試', upstream: setup.upstream }), /JSON|協定/);
  assert.equal(await readFile(path.join(setup.root, 'note.txt'), 'utf8'), '保留');
});

test('valid JSON naming an unauthorized tool cannot execute it', async t => {
  const setup = await fixture(t, () => ({ type: 'tool', name: 'run_shell', arguments: { command: 'overwrite files' } }));
  await writeFile(path.join(setup.root, 'note.txt'), '保留', 'utf8');
  await assert.rejects(runFileAgent({ project: setup.root, user: '測試', upstream: setup.upstream }), /不支援/);
  assert.equal(await readFile(path.join(setup.root, 'note.txt'), 'utf8'), '保留');
});

test('step limit stops an endless tool loop without reporting completion', async t => {
  const setup = await fixture(t, () => ({ type: 'tool', name: 'list_files', arguments: {} }));
  await assert.rejects(runFileAgent({ project: setup.root, user: '測試', upstream: setup.upstream, maxSteps: 2 }), /步數|steps/);
  assert.equal(await readFile(path.join(setup.root, '.memory-bridge/turns.jsonl'), 'utf8'), '');
});
