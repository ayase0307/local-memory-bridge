# Third-party core

`core/` contains source and compiled JavaScript based on:

- Repository: https://github.com/kittors/deepseek-web-api
- Commit: `9b62d6a17ba502fa6aefa2dceb527d1e925aa6ce`
- License: MIT, retained at `core/LICENSE`
- Runtime dependency: playwright-core 1.61.1, as resolved by that commit's lockfile
- Playwright license and notices: `core/node_modules/playwright-core/LICENSE`, `NOTICE`

Release ZIPs may include the production runtime dependency. Git excludes `node_modules/`; after cloning, install the pinned runtime using the README command. The Chromium browser itself is not bundled; the core uses an installed Chrome/Chromium. To reproduce upstream unit tests, install the lockfile developer dependencies in `core/` and run the upstream scripts.

The core uses private DeepSeek Web endpoints, browser session credentials, and PoW. Its open-source license does not grant authorization to use DeepSeek's service contrary to that service's terms. See `docs/PLAN.md` and the upstream README.

Local patches made after real-account acceptance exposed two bugs:

- `src/browser/chrome.ts` and `src/browser/login.ts`: tolerate confirmed initial/login navigation races; unrelated browser failures still propagate.
- `src/deepseek/updates.ts`: inherit omitted SSE patch path/operation, preventing dropped text after a thinking-to-response fragment transition. Unsupported content replacements fail explicitly.
- Regression coverage: `tests/unit/browserNavigation.test.ts`, `tests/unit/sse.test.ts`.

The patched core passes 95 tests, source build, typecheck and lint. Live two-turn memory and file-agent acceptance also passed on 2026-10-15; see `docs/ACCEPTANCE.md`. The model ID is the core's public alias, not independent proof of the upstream model's identity.
