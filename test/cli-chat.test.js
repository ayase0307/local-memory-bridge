import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initProject } from '../src/memory.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: { ...process.env, BRIDGE_UPSTREAM_KEY: 'fake-upstream-key' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('real CLI process chats through fake upstream and rereads memory on a new turn', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'memory-chat-'));
  const prompts = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    assert.equal(req.headers.authorization, 'Bearer fake-upstream-key');
    const prompt = JSON.parse(raw).messages[0].content;
    prompts.push(prompt);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: prompt.includes('白鷺') ? '白鷺' : '青鳥' } }] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const args = ['chat', '--project', root, '--base-url', `http://127.0.0.1:${server.address().port}/v1`, '--model', 'fake-model', '--message', '請讀取暗號'];
  try {
    await initProject(root);
    await writeFile(path.join(root, 'memory.md'), '暗號：青鳥', 'utf8');
    const first = await run(args);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stdout.trim(), '青鳥');
    await writeFile(path.join(root, 'memory.md'), '暗號：白鷺', 'utf8');
    const second = await run(args);
    assert.equal(second.code, 0, second.stderr);
    assert.equal(second.stdout.trim(), '白鷺');
    assert.match(prompts[0], /青鳥/);
    assert.doesNotMatch(prompts[1], /青鳥/);
    const rows = (await readFile(path.join(root, '.memory-bridge/turns.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].contextHash, rows[1].contextHash);
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await rm(root, { recursive: true, force: true });
  }
});
