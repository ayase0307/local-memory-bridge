import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { initProject, withProjectLock } from '../src/memory.js';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

let runFileTool;
try {
  ({ runFileTool } = await import('../src/file-tools.js'));
} catch {
  runFileTool = undefined;
}

function runner() {
  assert.equal(typeof runFileTool, 'function', 'src/file-tools.js must export runFileTool()');
  return runFileTool;
}

async function tempProject(t) {
  const base = await mkdtemp(path.join(process.cwd(), '.file-tools-test-'));
  const root = path.join(base, 'project');
  await mkdir(root);
  await initProject(root);
  t.after(() => rm(base, { recursive: true, force: true }));
  return { base, root };
}

async function call(tool, root, name, args) {
  return withProjectLock(root, () => tool(root, name, args));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function actionRecords(root) {
  const content = await readFile(path.join(root, '.file-agent', 'actions.jsonl'), 'utf8');
  return content.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

async function symlinkOrSkip(t, target, linkPath, type) {
  try {
    await symlink(target, linkPath, type);
    return true;
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) {
      t.skip(`this environment does not permit ${type} symlinks`);
      return false;
    }
    throw error;
  }
}

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

test('list_files lists direct children only, caps output, and hides protected root files', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  await writeFile(path.join(root, 'README.md'), 'readme', 'utf8');
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src', 'nested.txt'), 'nested', 'utf8');
  await writeFile(path.join(root, '.env'), 'secret', 'utf8');
  await writeFile(path.join(root, '.env.local'), 'secret', 'utf8');
  await mkdir(path.join(root, '.git'));

  const result = await call(tool, root, 'list_files', {});
  const names = result.entries.map((entry) => entry.name);

  assert.deepEqual(names, ['README.md', 'src']);
  assert.equal(result.entries.some((entry) => entry.name === 'nested.txt'), false);
  assert.equal(result.truncated, false);
});

test('list_files returns no more than 200 direct entries and reports truncation', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  await Promise.all(Array.from({ length: 205 }, (_, index) =>
    writeFile(path.join(root, `item-${String(index).padStart(3, '0')}.txt`), '', 'utf8')));

  const result = await call(tool, root, 'list_files', {});

  assert.equal(result.entries.length, 200);
  assert.equal(result.truncated, true);
});

test('list_files accepts an existing relative directory and rejects extra arguments', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  await mkdir(path.join(root, 'docs'));
  await writeFile(path.join(root, 'docs', 'a.txt'), 'a', 'utf8');
  await mkdir(path.join(root, 'docs', 'nested'));
  await writeFile(path.join(root, 'docs', 'nested', 'b.txt'), 'b', 'utf8');

  const result = await call(tool, root, 'list_files', { path: 'docs' });

  assert.deepEqual(result.entries.map((entry) => entry.name), ['a.txt', 'nested']);
  await rejectsWith(call(tool, root, 'list_files', { path: 'docs', recurse: true }), 'INVALID_ARGS');
});

test('read_file returns exact UTF-8 text, byte length, and the content SHA-256', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  const original = '繁體中文\r\n第二行 😀';
  await writeFile(path.join(root, 'note.txt'), original, 'utf8');

  const result = await call(tool, root, 'read_file', { path: 'note.txt' });

  assert.equal(result.content, original);
  assert.equal(result.bytes, Buffer.byteLength(original, 'utf8'));
  assert.equal(result.hash, sha256(Buffer.from(original, 'utf8')));
});

test('read_file rejects malformed UTF-8 and files larger than 64 KiB', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  await writeFile(path.join(root, 'invalid.txt'), Buffer.from([0xc3, 0x28]));
  await writeFile(path.join(root, 'large.txt'), 'x'.repeat(65_537), 'utf8');

  await rejectsWith(call(tool, root, 'read_file', { path: 'invalid.txt' }), 'INVALID_UTF8');
  await rejectsWith(call(tool, root, 'read_file', { path: 'large.txt' }), 'FILE_TOO_LARGE');
});

test('file tools reject absolute paths, traversal, alternate streams, and device names', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  const invalidPaths = [
    '../outside.txt',
    'docs/../../outside.txt',
    'C:\\Windows\\win.ini',
    'C:relative.txt',
    '\\\\server\\share\\secret.txt',
    '/etc/passwd',
    'note.txt:stream',
    'NUL.txt',
    'COM1',
  ];

  for (const value of invalidPaths) {
    await assert.rejects(call(tool, root, 'read_file', { path: value }));
  }
});

