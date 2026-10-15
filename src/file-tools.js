import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const MAX_FILE_BYTES = 64 * 1024;
const MAX_LIST_ENTRIES = 200;
const NO_FOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const PRIVATE_EXTENSIONS = /\.(?:pem|key|ppk|p12|pfx|p7b|p7c|jks|keystore|der)$/i;
const PRIVATE_NAMES = /^(?:id_(?:rsa|dsa|ecdsa|ed25519)|ssh_host_.*_key|private(?:[-_].*)?|credentials(?:\..*)?|secrets?(?:\..*)?|access[_-]?token(?:\..*)?|application_default_credentials\.json|credentials\.db|access_tokens\.db)$/i;
const WINDOWS_DEVICES = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])$/i;
const TOOL_NAMES = new Set(['list_files', 'read_file', 'create_file', 'replace_text']);
const TOOL_SCHEMAS = {
  list_files: { allowed: ['path'], required: [] },
  read_file: { allowed: ['path'], required: ['path'] },
  create_file: { allowed: ['path', 'content'], required: ['path', 'content'] },
  replace_text: {
    allowed: ['path', 'search', 'replace', 'expectedHash'],
    required: ['path', 'search', 'replace', 'expectedHash'],
  },
};

function toolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function invalidArgs(message) {
  return toolError('INVALID_ARGS', message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw toolError('INVALID_UTF8', `${label}不是有效的 UTF-8 文字`);
  }
}

function encodeUtf8(text, label) {
  const bytes = Buffer.from(text, 'utf8');
  if (decodeUtf8(bytes, label) !== text) {
    throw invalidArgs(`${label}必須是有效的 Unicode 文字`);
  }
  return bytes;
}

function validateArgs(name, args) {
  if (args === undefined && name === 'list_files') args = {};
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw invalidArgs(`${name} arguments 必須是物件`);
  }
  const prototype = Object.getPrototypeOf(args);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalidArgs('arguments 必須是一般 JSON 物件');
  }

  const schema = TOOL_SCHEMAS[name];
  const descriptors = Object.getOwnPropertyDescriptors(args);
  for (const key of Reflect.ownKeys(args)) {
    if (typeof key !== 'string' || !schema.allowed.includes(key)) {
      throw invalidArgs(`不支援的參數：${String(key)}`);
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidArgs(`參數 ${key} 必須是一般資料欄位`);
    }
  }
  for (const key of schema.required) {
    if (!Object.hasOwn(args, key)) throw invalidArgs(`缺少必要參數：${key}`);
  }

  const values = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
  if (Object.hasOwn(values, 'path') && typeof values.path !== 'string') {
    throw invalidArgs('path 必須是文字');
  }
  if (name === 'create_file' && typeof values.content !== 'string') {
    throw invalidArgs('content 必須是文字');
  }
  if (name === 'replace_text') {
    if (typeof values.search !== 'string' || values.search === '') throw invalidArgs('search 必須是非空文字');
    if (typeof values.replace !== 'string') throw invalidArgs('replace 必須是文字');
    if (typeof values.expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(values.expectedHash)) {
      throw invalidArgs('expectedHash 必須是 64 位小寫 SHA-256 十六進位字串');
    }
  }
  return values;
}

function validateRoot(root) {
  if (typeof root !== 'string' || root.trim() === '') {
    throw toolError('INVALID_PATH', 'project 必須是非空路徑');
  }
  return path.resolve(root);
}

async function resolveRoot(root) {
  const absoluteRoot = validateRoot(root);
  const stat = await lstat(absoluteRoot);
  if (stat.isSymbolicLink()) throw toolError('UNSAFE_PATH', '專案根目錄不可是符號連結');
  if (!stat.isDirectory()) throw toolError('NOT_DIRECTORY', '專案根目錄不是資料夾');
  return absoluteRoot;
}

function isWindowsDevice(component) {
  const base = component.split('.')[0].replace(/[ .]+$/g, '');
  return WINDOWS_DEVICES.test(base);
}

