import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const failures = [];
const docs = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (extname(path) === '.md') docs.push(path);
  }
}

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && extname(entry.name) === '.md') docs.push(resolve(root, entry.name));
}
for (const directory of ['docs', 'skills', 'assets', 'examples']) await collect(resolve(root, directory));

let checkedLinks = 0;
for (const path of docs) {
  const markdown = await readFile(path, 'utf8');
  const text = markdown.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  const targets = [
    ...[...text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map(match => match[1]),
    ...[...text.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(match => match[1]),
  ];
  for (const target of targets) {
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
    checkedLinks++;
    const local = decodeURIComponent(target.replace(/[?#].*$/, ''));
    const destination = resolve(dirname(path), local);
    const within = relative(root, destination);
    if (within.startsWith('..') || /^(?:[a-z]:|\/)/i.test(within)) {
      failures.push(`${relative(root, path)}: link escapes repository: ${target}`);
      continue;
    }
    try { await stat(destination); }
    catch { failures.push(`${relative(root, path)}: missing link: ${target}`); }
  }
}

for (const name of ['README.md', 'README.zh-TW.md']) {
  const text = await readFile(resolve(root, name), 'utf8');
  for (const required of ['README.md', 'README.zh-TW.md', 'assets/header.png', 'assets/flow-heatmap.gif', 'assets/flow-heatmap-static.png']) {
    if (!text.includes(required)) failures.push(`${name}: missing language link or visual: ${required}`);
  }
}

// Parse GIF blocks rather than counting bytes that could also occur in pixels.
const gif = await readFile(resolve(root, 'assets/flow-heatmap.gif'));
let position = 13 + ((gif[10] & 128) ? 3 * (2 ** ((gif[10] & 7) + 1)) : 0);
let frames = 0;
function skipBlocks() {
  while (position < gif.length) {
    const length = gif[position++];
    if (length === 0) return;
    position += length;
  }
  throw new Error('Incomplete GIF data blocks');
}
if (!/^GIF8[79]a$/.test(gif.subarray(0, 6).toString())) failures.push('Invalid GIF signature');
else {
  try {
    while (position < gif.length) {
      const type = gif[position++];
      if (type === 0x3b) break;
      if (type === 0x21) { position++; skipBlocks(); }
      else if (type === 0x2c) {
        const packed = gif[position + 8];
        position += 9 + ((packed & 128) ? 3 * (2 ** ((packed & 7) + 1)) : 0);
        position++; // LZW minimum code size.
        skipBlocks();
        frames++;
      } else throw new Error(`Unexpected GIF block: ${type}`);
    }
  } catch (error) { failures.push(error.message); }
}
if (frames < 2) failures.push('Heatmap must contain multiple animation frames');
if (gif.length > 10 * 1024 * 1024) failures.push('Heatmap exceeds the 10 MiB asset budget');

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
for (const path of tracked) {
  if (/(^|\/)(?:runtime|node_modules|chrome-profile|\.memory-bridge|\.file-agent)(\/|$)/i.test(path)
      || /(^|\/)(?:auth\.json|sessions\.json|\.api-key|\.env(?:\..+)?)$/i.test(path) && !path.endsWith('.env.example')) {
    failures.push(`Private runtime or credential file is tracked: ${path}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else console.log(`Docs verified: ${docs.length} Markdown files, ${checkedLinks} local links, ${frames} GIF frames; ${tracked.length} tracked paths checked.`);
