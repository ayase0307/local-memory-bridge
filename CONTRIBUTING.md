# Contributing

Keep changes focused and reproducible. A useful bug report includes the exact command, Node/Windows versions, a minimal synthetic project, and the expected versus observed result. Never include `runtime/` or private project content.

## Local checks

```powershell
npm test
node scripts/check-docs.mjs
```

The root suite needs no DeepSeek login or third-party runtime packages. Add a behavioral regression for a parser, boundary or file-operation change. Use fake loopback servers and disposable folders; real-account tests are manual acceptance checks.

## Web core changes

`core/` is a pinned third-party MIT adapter with documented local patches. Retain its copyright and license. When changing the core, update `THIRD_PARTY.md`, install its frozen pnpm lockfile, and run typecheck, lint, tests and build. Commit source and regenerated `core/dist/` together.

## Documentation and visuals

Update `README.md` and `README.zh-TW.md` together. Keep commands, capabilities, limits and proof aligned. Do not add a compatibility or performance claim without evidence.

`assets/flow-heatmap.gif` is generated from `scripts/render_heatmap.py` using Pillow. It explains a workflow and must stay labeled as illustrative activity, not telemetry. Keep image files local to the repository and supply meaningful alt text plus a static alternative.

Describe what changed, why it matters and how it was verified in a pull request. Public changes should not contain secrets, machine-specific state or unrelated fixture outputs.