function isProtectedComponent(component) {
  const lower = component.toLowerCase();
  if (['.git', '.memory-bridge', '.file-agent', '.ssh', '.aws', '.azure', '.gnupg'].includes(lower)) return true;
  if (['auth.json', '.api-key', 'sessions.json', 'chrome-profile'].includes(lower)) return true;
  if (lower === '.env' || lower.startsWith('.env.')) return true;
  if (['.netrc', '.npmrc', '.pypirc', '.git-credentials'].includes(lower)) return true;
  if (PRIVATE_EXTENSIONS.test(component) || PRIVATE_NAMES.test(component)) return true;
  return isWindowsDevice(component);
}

function normalizeRelativePath(value, { allowRoot = false } = {}) {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\0')) {
    throw toolError('INVALID_PATH', 'path 必須是有效的專案內相對路徑');
  }
  if (value === '' && allowRoot) return { parts: [], relative: '.' };
  if (value === '.' && allowRoot) return { parts: [], relative: '.' };
  if (
    value.startsWith('/') || value.startsWith('\\') || path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) || /^[a-z]:/i.test(value)
  ) {
    throw toolError('INVALID_PATH', '不允許絕對路徑');
  }
  if (value.includes(':')) throw toolError('INVALID_PATH', '不允許 Windows alternate data streams');

  const portable = value.replaceAll('\\', '/');
  const parts = portable.split('/');
  if (parts.length === 0 || parts.some((part) => part === '' || part === '..' || part === '.')) {
    throw toolError('INVALID_PATH', '不允許空白、點或上層路徑元件');
  }
  for (const part of parts) {
    if (/[. ]$/.test(part) || /[<>"|?*\u0001-\u001f]/.test(part)) {
      throw toolError('INVALID_PATH', 'path 含 Windows 不安全字元或尾端點/空白');
    }
  }
  return { parts, relative: parts.join('/') };
}

function isProtectedPath(parts) {
  if (parts.length === 1 && ['agent.md', 'memory.md'].includes(parts[0].toLowerCase())) return true;
  return parts.some(isProtectedComponent);
}

function ensureNotProtected(parts) {
  if (isProtectedPath(parts)) {
    throw toolError('PROTECTED_PATH', '此路徑包含受保護的專案資料或憑證檔');
  }
}

async function lstatPath(target, { missingCode = 'NOT_FOUND' } = {}) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') throw toolError(missingCode, '指定路徑不存在');
    throw error;
  }
}

async function assertDirectory(target, label, missingCode = 'NOT_FOUND') {
  const stat = await lstatPath(target, { missingCode });
  if (stat.isSymbolicLink()) throw toolError('UNSAFE_PATH', `${label}不可是 symlink 或 junction`);
  if (!stat.isDirectory()) throw toolError('NOT_DIRECTORY', `${label}不是資料夾`);
  return stat;
}

async function assertRegularFile(target, label, missingCode = 'NOT_FOUND') {
  const stat = await lstatPath(target, { missingCode });
  if (stat.isSymbolicLink()) throw toolError('UNSAFE_PATH', `${label}不可是 symlink 或 junction`);
  if (!stat.isFile()) throw toolError('NOT_FILE', `${label}不是一般檔案`);
  return stat;
}

