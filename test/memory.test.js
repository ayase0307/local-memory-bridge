import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

let memory;
try {
  memory = await import('../src/memory.js');
} catch {
  memory = {};
}

function api(name) {
  assert.equal(typeof memory[name], 'function', `src/memory.js must export ${name}()`);
  return memory[name];
}

async function tempProject(t) {
  const base = await mkdtemp(path.join(process.cwd(), '.local-memory-test-'));
  const root = path.join(base, 'project');
  await mkdir(root);
  t.after(() => rm(base, { recursive: true, force: true }));
  return { base, root };
}

async function linkOrSkip(t, target, linkPath, type) {
  try {
    await symlink(target, linkPath, type);
    return true;
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) {
      t.skip(`this Windows environment does not permit ${type} symlinks`);
      return false;
    }
    throw error;
  }
}

test('initProject creates fixed files and preserves existing content', async (t) => {
  const initProject = api('initProject');
  const { root } = await tempProject(t);
  await writeFile(path.join(root, 'agent.md'), '人工規則\n', 'utf8');

  await initProject(root);
  await initProject(root);

  assert.equal(await readFile(path.join(root, 'agent.md'), 'utf8'), '人工規則\n');
  assert.equal(await readFile(path.join(root, 'memory.md'), 'utf8'), '');
  assert.equal(await readFile(path.join(root, '.memory-bridge', 'turns.jsonl'), 'utf8'), '');
});

test('buildContext rereads both files and includes their full text with the current user message', async (t) => {
  const initProject = api('initProject');
  const buildContext = api('buildContext');
  const { root } = await tempProject(t);
  await initProject(root);
  await writeFile(path.join(root, 'agent.md'), '規則版本一：保留原文。', 'utf8');
  await writeFile(path.join(root, 'memory.md'), '長期事實：專案代號青松。', 'utf8');

  const first = await buildContext(root, '請整理今天的進度');
  await writeFile(path.join(root, 'memory.md'), '長期事實：專案代號青松。\n新增決策：先離線驗證。', 'utf8');
  const second = await buildContext(root, '請整理今天的進度');

  assert.match(first.prompt, /規則版本一：保留原文。/);
  assert.match(first.prompt, /長期事實：專案代號青松。/);
  assert.match(second.prompt, /新增決策：先離線驗證。/);
  assert.match(second.prompt, /請整理今天的進度/);
  assert.notEqual(first.prompt, second.prompt);
  assert.equal(second.contextHash, createHash('sha256').update(second.prompt, 'utf8').digest('hex'));
});

test('buildContext rejects empty user text and a packet that exceeds maxChars', async (t) => {
  const initProject = api('initProject');
  const buildContext = api('buildContext');
  const { root } = await tempProject(t);
  await initProject(root);

  await assert.rejects(buildContext(root, ' \n\t'), (error) => error.code === 'INVALID_INPUT');
  await assert.rejects(buildContext(root, '請繼續', { maxChars: 8 }), (error) => error.code === 'INVALID_INPUT');
});

test('buildContext counts Unicode characters without charging twice for a surrogate pair', async (t) => {
  const initProject = api('initProject');
  const buildContext = api('buildContext');
  const { root } = await tempProject(t);
  await initProject(root);
  const packet = await buildContext(root, '😀');
  const maxChars = [...packet.prompt].length;

  const bounded = await buildContext(root, '😀', { maxChars });

  assert.equal([...bounded.prompt].length, maxChars);
});

test('buildContext refuses a fixed memory file larger than the read limit', async (t) => {
  const initProject = api('initProject');
  const buildContext = api('buildContext');
  const { root } = await tempProject(t);
  await initProject(root);
  await writeFile(path.join(root, 'agent.md'), 'x'.repeat(1024 * 1024 + 1), 'utf8');

  await assert.rejects(buildContext(root, '讀取規則'), (error) => error.code === 'INVALID_INPUT');
});

test('buildContext rejects a symlinked fixed file instead of reading outside the project', async (t) => {
  const initProject = api('initProject');
  const buildContext = api('buildContext');
  const { base, root } = await tempProject(t);
  await initProject(root);
  const outside = path.join(base, 'outside-agent.md');
  await writeFile(outside, '外部機密標記', 'utf8');
  await unlink(path.join(root, 'agent.md'));
  if (!(await linkOrSkip(t, outside, path.join(root, 'agent.md'), 'file'))) return;

  await assert.rejects(buildContext(root, '讀取規則'));
});

test('initProject rejects a symlinked metadata directory without writing outside the project', async (t) => {
  const initProject = api('initProject');
  const { base, root } = await tempProject(t);
  const outside = path.join(base, 'outside-metadata');
  await mkdir(outside);
  await writeFile(path.join(outside, 'sentinel'), '保留', 'utf8');
  if (!(await linkOrSkip(t, outside, path.join(root, '.memory-bridge'), 'junction'))) return;

  await assert.rejects(initProject(root));
  assert.equal(await readFile(path.join(outside, 'sentinel'), 'utf8'), '保留');
  assert.equal(await readFile(path.join(outside, 'turns.jsonl')).catch(() => null), null);
});

