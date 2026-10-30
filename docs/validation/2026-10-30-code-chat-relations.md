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