async function ensureDirectory(target, label) {
  try {
    await mkdir(target);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return assertDirectory(target, label);
}

async function ensureInternalFile(target, label) {
  try {
    const handle = await open(target, 'wx', 0o600);
    await handle.close();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const stat = await assertRegularFile(target, label);
  if (stat.nlink > 1) throw toolError('UNSAFE_INTERNAL_PATH', `${label}不可有多個 hard link`);
  return stat;
}

async function prepareInternalFiles(root) {
  const directory = path.join(root, '.file-agent');
  const backups = path.join(directory, 'backups');
  const audit = path.join(directory, 'actions.jsonl');
  await ensureDirectory(directory, '.file-agent');
  await ensureDirectory(backups, '.file-agent/backups');
  await ensureInternalFile(audit, '.file-agent/actions.jsonl');
  return { directory, backups, audit };
}

async function assertInternalBoundaries(root, internal) {
  await assertDirectory(internal.directory, '.file-agent');
  await assertDirectory(internal.backups, '.file-agent/backups');
  const stat = await assertRegularFile(internal.audit, '.file-agent/actions.jsonl');
  if (stat.nlink > 1) throw toolError('UNSAFE_INTERNAL_PATH', '.file-agent/actions.jsonl 不可有多個 hard link');
  return stat;
}

async function resolveExisting(root, parts, { expect = 'either', missingCode = 'NOT_FOUND' } = {}) {
  let current = root;
  let stat = await assertDirectory(root, '專案根目錄');
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    stat = await lstatPath(current, { missingCode });
    if (stat.isSymbolicLink()) throw toolError('UNSAFE_PATH', 'path component 不可是 symlink 或 junction');
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw toolError('NOT_DIRECTORY', 'path 的中間元件必須是資料夾');
    }
  }
  if (expect === 'directory' && !stat.isDirectory()) throw toolError('NOT_DIRECTORY', '指定路徑不是資料夾');
  if (expect === 'file' && !stat.isFile()) throw toolError('NOT_FILE', '指定路徑不是一般檔案');
  if (expect === 'either' && !stat.isDirectory() && !stat.isFile()) {
    throw toolError('UNSAFE_PATH', '不支援特殊檔案或裝置');
  }
  return { absolute: current, stat };
}

async function readRegularFile(root, parts) {
  const target = await resolveExisting(root, parts, { expect: 'file' });
  if (target.stat.nlink > 1) {
    throw toolError('HARDLINK_UNSAFE', '拒絕存取具有多個 hard link 的檔案');
  }
  if (target.stat.size > MAX_FILE_BYTES) throw toolError('FILE_TOO_LARGE', '檔案超過 64 KiB 上限');

  let handle;
  try {
    handle = await open(target.absolute, fsConstants.O_RDONLY | NO_FOLLOW);
  } catch (error) {
    if (['ELOOP', 'EMLINK'].includes(error.code)) throw toolError('UNSAFE_PATH', '拒絕開啟 symlink 或 hardlink');
    throw error;
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !sameFileIdentity(target.stat, opened)) {
      throw toolError('UNSAFE_PATH', '檔案在開啟時發生變更');
    }
    if (opened.nlink > 1) throw toolError('HARDLINK_UNSAFE', '拒絕存取具有多個 hard link 的檔案');
    if (opened.size > MAX_FILE_BYTES) throw toolError('FILE_TOO_LARGE', '檔案超過 64 KiB 上限');
    const bytes = await handle.readFile();
    if (bytes.byteLength > MAX_FILE_BYTES) throw toolError('FILE_TOO_LARGE', '檔案超過 64 KiB 上限');
    const finalStat = await assertRegularFile(target.absolute, '指定檔案');
    if (!sameFileIdentity(opened, finalStat)) throw toolError('UNSAFE_PATH', '檔案在讀取時發生變更');
    if (finalStat.nlink > 1) throw toolError('HARDLINK_UNSAFE', '拒絕存取具有多個 hard link 的檔案');
    return { ...target, stat: opened, bytes, text: decodeUtf8(bytes, '檔案'), hash: sha256(bytes) };
  } finally {
    await handle.close();
  }
}