test('tools protect agent rules, memory, private-key paths, and internal directories', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  const protectedPaths = [
    'agent.md',
    'memory.md',
    '.env',
    '.env.local',
    '.git/config',
    '.memory-bridge/turns.jsonl',
    '.file-agent/actions.jsonl',
    '.ssh/id_ed25519',
    'id_rsa',
    'server.key',
    'credentials.json',
  ];

  for (const value of protectedPaths) {
    await rejectsWith(call(tool, root, 'read_file', { path: value }), 'PROTECTED_PATH');
  }
  await rejectsWith(call(tool, root, 'create_file', { path: 'agent.md', content: '改寫規則' }), 'PROTECTED_PATH');
  await rejectsWith(call(tool, root, 'replace_text', {
    path: 'memory.md', search: 'x', replace: '新記憶', expectedHash: sha256(Buffer.alloc(0)),
  }), 'PROTECTED_PATH');
  await rejectsWith(call(tool, root, 'list_files', { path: '.memory-bridge' }), 'PROTECTED_PATH');
});

test('read_file blocks credential basenames under runtime without blocking runtime source', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  const credentialDirectory = path.join(root, 'runtime', 'upstream');
  const sourceDirectory = path.join(root, 'runtime', 'src');
  await mkdir(credentialDirectory, { recursive: true });
  await mkdir(sourceDirectory, { recursive: true });
  for (const name of ['auth.json', '.api-key', 'sessions.json', 'chrome-profile']) {
    await writeFile(path.join(credentialDirectory, name), 'credential fixture', 'utf8');
    await rejectsWith(call(tool, root, 'read_file', { path: `runtime/upstream/${name}` }), 'PROTECTED_PATH');
  }
  await writeFile(path.join(sourceDirectory, 'index.js'), 'export const source = true;', 'utf8');
  const source = await call(tool, root, 'read_file', { path: 'runtime/src/index.js' });
  assert.equal(source.content, 'export const source = true;');
});

test('create_file blocks credential basenames under runtime', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  await mkdir(path.join(root, 'runtime', 'upstream', 'create-targets'), { recursive: true });

  for (const name of ['auth.json', '.api-key', 'sessions.json', 'chrome-profile']) {
    await rejectsWith(call(tool, root, 'create_file', {
      path: `runtime/upstream/create-targets/${name}`,
      content: 'credential fixture',
    }), 'PROTECTED_PATH');
  }
});

test('replace_text blocks credential basenames under runtime', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  const targetDirectory = path.join(root, 'runtime', 'upstream', 'replace-targets');
  await mkdir(targetDirectory, { recursive: true });
  const original = 'credential fixture';
  const expectedHash = sha256(Buffer.from(original, 'utf8'));

  for (const name of ['auth.json', '.api-key', 'sessions.json', 'chrome-profile']) {
    await writeFile(path.join(targetDirectory, name), original, 'utf8');
    await rejectsWith(call(tool, root, 'replace_text', {
      path: `runtime/upstream/replace-targets/${name}`,
      search: 'credential',
      replace: 'changed',
      expectedHash,
    }), 'PROTECTED_PATH');
    assert.equal(await readFile(path.join(targetDirectory, name), 'utf8'), original);
  }
});

test('tool schemas reject missing, wrong-type, and unknown arguments', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);

  await rejectsWith(call(tool, root, 'list_files', { path: 5 }), 'INVALID_ARGS');
  await rejectsWith(call(tool, root, 'read_file', {}), 'INVALID_ARGS');
  await rejectsWith(call(tool, root, 'create_file', { path: 'x.txt', content: 'x', overwrite: true }), 'INVALID_ARGS');
  await rejectsWith(call(tool, root, 'replace_text', {
    path: 'x.txt', search: 'x', replace: 'y', expectedHash: 'a'.repeat(64), extra: true,
  }), 'INVALID_ARGS');
  await rejectsWith(call(tool, root, 'shell', { command: 'echo unsafe' }), 'INVALID_TOOL');
});

test('create_file creates exclusively, requires an existing parent, and audits the action', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  await mkdir(path.join(root, 'docs'));

  const result = await call(tool, root, 'create_file', { path: 'docs/new.txt', content: '新檔內容' });

  assert.equal(await readFile(path.join(root, 'docs', 'new.txt'), 'utf8'), '新檔內容');
  assert.equal(result.hash, sha256(Buffer.from('新檔內容', 'utf8')));
  await rejectsWith(call(tool, root, 'create_file', { path: 'docs/new.txt', content: '覆寫' }), 'FILE_EXISTS');
  await rejectsWith(call(tool, root, 'create_file', { path: 'missing/child.txt', content: 'x' }), 'PARENT_NOT_FOUND');
  const records = await actionRecords(root);
  assert.ok(records.some((record) => record.tool === 'create_file' && record.status === 'success'));
  assert.ok(records.some((record) => record.tool === 'create_file' && record.status === 'error'));
});

