# Code chat relationships validation — 2026-10-30

Shared Code controls now distinguish **Fork chat**, which carries conversation history, from **New side chat**, which starts fresh context linked to the main chat. Reply actions use **Fork from here**. See [behavior and runtime boundaries](../CODE-CHAT-RELATIONS.md).

## Native history and isolation evidence

`node scripts/native-session-fork-contract.mjs --local-fixture` passed against the actual pinned Muse SDK/host 1.4.14 with a disposable profile and scripted loopback provider. It exercised full-history and completed-turn-cut product forks, verified exact returned history/provenance and matching ownership release, restored the acquired fork on a second host, and continued parent and child independently. A separate fresh session excluded parent markers. Native `session/sideChat` inherited context, which is why fresh linked sides use independent sessions instead.

The final receipt is `artifacts/code-chat-relations/native-contract-report.json`: seven scripted turns, 28 local requests within the 32-request bound, zero external model inference, no personal credentials, both hosts' cleanup confirmed and temporary workspace removed. Earlier failed probe receipts remain preserved; a real SDK single-notification-handler issue was corrected by runtime-owned subscription multiplexing and covered by regression tests. This proves the pinned local protocol and product path with scripted responses, not personal provider acceptance.

Controller/runtime tests separately cover bounded history, native completed-turn mappings, exact source binding, active-work admission, no copied goals/queues/usage/tool leases, late and unknown outcomes, no silent retained-history fallback after a native failure, durable receipts surviving stale selection snapshots, and independent child visibility when its parent is unavailable. Task 1's final focused run passed 152 tests; its ancestry fix passed 104 covering tests. Latest UI/provenance checks are recorded below.

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

## Final integration checkpoint

At source `9558a9f945b616288085c90f62ad0f03503d5ced`, root ran `npm.cmd run build` (native helpers, TypeScript, Vite and native MCP bundle) followed by `npm.cmd test`. Both processes completed with exit 0. Full suite: **1,974 passed, one existing skip, zero failed; 1,975 total**, 54.704 seconds. Evidence: `integration-9558a9f-build.txt` and `integration-9558a9f-tests.txt`. The previous `32b72c3` checkpoint passed 1,968 plus one skip; it is retained separately rather than represented as final provenance proof.

Independent task reviews and scoped re-reviews found no remaining Critical/Important issues. Root added this evidence and the native-contract summary without changing product code; whole-feature final review and release/installed checks follow separately. No personal model request was made.


## Consolidated final-review fix wave

Base: 8aa6e008c657c7ba10ba99a0a44debb1816a6986. This wave addresses only the Important P2 late receipt / stale task object and Minor P3 selected-side disclosure findings in final-review.md.

The native onReceipt callback now resolves the canonical task by its captured source ID at delivery time, preferring the current selected record, then its live context, then the durable record. It merges only the matching receipt and saves that canonical object; newer pin/title/sidebar organization remains intact. A closed controller or missing task record is ignored, so a late native response cannot recreate a deleted source or history.

The sidebar autoexpand effect now depends on selected chat ID and resolved main ID. A refreshed relation graph, streamed snapshot or organization change cannot reopen an explicitly collapsed group when those identities are unchanged; selecting another side or changing the resolved main still reveals the appropriate group.

RED evidence: `node --test --test-name-pattern='late acquired fork identity|late native identity' test/chat-relations.test.mjs` failed all three new cases (exit 1, final-wave-controller-red.txt). Selected source lost childSessionId, background source lost newer pinned state, and a deleted source reappeared. The cases cover pin replacement plus rename, selected/background canonical identity, restart persistence and no resurrection after delete. `node scripts/code-chat-relations-smoke.mjs` failed the added rendered disclosure check after two prior checks (final-wave-preview-red.txt; ui-preview-BmAWTq/report.json and failure.png), reproducing organization snapshots reopening a user-collapsed selected-side group.

Final focused command: `node --test test/chat-relations.test.mjs test/harness-gaps.test.mjs test/exec-controller.test.mjs test/chat-history.test.mjs test/durable-history.test.mjs test/native-session.test.mjs test/native-session-fork.test.mjs test/runtime.test.mjs test/runtime-selector.test.mjs`. Result: 286 tests, 286 pass, 0 fail/skip, 12.488 seconds, exit 0 (final-wave-focused-green.txt).

Build command: `npm.cmd run build` passed native helpers, TypeScript, Vite and native MCP bundling, exit 0 (final-wave-build.txt). Vite emitted the existing chunk-size advisory; no unrelated bundle changes were made. Separate `npx.cmd tsc --noEmit` exited 0 (final-wave-typecheck.txt is empty on success). Source `git diff --check` passed.

Final shared product smoke: preview `node scripts/code-chat-relations-smoke.mjs` passed 17 checks, no renderer errors and zero provider calls (final-wave-preview-settled.txt; ui-preview-Akmxf9/report.json). Electron `node scripts/code-chat-relations-smoke.mjs --desktop` passed 16 checks, no renderer errors and zero provider calls (final-wave-desktop-verified.txt; ui-desktop-atCdN3/report.json). Both assert that selected-side collapse survives pin/unpin snapshots and selecting a newly created/different side reveals its group. Both preserve the existing independent draft, ancestry, exact-source, manual provenance, native-recovery presentation, narrow/reduced-motion and keyboard assertions. Inspected selected-side-collapsed.png in both variants and the preview narrow-reduced.png; parent disclosure remains closed while the selected side is accessible in Recents, and keyboard menu focus is visible at narrow width.

Harness-only adjustment: initial post-fix preview runs passed the new disclosure check but timed out at the existing immediate post-resize keyboard-menu step (final-wave-preview-green.txt and final-wave-preview-verified.txt; ui-preview-SktSEF and ui-preview-9ohZhD). The app schedules composer focus on chat creation and dismisses menus on viewport resize. The harness now awaits two post-resize animation frames and an observably enabled menu button before focusing it, and adds an explicit activeElement assertion before Enter. Home/End focus movement, Escape focus restoration, viewport overflow and all menu expectations remain exact; no production menu/focus code was changed. All failed reports/screenshots remain preserved; successful Electron pre-adjustment proof is also retained (final-wave-desktop-green.txt; ui-desktop-jFySpq).

Self-review: source changes are confined to the canonical receipt callback and sidebar effect dependencies; tests and existing smoke cover both findings. No provider request, paid inference, personal application/profile mutation, private profile/config staging, subagent work, push or unrelated suite expansion occurred. Disposable Electron profiles, SQLite databases, binaries and root delivery helpers are excluded from the commit. Root-owned progress.md and final-review.md are not staged. Root owns the next full integration run and final scoped re-review; this wave does not replace earlier full-suite/native-contract provenance with a fresh claim.
