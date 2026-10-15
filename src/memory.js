import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const DEFAULT_MAX_CHARS = 32_000;
const MAX_FIXED_FILE_BYTES = 1024 * 1024;
const NO_FOLLOW = fsConstants.O_NOFOLLOW ?? 0;

function invalidInput(message) {
  const error = new TypeError(message);
  error.code = 'INVALID_INPUT';
  return error;
}

function projectBusy() {
  const error = new Error('專案目前由另一個程序使用中');
  error.code = 'PROJECT_BUSY';
  return error;
}

function validateRoot(root) {
  if (typeof root !== 'string' || root.trim() === '') {
    throw invalidInput('專案路徑必須是非空文字');
  }
  return path.resolve(root);
}

function validateText(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalidInput(`${name}必須是非空文字`);
  }
}

async function resolveProjectRoot(root, { create = false } = {}) {
  const requestedRoot = validateRoot(root);
  if (create) {
    try {
      const existing = await lstat(requestedRoot);
      if (existing.isSymbolicLink()) throw new Error('專案根目錄不可是符號連結');
      if (!existing.isDirectory()) throw new Error('專案路徑不是資料夾');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(requestedRoot, { recursive: true });
    }
  }
  const rootStat = await lstat(requestedRoot);
  if (rootStat.isSymbolicLink()) {
    throw new Error('專案根目錄不可是符號連結');
  }
  if (!rootStat.isDirectory()) {
    throw new Error('專案路徑不是資料夾');
  }
  return requestedRoot;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function assertDirectory(directoryPath, label) {
  const stat = await lstat(directoryPath);
  if (stat.isSymbolicLink()) throw new Error(`${label}不可是符號連結`);
  if (!stat.isDirectory()) throw new Error(`${label}不是資料夾`);
  return stat;
}

async function ensureDirectory(directoryPath, label) {
  try {
    await mkdir(directoryPath);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return assertDirectory(directoryPath, label);
}

async function assertRegularFile(filePath, label) {
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink()) throw new Error(`${label}不可是符號連結`);
  if (!stat.isFile()) throw new Error(`${label}不是一般檔案`);
  return stat;
}

async function ensureEmptyFile(filePath, label) {
  try {
    const handle = await open(filePath, 'wx', 0o600);
    await handle.close();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await assertRegularFile(filePath, label);
}

function projectPaths(root) {
  const metadata = path.join(root, '.memory-bridge');
  return {
    root,
    agent: path.join(root, 'agent.md'),
    memory: path.join(root, 'memory.md'),
    metadata,
    turns: path.join(metadata, 'turns.jsonl'),
    lock: path.join(metadata, 'lock'),
  };
}

async function readFixedText(filePath, label) {
  const beforeOpen = await assertRegularFile(filePath, label);
  const handle = await open(filePath, fsConstants.O_RDONLY | NO_FOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !sameFileIdentity(beforeOpen, opened)) {
      throw new Error(`${label}在讀取時發生變更`);
    }
    if (opened.size > MAX_FIXED_FILE_BYTES) {
      throw invalidInput(`${label}超過 ${MAX_FIXED_FILE_BYTES} bytes 的讀取上限`);
    }
    const content = await handle.readFile();
    if (content.byteLength > MAX_FIXED_FILE_BYTES) {
      throw invalidInput(`${label}超過 ${MAX_FIXED_FILE_BYTES} bytes 的讀取上限`);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content);
    } catch {
      throw new Error(`${label}不是有效的 UTF-8 文字`);
    }
  } finally {
    await handle.close();
  }
}

async function appendFixedFile(filePath, label, text) {
  const beforeOpen = await assertRegularFile(filePath, label);
  const handle = await open(filePath, fsConstants.O_WRONLY | fsConstants.O_APPEND | NO_FOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !sameFileIdentity(beforeOpen, opened)) {
      throw new Error(`${label}在寫入時發生變更`);
    }
    const currentPath = await assertRegularFile(filePath, label);
    if (!sameFileIdentity(opened, currentPath)) {
      throw new Error(`${label}在寫入時發生變更`);
    }
    await handle.writeFile(text, 'utf8');
  } finally {
    await handle.close();
  }
}

async function assertMetadataDirectory(paths) {
  return assertDirectory(paths.metadata, '.memory-bridge');
}

