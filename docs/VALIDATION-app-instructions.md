# CS01 validation — complete app instruction snapshots

30 October 2026. Base: `be36dcc1cada524769a8065c16930e993de3bf10`.

## Behavior and regression evidence

- `test/context-receipts.test.mjs`: current nonempty, edit, clear, unchanged and initially empty snapshots; native and fallback context; legacy receipts; project isolation; retained current request/objectives/history; scope exclusions; exact current text and original size limits. Existing personal/project SHA-256 behavior stays intact.
- `test/app-instructions-controller.test.mjs`: actual controller inspection/send composition, native legacy restoration, fallback restart, queue delivery after settings changes, proven rejection and explicit retry, unknown admission without replay, fork/side composition and separate projects. All runtimes are local fixture doubles; no provider is called.
- RED before implementation: three new receipt tests fail on the missing descriptor; seven controller cases fail on the same missing feature. UI RED catches missing project replacement help, then missing preview receipt metadata. Logs remain in the plan’s `.superpowers/sdd/2026-10-30-codex-source-adaptations/` workspace.
- Focused context/queue/relation/recent-context/controller suite: **110 passed**, zero failed. The final controller-only run then passed **9 cases**, including two added native fork/side cases.
- CI registration contract: **4 passed**, zero failed. The new `test:app-instructions` command runs preview and desktop in the existing chats suite; sanitized reports are uploaded by Windows checks.
- Full `npm.cmd test` run once before commit: **1,989 passed**, zero failed, **1 skipped** out of 1,990 tests (56.6 s). The existing `replays the retained safe native workflow capture through production validation` test skips when its retained capture file is unavailable.
- `npm.cmd run build`: passed, including TypeScript and native bridge builds. Vite retains its existing large-chunk warning; SQLite tests retain the runtime experimental warning.

## Shared UI journey

`scripts/app-instructions-smoke.mjs` saves personal settings through Memory and project settings through Project context, inspects exact composed text and receipt state, clears both scopes, verifies literal rendering, checks a narrow viewport with reduced motion, and verifies no new chat message/execution receipt. It uses the shared product UI and no send action.

- Browser preview: passed, report `artifacts/app-instructions/preview-CVn4ij/report.json`.
- Source Electron with disposable profile/project: passed, report `artifacts/app-instructions/desktop-qtbKkO/report.json`.
- Narrow receipt screenshot visually inspected: `artifacts/app-instructions/desktop-qtbKkO/instruction-receipt-narrow.png`.
- Set `MUSEBENCH_EXECUTABLE` and run with `--desktop` to exercise an exact installed binary using the same disposable profile convention. No installed build was exercised for this feature yet.

These results establish app-prepared text, receipt and local UI behavior. They do not prove provider acceptance, native compaction membership or obedience. Personal application settings, grants and profiles were not changed. Parent delivery owns publishing and installation.
