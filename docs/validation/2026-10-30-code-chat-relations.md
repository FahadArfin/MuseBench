# Code chat relationships validation — 2026-10-30

Shared Code controls now distinguish **Fork chat**, which carries conversation history, from **New side chat**, which starts fresh context linked to the main chat. Reply actions use **Fork from here**. See [behavior and runtime boundaries](../CODE-CHAT-RELATIONS.md).

## Current local evidence

All commands below ran in the isolated `codex/code-chat-relations` checkout. No personal profile was opened or changed and no provider inference ran. The browser bridge is sample behavior. Electron tests used disposable saved manual chats, actual product UI, actual controller actions and isolated profiles. The native uncertainty rendering case injects an explicit sample error/receipt; it does not claim a new native protocol execution. Task 1's separate local scripted-host contract proves that boundary.

| Command | Result | Evidence under `artifacts/code-chat-relations/` |
| --- | --- | --- |
| `node --test test/sidebar-model.test.mjs test/slash-commands.test.mjs test/ci-suites.test.mjs` | 17 passed, zero failed | `task2-focused-verified.txt` |
| `node scripts/code-chat-relations-smoke.mjs` | 12 product checks passed | `task2-ui-preview-verified.txt`, `ui-preview-C5bzs6/report.json` |
| `node scripts/code-chat-relations-smoke.mjs --desktop` | 11 product checks passed | `task2-ui-desktop-ipc-fixture.txt`, `ui-desktop-EiDyQB/report.json` |
| `npm.cmd run test:chat-organization` | Preview 8 checks; desktop 8 checks passed | `task2-regression-chat-organization-final.txt` |
| `npm.cmd run test:chat-navigation` | Browser/Electron navigation and read checks; drag smoke passed | `task2-regression-chat-navigation.txt` |
| `npm.cmd run test:navigation-cache` | Passed | `task2-regression-navigation-cache.txt` |
| `npm.cmd run test:code-responsiveness` | Renderer, dictation subscription and timeline regression checks passed | `task2-regression-code-responsiveness.txt` |
| `npm.cmd run test:reply-copy` | Browser reply copy and Electron response actions passed | `task2-regression-reply-copy.txt` |
| `npm.cmd run test:browser-preview` | Passed | `task2-regression-browser-preview.txt` |
| `npm.cmd test` | 1,964 passed, one existing skip, zero failed; 1,965 total | `task2-full-tests.txt` |
| `npm.cmd run build` | Passed | `task2-build-final.txt` |
| `npx.cmd tsc --noEmit` | Passed after final whitespace cleanup | `task2-typecheck-final.txt` |

The build retains the existing Vite large-chunk advisory; tests retain Node's experimental SQLite warning. The skipped test is the existing retained-safe-native-workflow replay test.

## Behavior and visual checks

The new smoke exercises fresh side state, preserved parent draft, independent side draft, main backlink, nested disclosure and reopening, sibling creation, unsent `/side` text, `/branch` history fork, selected-reply prefix, source-bound actions after selection changes, creation from overview, keyboard Home/End/Escape and restored focus at 430 px with reduced motion, and surviving sides after parent archival. Preview additionally exercises a later sample side prompt. Both modes render an explicit unknown native error with saved command and acquired child identities and create no fallback child.

The browser stale-action fixture holds the actual menu action before dispatch; Electron does the same at its disposable process's IPC handler because contextBridge methods are immutable. Both switch selection before releasing the captured action into the real controller/bridge. No test hook was added to product code. Unknown-error fixtures similarly inject only the returned error and receipt at the bridge/IPC boundary.

Inspected `desktop.png`, `current-menu.png`, `fork-backlink.png`, `narrow-reduced.png`, and `unknown-recovery.png` in the final preview and Electron evidence directories. Desktop nesting and disclosure align inside the sidebar; narrow controls fit without horizontal document overflow; retained forks display **Saved conversation**. Root also independently confirmed the corrected desktop nesting screenshot.

## Failing checks preserved

- Initial missing-control and missing-helper/command checks are in `task2-ui-red.txt`, `task2-projection-red.txt` and `task2-projection-red-behavior.txt`. The behavior run had 9 passes and 4 expected failures; the resulting projection/command run passed all 13 cases.
- The visual clipping report became an explicit width regression: `task2-ui-layout-width-red.txt`. Long titles had widened nested disclosure grid columns and caused horizontal focus scrolling. Scoped `minmax(0,1fr)` columns and `min-width:0` fixed it; `task2-ui-layout-width-green.txt` passed. Final preview sidebar `scrollWidth` and `clientWidth` are both 279 px, `scrollLeft` is zero.
- `task2-side-prompt-red.txt` caught a synthetic “Side chat” request appearing above a later actual side prompt. Side transcripts now render their actual messages without that template request.
- Earlier Electron failures preserve a premature React draft read, a menu-lifetime assumption, and an attempted mutable-browser-bridge fixture on Electron's immutable bridge. The draft expectation was retained; the harness now waits for the exact displayed value and uses the isolated IPC fixture. No draft implementation was relaxed.
- The first organization run failed its old separator expectation after adding the new action group. The final run covers the updated menu and passes both product variants.