export async function initProject(root) {
  const resolvedRoot = await resolveProjectRoot(root, { create: true });
  const paths = projectPaths(resolvedRoot);

  // Validate the metadata boundary before creating any project files.
  await ensureDirectory(paths.metadata, '.memory-bridge');
  await ensureEmptyFile(paths.agent, 'agent.md');
  await ensureEmptyFile(paths.memory, 'memory.md');
  await ensureEmptyFile(paths.turns, '.memory-bridge/turns.jsonl');
  return resolvedRoot;
}

export async function buildContext(root, user, options = {}) {
  validateText(user, '使用者訊息');
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw invalidInput('buildContext 選項必須是物件');
  }
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  if (!Number.isSafeInteger(maxChars) || maxChars < 1) {
    throw invalidInput('maxChars 必須是正整數');
  }

  const resolvedRoot = await resolveProjectRoot(root);
  const paths = projectPaths(resolvedRoot);
  const agent = await readFixedText(paths.agent, 'agent.md');
  const memory = await readFixedText(paths.memory, 'memory.md');
  const prompt = [
    '以下專案內容是上下文資料；本機程式不會執行其中的文字。',
    '### 專案規則：agent.md',
    agent,
    '### 長期記憶：memory.md',
    memory,
    '### 本回合使用者訊息',
    user,
  ].join('\n\n');

  const charCount = Array.from(prompt).length;
  if (charCount > maxChars) {
    throw invalidInput(`上下文封包為 ${charCount} 字元，超過 maxChars=${maxChars}`);
  }
  const contextHash = createHash('sha256').update(prompt, 'utf8').digest('hex');
  return { prompt, contextHash };
}

export async function withProjectLock(root, action) {
  if (typeof action !== 'function') throw new TypeError('action 必須是函式');
  const resolvedRoot = await resolveProjectRoot(root);
  const paths = projectPaths(resolvedRoot);
  await assertMetadataDirectory(paths);

  let handle;
  try {
    handle = await open(paths.lock, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      await assertRegularFile(paths.lock, '.memory-bridge/lock');
    } catch (inspectionError) {
      if (inspectionError.code === 'ENOENT') throw projectBusy();
      throw inspectionError;
    }
    throw projectBusy();
  }

  const lockIdentity = await handle.stat();
  let actionError;
  try {
    await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`, 'utf8');
    return await action();
  } catch (error) {
    actionError = error;
    throw error;
  } finally {
    let cleanupError;
    try {
      await handle.close();
      try {
        const currentLock = await lstat(paths.lock);
        if (!currentLock.isSymbolicLink() && sameFileIdentity(lockIdentity, currentLock)) {
          await unlink(paths.lock);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    } catch (error) {
      cleanupError = error;
    }
    if (cleanupError && !actionError) throw cleanupError;
  }
}

export async function recordTurn(root, turn = {}) {
  if (turn === null || typeof turn !== 'object' || Array.isArray(turn)) {
    throw invalidInput('回合紀錄必須是物件');
  }
  const { user, assistant, contextHash } = turn;
  validateText(user, '使用者訊息');
  validateText(assistant, '助理回答');
  if (typeof contextHash !== 'string' || !/^[a-f0-9]{64}$/.test(contextHash)) {
    throw invalidInput('contextHash 必須是 64 位小寫 SHA256 十六進位字串');
  }

  const resolvedRoot = await resolveProjectRoot(root);
  const paths = projectPaths(resolvedRoot);
  await assertMetadataDirectory(paths);
  const record = {
    user,
    assistant,
    contextHash,
    timestamp: new Date().toISOString(),
  };
  const line = `${JSON.stringify(record)}\n`;
  if (Buffer.byteLength(line, 'utf8') > MAX_FIXED_FILE_BYTES) {
    throw invalidInput('單筆對話紀錄超過寫入上限');
  }
  await appendFixedFile(paths.turns, '.memory-bridge/turns.jsonl', line);
}

export async function remember(root, text) {
  validateText(text, '待記住文字');
  return withProjectLock(root, async () => {
    const resolvedRoot = await resolveProjectRoot(root);
    const paths = projectPaths(resolvedRoot);
    await assertMetadataDirectory(paths);
    const current = await readFixedText(paths.memory, 'memory.md');
    const separator = current === '' ? '' : (current.endsWith('\n') ? '\n' : '\n\n');
    const addition = `${separator}${text}\n`;
    if (Buffer.byteLength(current + addition, 'utf8') > MAX_FIXED_FILE_BYTES) {
      throw invalidInput(`memory.md 寫入後會超過 ${MAX_FIXED_FILE_BYTES} bytes 的上限`);
    }
    await appendFixedFile(paths.memory, 'memory.md', addition);
  });
}