async function appendAudit(internal, record) {
  await assertInternalBoundaries(path.dirname(internal.directory), internal);
  const before = await assertRegularFile(internal.audit, '.file-agent/actions.jsonl');
  if (before.nlink > 1) throw toolError('UNSAFE_INTERNAL_PATH', '拒絕寫入 hard-linked audit');
  const handle = await open(internal.audit, fsConstants.O_WRONLY | fsConstants.O_APPEND | NO_FOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !sameFileIdentity(before, opened) || opened.nlink > 1) {
      throw toolError('UNSAFE_INTERNAL_PATH', 'audit 檔在寫入時發生變更');
    }
    const current = await assertRegularFile(internal.audit, '.file-agent/actions.jsonl');
    if (!sameFileIdentity(opened, current) || current.nlink > 1) {
      throw toolError('UNSAFE_INTERNAL_PATH', 'audit 檔在寫入時發生變更');
    }
    await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function createBackup(internal, backup) {
  await assertInternalBoundaries(path.dirname(internal.directory), internal);
  const id = randomUUID();
  const relative = `.file-agent/backups/${id}.json`;
  const absolute = path.join(internal.backups, `${id}.json`);
  const handle = await open(absolute, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(backup)}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(absolute).catch(() => {});
    throw error;
  }
  await handle.close();
  return relative;
}

async function listFiles(root, parts, relative) {
  const directory = await resolveExisting(root, parts, { expect: 'directory' });
  let names;
  try {
    names = await readdir(directory.absolute);
  } catch (error) {
    if (error.code === 'ENOENT') throw toolError('NOT_FOUND', '指定資料夾不存在');
    throw error;
  }
  names.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const entries = [];
  for (const name of names) {
    const childParts = [...parts, name];
    if (isProtectedPath(childParts) || isWindowsDevice(name)) continue;
    let stat;
    try {
      stat = await lstat(path.join(directory.absolute, name));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isFile()) entries.push({ name, type: 'file', size: stat.size });
    else if (stat.isDirectory()) entries.push({ name, type: 'directory' });
  }
  return {
    path: relative,
    entries: entries.slice(0, MAX_LIST_ENTRIES),
    truncated: entries.length > MAX_LIST_ENTRIES,
  };
}

async function readFileTool(root, parts, relative) {
  const file = await readRegularFile(root, parts);
  return { path: relative, content: file.text, bytes: file.bytes.byteLength, hash: file.hash };
}

