import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 });

test('CLI survives separate processes, rereads memory, and records manual replies', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'memory-cli-'));
  try {
    assert.equal(run('init', '--project', root).status, 0);
    assert.equal(run('remember', '--project', root, '--text', '專案暗號：青鳥').status, 0);
    const first = run('pack', '--project', root, '--message', '暗號是什麼？');
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /青鳥/);
    await writeFile(path.join(root, 'memory.md'), '新暗號：白鷺', 'utf8');
    const second = run('pack', '--project', root, '--message', '讀取新暗號');
    assert.match(second.stdout, /白鷺/);
    assert.doesNotMatch(second.stdout, /青鳥/);
    const reply = path.join(root, 'reply.txt');
    await writeFile(reply, '暗號是白鷺。', 'utf8');
    const recorded = run('record', '--project', root, '--message', '讀取新暗號', '--reply-file', reply);
    assert.equal(recorded.status, 0, recorded.stderr);
    const rows = (await readFile(path.join(root, '.memory-bridge', 'turns.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(rows.length, 1);
    assert.equal(JSON.parse(rows[0]).assistant, '暗號是白鷺。');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI reports unknown and missing options without silently doing work', () => {
  assert.notEqual(run('pack', '--message', 'hello').status, 0);
  assert.notEqual(run('unknown').status, 0);
  assert.notEqual(run('init', '--project', '.', '--typo', 'yes').status, 0);
  assert.equal(run('--help').status, 0);
});

test('manual import rejects malformed UTF-8 instead of changing answer bytes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'memory-encoding-'));
  try {
    assert.equal(run('init', '--project', root).status, 0);
    const reply = path.join(root, 'bad.txt');
    await writeFile(reply, Buffer.from([0xc3, 0x28]));
    assert.notEqual(run('record', '--project', root, '--message', 'hello', '--reply-file', reply).status, 0);
    assert.equal(await readFile(path.join(root, '.memory-bridge', 'turns.jsonl'), 'utf8'), '');
  } finally { await rm(root, { recursive: true, force: true }); }
});