test('create_file permits empty content and enforces the 64 KiB limit', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  await call(tool, root, 'create_file', { path: 'empty.txt', content: '' });
  assert.equal(await readFile(path.join(root, 'empty.txt'), 'utf8'), '');

  await rejectsWith(call(tool, root, 'create_file', { path: 'too-large.txt', content: 'x'.repeat(65_537) }), 'FILE_TOO_LARGE');
  assert.equal(await readFile(path.join(root, 'too-large.txt')).catch(() => null), null);
});

test('create_file rejects a symlink leaf without changing its destination', async (t) => {
  const tool = runner();
  const { base, root } = await tempProject(t);
  const outside = path.join(base, 'outside-create.txt');
  await writeFile(outside, 'external sentinel', 'utf8');
  if (!(await symlinkOrSkip(t, outside, path.join(root, 'linked-create.txt'), 'file'))) return;

  await rejectsWith(call(tool, root, 'create_file', { path: 'linked-create.txt', content: 'must not follow' }), 'UNSAFE_PATH');

  assert.equal(await readFile(outside, 'utf8'), 'external sentinel');
});

test('replace_text checks the read hash, replaces one match, and writes a complete backup before audit', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  const original = 'title = draft\nbody = keep\n';
  await writeFile(path.join(root, 'settings.txt'), original, 'utf8');
  const before = Buffer.from(original, 'utf8');

  const result = await call(tool, root, 'replace_text', {
    path: 'settings.txt', search: 'title = draft', replace: 'title = final', expectedHash: sha256(before),
  });

  const updated = 'title = final\nbody = keep\n';
  assert.equal(await readFile(path.join(root, 'settings.txt'), 'utf8'), updated);
  assert.equal(result.hash, sha256(Buffer.from(updated, 'utf8')));
  assert.match(result.backup, /^\.file-agent\/backups\/[0-9a-f-]+\.json$/i);
  const backup = JSON.parse(await readFile(path.join(root, ...result.backup.split('/')), 'utf8'));
  assert.deepEqual(Object.keys(backup).sort(), ['afterHash', 'before', 'beforeHash', 'path', 'timestamp']);
  assert.equal(backup.before, original);
  assert.equal(backup.beforeHash, sha256(before));
  assert.equal(backup.afterHash, sha256(Buffer.from(updated, 'utf8')));
  assert.equal(backup.path, 'settings.txt');
  assert.ok(Number.isFinite(Date.parse(backup.timestamp)));
  const records = await actionRecords(root);
  assert.ok(records.some((record) => record.tool === 'replace_text' && record.status === 'success'));
});

test('replace_text rejects stale hashes, missing matches, repeated matches, and empty search', async (t) => {
  const tool = runner();
  const { root } = await tempProject(t);
  const original = 'key=old; key=old; ababa';
  await writeFile(path.join(root, 'settings.txt'), original, 'utf8');
  const expectedHash = sha256(Buffer.from(original, 'utf8'));

  await rejectsWith(call(tool, root, 'replace_text', {
    path: 'settings.txt', search: 'key=old', replace: 'key=new', expectedHash: '0'.repeat(64),
  }), 'HASH_MISMATCH');
  await rejectsWith(call(tool, root, 'replace_text', {
    path: 'settings.txt', search: 'missing', replace: 'new', expectedHash,
  }), 'SEARCH_NOT_UNIQUE');
  await rejectsWith(call(tool, root, 'replace_text', {
    path: 'settings.txt', search: 'key=old', replace: 'key=new', expectedHash,
  }), 'SEARCH_NOT_UNIQUE');
  await rejectsWith(call(tool, root, 'replace_text', {
    path: 'settings.txt', search: 'aba', replace: 'x', expectedHash,
  }), 'SEARCH_NOT_UNIQUE');
  await rejectsWith(call(tool, root, 'replace_text', {
    path: 'settings.txt', search: '', replace: 'x', expectedHash,
  }), 'INVALID_ARGS');
  assert.equal(await readFile(path.join(root, 'settings.txt'), 'utf8'), original);
  const backupNames = await readdir(path.join(root, '.file-agent', 'backups'));
  assert.deepEqual(backupNames, []);
  const records = await actionRecords(root);
  assert.equal(records.filter((record) => record.tool === 'replace_text' && record.status === 'error').length, 5);
});

