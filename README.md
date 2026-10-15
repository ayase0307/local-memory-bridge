<p align="center">
  <a href="README.md"><strong>English</strong></a> · <a href="README.zh-TW.md">繁體中文</a>
</p>

<p align="center">
  <img src="assets/header.png" alt="Local Memory Bridge — Project memory. Real file actions." width="100%">
</p>

<h1 align="center">Local Memory Bridge</h1>

<p align="center"><strong>Give a web AI project memory and a bounded set of local file tools.</strong></p>

<p align="center">
  <a href="package.json"><img alt="Node.js 22 or newer" src="https://img.shields.io/badge/Node.js-%E2%89%A522-5dedb4?style=flat-square&labelColor=0a1524"></a>
  <a href="docs/VERIFICATION.md"><img alt="62 local tests passed" src="https://img.shields.io/badge/local_tests-62_passed-36d6ec?style=flat-square&labelColor=0a1524"></a>
  <a href="docs/ACCEPTANCE.md"><img alt="Windows live acceptance verified" src="https://img.shields.io/badge/Windows-live_verified-8ba0ff?style=flat-square&labelColor=0a1524"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-ffb95b?style=flat-square&labelColor=0a1524"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> · <a href="#see-the-loop">How it works</a> · <a href="#four-tools-one-project">File tools</a> · <a href="#tested-against-a-real-account">Verification</a> · <a href="#boundaries">Boundaries</a>
</p>

Local Memory Bridge connects an authenticated DeepSeek Web session to a local workspace. Every model turn reloads `agent.md` and `memory.md`. When the model asks to read or change a file, local code checks the request, applies the allowed operation, and records what happened.

**The useful part:** read a project note, create a summary, update a status line, and keep enough context to continue in a fresh conversation.

> [!IMPORTANT]
> This is an unofficial, experimental integration with DeepSeek's private Web interface. Availability, account restrictions and service terms still apply. Project context and requested file contents are sent to the model provider. See [security and data handling](SECURITY.md) before connecting a real project.

## See the loop

![Animated activity heatmap showing memory reloads, model calls, local file tools, backup and audit](assets/flow-heatmap.gif)

*A schematic read → create → modify task. Bright cells indicate illustrative component activity; this is an explanation, not live telemetry or a performance benchmark. [Static view](assets/flow-heatmap-static.png) · [Animation source](scripts/render_heatmap.py)*

1. **Recall** — reload project rules and persistent memory before each model call.
2. **Reason** — send one context packet; receive a text-JSON tool request.
3. **Act** — validate the path and arguments, then read, create, or replace text.
4. **Record** — preserve the pre-edit file, append an audit entry, and return the result to the model.

The loop continues until the model returns a final response or reaches the step limit.

## Quick start

**Requirements:** Node.js 22+, Windows PowerShell, and installed Chrome/Chromium. Windows is the platform verified so far.

### 1. Clone and install the Web core runtime

```powershell
git clone https://github.com/ayase0307/local-memory-bridge.git
cd local-memory-bridge
npm --prefix core install --no-save --omit=dev --ignore-scripts --package-lock=false playwright-core@1.61.1
```

The memory and file-tool layers use Node's standard library. The separate Web core uses `playwright-core`; it uses your installed browser without downloading Chromium.

### 2. Start the core and sign in

```powershell
.\scripts\Start-DeepSeekCore.ps1
```

Sign in yourself in the dedicated Chrome window. Once authentication is ready, the core listens on `http://127.0.0.1:18787`. Keep this terminal running. Credentials stay in the ignored `runtime/upstream/` directory.

### 3. Give it a small file task

In a second PowerShell terminal at the repository root:

```powershell
$env:BRIDGE_UPSTREAM_KEY = (Get-Content .\runtime\upstream\.api-key |
  Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') } |
  Select-Object -First 1).Trim()

node src/cli.js init --project .\my-project
Set-Content .\my-project\note.txt 'Status: pending' -Encoding utf8

node src/cli.js agent --project .\my-project `
  --base-url http://127.0.0.1:18787/v1 --model deepseek-v4-flash `
  --message 'Read note.txt, create summary.md, then replace Status: pending with Status: complete in note.txt.'