All failed receipts, screenshots and isolated fixture files remain locally preserved. Only clean logs, reports and screenshots are committed; profiles, SQLite data, caches and binaries are excluded. No push, CI, publication, installer or live-provider result is claimed by this validation. The new smoke accepts `MUSEBENCH_EXECUTABLE` for root's later exact-installed-artifact check and is part of the existing `chats` CI suite. CI uploads only its clean report files on failure.

## Independent review fix round 1

The next source revision fixes two review findings: forks of side chats now render only stored messages instead of adding the “Side chat” template request, and sidebar ancestry uses a snapshot-owned indexed/cache projection instead of rescanning the graph per side/ancestor. Side backlinks now naturally use the final usable main in supported legacy chains. Original domain relation helpers and runtime/controller actions remain unchanged.

New RED receipts: `task2-round1-fork-side-red.txt`, `task2-round1-fork-side-reply-red.txt`, `task2-round1-desktop-red.txt` each show the extra synthetic prompt; `task2-round1-scale-red.txt` shows both large graph cases exceeding the linear operation budget.

Latest focused helper result: `node --test test/sidebar-model.test.mjs test/chat-relations.test.mjs`, 28 passed / zero failed or skipped (`task2-round1-helpers-green.txt`). This covers 150 seeded mixed-graph comparisons to the original helper semantics, independent snapshot caches, fork boundaries, and large direct/chained graphs. Both 3,000-node graphs need 35,998 instrumented task field reads; measured projections took 6.8217ms direct and 3.9575ms chained. The test enforces a 75,000-read cap rather than a machine-dependent elapsed-time threshold.

Latest product smoke: preview14 checks (`ui-preview-UW7EC2/report.json`), Electron13 checks (`ui-desktop-1oMZ6r/report.json`), zero renderer errors. Both variants exercise chat-level and reply-level forks of an answered side through the actual product controls and assert exactly one actual prompt in the stored and rendered history. Electron answers are offline saved fixtures under real controller-created side baselines; no provider request runs. Inspected the new `fork-side-chat.png` / `fork-side-reply.png` screenshots.

Typecheck and Vite build passed. All seven targeted renderer/dictation/timeline/browser+Electron-sidebar/drag/response-action commands passed; exact command map in `task2-round1-regressions.json`, logs `task2-round1-regression-1.txt` through `-7.txt`. Full-suite and full-build results above remain evidence for the preceding revision; root requested scoped verification for this review round and owns final integration checks.

## Independent review fix round 2

The blanket related-chat header exclusion hid legitimate manual/demo initial requests, which live separately in `task.request`. The fix persists bounded `requestOrigin` provenance, preserves it through retained manual/demo forks and missing parents, and renders real initial requests separately from history. Fresh-side scaffolding remains a placeholder; native/history forks continue to use actual messages. Legacy defaults and malformed metadata are normalized without interpreting request text or consulting a live parent. The durable task row takes precedence over a stale app-selection snapshot. This metadata changes display only; native context/history and prompt composition remain unchanged.

RED receipts: `task2-round2-controller-red.txt` (19 pass / 5 fail), `task2-round2-desktop-red.txt` (missing actual manual prompt), `task2-round2-stale-provenance-red.txt` (four restart failures with a stale app snapshot). Latest focused controller/index/history/native regression command passed137 with zero failures/skips (`task2-round2-focused-verified.txt`).

Product smoke now passes preview16 and Electron15 checks (`ui-preview-CIiIZL/report.json`, `ui-desktop-pkIGXv/report.json`), including actual controller-owned manual sources whose initial question is absent from their message array, literal “Side chat” as a legitimate question, parent deletion and fork-of-fork. Both prior chat-level/reply-level side-fork checks remain green. Inspected `manual-initial-request.png`, `manual-literal-side-chat.png` and side-fork screenshots. Typecheck and Vite build passed. The final focused suite additionally covers stale-selection provenance restoration after those smoke runs; no renderer/build source changed subsequently. Broad verification remains root's integration scope.