async function createFileTool(root, parts, relative, content) {
  const bytes = encodeUtf8(content, 'content');
  if (bytes.byteLength > MAX_FILE_BYTES) throw toolError('FILE_TOO_LARGE', '新檔內容超過 64 KiB 上限');
  const parentParts = parts.slice(0, -1);
  await resolveExisting(root, parentParts, { expect: 'directory', missingCode: 'PARENT_NOT_FOUND' });
  const absolute = path.join(root, ...parts);
  try {
    const existing = await lstat(absolute);
    if (existing.isSymbolicLink()) throw toolError('UNSAFE_PATH', 'create_file 目標不可是 symlink 或 junction');
    throw toolError('FILE_EXISTS', 'create_file 不會覆寫既有檔案');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let handle;
  let identity;
  try {
    handle = await open(absolute, 'wx', 0o600);
    identity = await handle.stat();
    if (!identity.isFile() || identity.nlink > 1) throw toolError('UNSAFE_PATH', '新檔不是安全的一般檔案');
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (error.code === 'EEXIST') throw toolError('FILE_EXISTS', 'create_file 不會覆寫既有檔案');
    if (identity) {
      try {
        const current = await lstat(absolute);
        if (!current.isSymbolicLink() && sameFileIdentity(identity, current)) await unlink(absolute);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') throw cleanupError;
      }
    }
    throw error;
  }
  return { path: relative, bytes: bytes.byteLength, hash: sha256(bytes) };
}

function countMatches(text, search) {
  let count = 0;
  let position = 0;
  while ((position = text.indexOf(search, position)) !== -1) {
    count += 1;
    position += 1;
  }
  return count;
}

async function atomicReplace(root, parts, original, afterBytes) {
  const target = original.absolute;
  const parent = path.dirname(target);
  const temporary = path.join(parent, `.file-agent-write-${randomUUID()}.tmp`);
  const mode = original.stat.mode & 0o777;
  let handle;
  let temporaryIdentity;
  try {
    handle = await open(temporary, 'wx', mode || 0o600);
    temporaryIdentity = await handle.stat();
    await handle.writeFile(afterBytes);
    await handle.sync();
    await handle.close();
    handle = undefined;

    const current = await readRegularFile(root, parts);
    if (!sameFileIdentity(original.stat, current.stat) || current.hash !== original.hash) {
      throw toolError('HASH_MISMATCH', '檔案在替換期間已變動');
    }
    await rename(temporary, target);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (temporaryIdentity) {
      try {
        const current = await lstat(temporary);
        if (!current.isSymbolicLink() && sameFileIdentity(temporaryIdentity, current)) await unlink(temporary);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') throw cleanupError;
      }
    }
    throw error;
  }
}

async function replaceTextTool(root, internal, parts, relative, { search, replace, expectedHash }) {
  const original = await readRegularFile(root, parts);
  if (original.hash !== expectedHash) throw toolError('HASH_MISMATCH', '檔案雜湊已變動，請重新讀取後再修改');
  if (countMatches(original.text, search) !== 1) {
    throw toolError('SEARCH_NOT_UNIQUE', 'search 必須在目前檔案中完全相符一次');
  }
  const index = original.text.indexOf(search);
  const afterText = `${original.text.slice(0, index)}${replace}${original.text.slice(index + search.length)}`;
  const afterBytes = encodeUtf8(afterText, 'replace 結果');
  if (afterBytes.byteLength > MAX_FILE_BYTES) throw toolError('FILE_TOO_LARGE', '替換結果超過 64 KiB 上限');
  const afterHash = sha256(afterBytes);
  const backup = {
    before: original.text,
    beforeHash: original.hash,
    afterHash,
    path: relative,
    timestamp: new Date().toISOString(),
  };
  const backupPath = await createBackup(internal, backup);
  await atomicReplace(root, parts, original, afterBytes);
  return { path: relative, bytes: afterBytes.byteLength, hash: afterHash, backup: backupPath };
}

function auditRecord(tool, relative, status, extra = {}) {
  return {
    timestamp: new Date().toISOString(),
    tool,
    path: relative,
    status,
    ...extra,
  };
}

export async function runFileTool(root, name, args) {
  const absoluteRoot = await resolveRoot(root);
  const internal = await prepareInternalFiles(absoluteRoot);
  const safeToolName = typeof name === 'string' && TOOL_NAMES.has(name) ? name : 'unknown';
  let relative = null;
  let result;

  try {
    if (!TOOL_NAMES.has(name)) throw toolError('INVALID_TOOL', '不支援的檔案工具');
    const values = validateArgs(name, args);
    const normalized = normalizeRelativePath(values.path ?? '', { allowRoot: name === 'list_files' });
    relative = normalized.relative;
    ensureNotProtected(normalized.parts);

    if (name === 'list_files') result = await listFiles(absoluteRoot, normalized.parts, relative);
    else if (name === 'read_file') result = await readFileTool(absoluteRoot, normalized.parts, relative);
    else if (name === 'create_file') result = await createFileTool(absoluteRoot, normalized.parts, relative, values.content);
    else result = await replaceTextTool(absoluteRoot, internal, normalized.parts, relative, values);
  } catch (error) {
    try {
      await appendAudit(internal, auditRecord(safeToolName, relative, 'error', {
        errorCode: error.code ?? 'FILE_TOOL_ERROR',
      }));
    } catch (auditError) {
      throw toolError('AUDIT_FAILURE', `工具操作失敗且無法寫入 audit：${error.message}; ${auditError.message}`);
    }
    throw error;
  }

  try {
    await appendAudit(internal, auditRecord(safeToolName, relative, 'success', {
      hash: result.hash ?? null,
      backup: result.backup ?? null,
    }));
  } catch (error) {
    throw toolError('AUDIT_FAILURE', `工具操作已執行，但 audit 寫入失敗：${error.message}`);
  }
  return result;
}