test('replace_text refuses a hard-linked file without changing either link', async (t) => {
  const tool = runner();
  const { base, root } = await tempProject(t);
  const target = path.join(root, 'linked.txt');
  const outside = path.join(base, 'outside-linked.txt');
  await writeFile(target, 'original', 'utf8');
  await link(target, outside);
  assert.equal((await lstat(target)).nlink, 2);

  await rejectsWith(call(tool, root, 'replace_text', {
    path: 'linked.txt', search: 'original', replace: 'updated', expectedHash: sha256(Buffer.from('original')),
  }), 'HARDLINK_UNSAFE');

  assert.equal(await readFile(target, 'utf8'), 'original');
  assert.equal(await readFile(outside, 'utf8'), 'original');
});

test('read_file refuses a hard-linked file without exposing outside contents', async (t) => {
  const tool = runner();
  const { base, root } = await tempProject(t);
  const outside = path.join(base, 'outside-secret.txt');
  const linked = path.join(root, 'ordinary-name.txt');
  await writeFile(outside, 'private outside text', 'utf8');
  await link(outside, linked);
  assert.equal((await lstat(linked)).nlink, 2);

  await rejectsWith(call(tool, root, 'read_file', { path: 'ordinary-name.txt' }), 'HARDLINK_UNSAFE');

  assert.equal(await readFile(outside, 'utf8'), 'private outside text');
});

test('read_file rejects a symlinked leaf and a junction in any parent component', async (t) => {
  const tool = runner();
  const { base, root } = await tempProject(t);
  const outsideFile = path.join(base, 'outside.txt');
  const outsideDir = path.join(base, 'outside-dir');
  await writeFile(outsideFile, 'external leaf', 'utf8');
  await mkdir(outsideDir);
  await writeFile(path.join(outsideDir, 'inside.txt'), 'external directory', 'utf8');
  if (!(await symlinkOrSkip(t, outsideFile, path.join(root, 'leaf-link.txt'), 'file'))) return;
  if (!(await symlinkOrSkip(t, outsideDir, path.join(root, 'junction'), 'junction'))) return;

  await rejectsWith(call(tool, root, 'read_file', { path: 'leaf-link.txt' }), 'UNSAFE_PATH');
  await rejectsWith(call(tool, root, 'read_file', { path: 'junction/inside.txt' }), 'UNSAFE_PATH');
});

test('file tools reject a symlinked internal backup directory before modifying the target', async (t) => {
  const tool = runner();
  const { base, root } = await tempProject(t);
  await mkdir(path.join(root, '.file-agent'));
  const outside = path.join(base, 'outside-backups');
  await mkdir(outside);
  await writeFile(path.join(outside, 'sentinel'), 'keep', 'utf8');
  if (!(await symlinkOrSkip(t, outside, path.join(root, '.file-agent', 'backups'), 'junction'))) return;
  const original = 'value=old';
  await writeFile(path.join(root, 'settings.txt'), original, 'utf8');

  await assert.rejects(call(tool, root, 'replace_text', {
    path: 'settings.txt', search: 'old', replace: 'new', expectedHash: sha256(Buffer.from(original)),
  }));

  assert.equal(await readFile(path.join(root, 'settings.txt'), 'utf8'), original);
  assert.equal(await readFile(path.join(outside, 'sentinel'), 'utf8'), 'keep');
  assert.equal(await readFile(path.join(outside, 'actions.jsonl')).catch(() => null), null);
});

test('file tools reject symlinked audit files before creating user files', async (t) => {
  const tool = runner();
  const { base, root } = await tempProject(t);
  await mkdir(path.join(root, '.file-agent'));
  const outside = path.join(base, 'outside-audit.jsonl');
  await writeFile(outside, 'sentinel\n', 'utf8');
  if (!(await symlinkOrSkip(t, outside, path.join(root, '.file-agent', 'actions.jsonl'), 'file'))) return;

  await assert.rejects(call(tool, root, 'create_file', { path: 'must-not-exist.txt', content: 'blocked' }));

  assert.equal(await readFile(outside, 'utf8'), 'sentinel\n');
  assert.equal(await readFile(path.join(root, 'must-not-exist.txt')).catch(() => null), null);
});