```

Invoking `agent` authorizes the task to use the allowed file tools inside that `--project`. Existing-file changes require a matching SHA-256 and a unique text match. Backups and audit records appear in `.file-agent/`.

`deepseek-v4-flash` is the bundled core's public model alias; it is not independent verification of the upstream model version.

## Memory you can inspect

```text
my-project/
├── agent.md                 Project instructions, reloaded each turn
├── memory.md                Approved facts and decisions, reloaded each turn
├── .memory-bridge/          Completed turns and the project lock
└── .file-agent/
    ├── actions.jsonl        Tool successes and errors
    └── backups/             Full pre-edit file snapshots
```

```powershell
node src/cli.js remember --project .\my-project --text 'Use Traditional Chinese for this project.'
```

Memory changes are explicit. Model answers do not automatically become persistent facts, and full transcripts are not replayed by default.

## Four tools, one project

| Tool | What it does | Check before acting |
| --- | --- | --- |
| `list_files` | List up to 200 direct children | Project-relative directory; protected entries hidden |
| `read_file` | Read UTF-8 text and return its SHA-256 | 64 KiB limit; protected paths and links rejected |
| `create_file` | Create a new text file | Exclusive creation; existing files preserved |
| `replace_text` | Replace one exact text match | Current hash + unique match; backup before replacement |

The model uses a **text-JSON protocol**. These are application-level tools, not native DeepSeek function calling. There is no shell or deletion tool. [Full contract →](docs/FILE-AGENT.md)

## Tested against a real account

Acceptance recorded on **2026-10-15** using a disposable fixture project:

| Check | Observed result |
| --- | --- |
| Memory reload over two real HTTP turns | Exact answers after changing `memory.md`; 9.384 s and 8.655 s |
| Read → create → modify | Four model calls, 25.893 s; resulting files matched the expected bytes |
| Backup and audit | One pre-edit backup; three successful tool records |
| Local suite | 62 passed, zero failed, zero skipped |
| Patched Web core | 95 tests; typecheck, lint and build passed |

These timings describe individual small acceptance runs. [Acceptance report](docs/ACCEPTANCE.md) · [Verification](docs/VERIFICATION.md) · [Fixture evidence](examples/verified-run/) · [Independent review](docs/FILE-AGENT-REVIEW.md)

## Other entry points

| Command | Use it for |
| --- | --- |
| `pack` / `record` | Export a memory packet and import a manually obtained reply |
| `chat` | Send one text turn through a configured loopback core |
| `serve` | A fixed-project, non-streaming Chat Completions subset |
| `agent` | A bounded multi-step file task; 12 model calls by default |

The HTTP adapter accepts one text `user` message and `stream:false`. It does not expose the file-agent loop or implement full OpenAI/Responses compatibility. [CLI help](src/cli.js) · [Detailed usage / 繁中操作手冊](docs/USAGE.zh-TW.md) · [Codex skill](skills/local-memory-bridge/SKILL.md)

## Boundaries

- **Explicit scope.** Project-relative paths only. Traversal, symlinks, junctions, hardlinks, credential paths, and internal state are rejected. Root `agent.md` and `memory.md` are changed through explicit memory operations.
- **Small text tasks.** UTF-8 files up to 64 KiB; context packets up to 32,000 characters; 12 model calls by default, configurable from 1 to 30. Parent directories must already exist.
- **Inspectable writes.** Pre-edit backups and an audit trail. A later failure can leave earlier successful changes in place; inspect the record before retrying.
- **Single writer.** The project lock coordinates this tool. Avoid editing the same files concurrently in an external program; this is not an OS sandbox or atomic compare-and-swap.
- **Unknown outcomes stop.** No automatic retry of timed-out or uncertain completion requests. Free Web access is not a promise of an unlimited or permanently free API.

For private-interface and account considerations, read [DeepSeek's service terms](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html) and [SECURITY.md](SECURITY.md).

## Development

```powershell
npm test
node scripts/check-docs.mjs
```

The local suite uses fixture folders and fake loopback servers. It does not require a DeepSeek account. The workflow tests Windows on Node 22 and 24. To rebuild the GIF, install Pillow and run `python scripts/render_heatmap.py`.

[Contributing](CONTRIBUTING.md) · [Architecture and plan](docs/PLAN.md) · [Asset provenance](assets/README.md)

## Credits and license

The Web adapter is based on [kittors/deepseek-web-api](https://github.com/kittors/deepseek-web-api), pinned at `9b62d6a`, with local navigation and SSE fixes. The source and MIT attribution remain in `core/`. [Third-party details](THIRD_PARTY.md)

Local Memory Bridge is released under the [MIT License](LICENSE). An open-source license covers the code; upstream service terms apply separately.
