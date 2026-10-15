import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

async function fixture(script) {
  const root = await mkdtemp(path.join(tmpdir(), 'memory-launch-'));
  await mkdir(path.join(root, 'scripts'));
  const launcher = path.join(root, 'scripts', script);
  await copyFile(fileURLToPath(new URL(`../scripts/${script}`, import.meta.url)), launcher);
  return { root, launcher };
}
function powershell(launcher, code) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], {
    encoding: 'utf8', timeout: 15000, env: { ...process.env, MEMORY_TEST_LAUNCHER: launcher }
  });
}

test('core launcher restores existing shell environment after the child exits', { skip: process.platform !== 'win32' }, async () => {
  const { root, launcher } = await fixture('Start-DeepSeekCore.ps1');
  try {
    await mkdir(path.join(root, 'core/dist'), { recursive: true });
    await writeFile(path.join(root, 'core/dist/index.js'), 'process.exit(0);');
    const result = powershell(launcher, `$ErrorActionPreference='Stop'; $env:HOST='before'; $env:DS_API_KEY='existing-test-key'; & $env:MEMORY_TEST_LAUNCHER -Action start; if($env:HOST -ne 'before' -or $env:DS_API_KEY -ne 'existing-test-key'){ throw 'Environment was not restored' }`);
    assert.equal(result.status, 0, result.stderr);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('memory launcher removes a key it loaded rather than leaking it into the calling shell', { skip: process.platform !== 'win32' }, async () => {
  const { root, launcher } = await fixture('Start-MemoryAPI.ps1');
  try {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await mkdir(path.join(root, 'runtime/upstream'), { recursive: true });
    await writeFile(path.join(root, 'src/cli.js'), 'process.exit(0);');
    await writeFile(path.join(root, 'runtime/upstream/.api-key'), 'fake-upstream-test-key');
    const result = powershell(launcher, `$ErrorActionPreference='Stop'; $env:BRIDGE_UPSTREAM_KEY=$null; $env:BRIDGE_API_KEY='fake-client-key-123456'; & $env:MEMORY_TEST_LAUNCHER -Project unused -Model test; if($env:BRIDGE_UPSTREAM_KEY){ throw 'Upstream key leaked into caller environment' }`);
    assert.equal(result.status, 0, result.stderr);
  } finally { await rm(root, { recursive: true, force: true }); }
});