test('withProjectLock excludes a second Node process while the first holds the project lock', async (t) => {
  const initProject = api('initProject');
  const withProjectLock = api('withProjectLock');
  const { root } = await tempProject(t);
  await initProject(root);

  let child;
  await withProjectLock(root, async () => {
    child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const { withProjectLock } = await import(${JSON.stringify(new URL('../src/memory.js', import.meta.url).href)});
      try {
        await withProjectLock(process.env.MEMORY_PROJECT_ROOT, async () => {});
        process.stdout.write('ACQUIRED');
      } catch (error) {
        process.stdout.write(error.code || 'OTHER_ERROR');
      }
    `], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, MEMORY_PROJECT_ROOT: root },
    });
  });

  assert.equal(child.error, undefined);
  assert.equal(child.status, 0);
  assert.equal(child.stdout, 'PROJECT_BUSY');
});

test('withProjectLock releases the lock after success and after an action throws', async (t) => {
  const initProject = api('initProject');
  const withProjectLock = api('withProjectLock');
  const { root } = await tempProject(t);
  await initProject(root);

  assert.equal(await withProjectLock(root, async () => 'done'), 'done');
  await assert.rejects(withProjectLock(root, async () => { throw new Error('operation failed'); }), /operation failed/);
  assert.equal(await withProjectLock(root, async () => 'released'), 'released');
});

test('recordTurn appends only a validated completed turn while the caller holds the lock', async (t) => {
  const initProject = api('initProject');
  const withProjectLock = api('withProjectLock');
  const recordTurn = api('recordTurn');
  const { root } = await tempProject(t);
  await initProject(root);
  const contextHash = 'a'.repeat(64);

  await withProjectLock(root, async () => {
    await recordTurn(root, {
      user: '整理進度',
      assistant: '今天完成離線驗證。',
      contextHash,
      prompt: '不應寫進紀錄',
    });
  });

  const lines = (await readFile(path.join(root, '.memory-bridge', 'turns.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  const turn = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(turn).sort(), ['assistant', 'contextHash', 'timestamp', 'user']);
  assert.equal(turn.user, '整理進度');
  assert.equal(turn.assistant, '今天完成離線驗證。');
  assert.equal(turn.contextHash, contextHash);
  assert.ok(Number.isFinite(Date.parse(turn.timestamp)));
});

test('recordTurn rejects an empty answer and leaves turns.jsonl unchanged', async (t) => {
  const initProject = api('initProject');
  const withProjectLock = api('withProjectLock');
  const recordTurn = api('recordTurn');
  const { root } = await tempProject(t);
  await initProject(root);

  await withProjectLock(root, async () => {
    await assert.rejects(recordTurn(root, {
      user: '整理進度', assistant: ' \n', contextHash: 'b'.repeat(64),
    }), (error) => error.code === 'INVALID_INPUT');
  });
  assert.equal(await readFile(path.join(root, '.memory-bridge', 'turns.jsonl'), 'utf8'), '');
});

test('recordTurn refuses a symlinked JSONL target without appending to its destination', async (t) => {
  const initProject = api('initProject');
  const withProjectLock = api('withProjectLock');
  const recordTurn = api('recordTurn');
  const { base, root } = await tempProject(t);
  await initProject(root);
  const turns = path.join(root, '.memory-bridge', 'turns.jsonl');
  const outside = path.join(base, 'outside-turns.jsonl');
  await writeFile(outside, '保留的外部資料\n', 'utf8');
  await unlink(turns);
  if (!(await linkOrSkip(t, outside, turns, 'file'))) return;

  await withProjectLock(root, async () => {
    await assert.rejects(recordTurn(root, {
      user: '不應寫入', assistant: '完成', contextHash: 'c'.repeat(64),
    }));
  });
  assert.equal(await readFile(outside, 'utf8'), '保留的外部資料\n');
});

test('remember appends explicit text and acquires its own lock', async (t) => {
  const initProject = api('initProject');
  const remember = api('remember');
  const withProjectLock = api('withProjectLock');
  const { root } = await tempProject(t);
  await initProject(root);
  await writeFile(path.join(root, 'memory.md'), '已存在的記憶\n', 'utf8');

  await remember(root, '人工要求記住：下週先檢查封裝。');

  assert.equal(
    await readFile(path.join(root, 'memory.md'), 'utf8'),
    '已存在的記憶\n\n人工要求記住：下週先檢查封裝。\n',
  );
  await withProjectLock(root, async () => {
    await assert.rejects(remember(root, '這次不應追加'), (error) => error.code === 'PROJECT_BUSY');
  });
  assert.doesNotMatch(await readFile(path.join(root, 'memory.md'), 'utf8'), /這次不應追加/);
});

test('remember rejects empty text without changing memory.md', async (t) => {
  const initProject = api('initProject');
  const remember = api('remember');
  const { root } = await tempProject(t);
  await initProject(root);
  await writeFile(path.join(root, 'memory.md'), '既有內容', 'utf8');

  await assert.rejects(remember(root, ' \n'), (error) => error.code === 'INVALID_INPUT');
  assert.equal(await readFile(path.join(root, 'memory.md'), 'utf8'), '既有內容');
});

test('two project roots never inject each other\'s memory', async (t) => {
  const a = await tempProject(t);
  const b = await tempProject(t);
  await memory.initProject(a.root);
  await memory.initProject(b.root);
  await writeFile(path.join(a.root, 'memory.md'), 'PROJECT_A_ONLY_4d71', 'utf8');
  await writeFile(path.join(b.root, 'memory.md'), 'PROJECT_B_ONLY_aa62', 'utf8');
  const left = await memory.buildContext(a.root, 'read');
  const right = await memory.buildContext(b.root, 'read');
  assert.match(left.prompt, /PROJECT_A_ONLY_4d71/);
  assert.doesNotMatch(left.prompt, /PROJECT_B_ONLY_aa62/);
  assert.match(right.prompt, /PROJECT_B_ONLY_aa62/);
  assert.doesNotMatch(right.prompt, /PROJECT_A_ONLY_4d71/);
});
