# C08: responsive chat navigation

Implementation based on `2bcd33624d8eb5b08500f44cd96b9138e8bdf5ac`. Source review and delivery status are tracked below; this document does not substitute fixture results for installed or provider acceptance.

## Change

The shared sidebar now skips unchanged rendering during composer updates, groups chats by project once, and uses current committed callbacks even when its visual rendering is skipped. Equivalent snapshots preserve row/menu identity. Real names, ordering, selection and busy status still update.

Search and project context each admit one read at a time per mounted reader, retaining only the newest pending request. Ordinary edits wait 150 ms; first load, owner changes and explicit refresh have no typing delay. Same-owner data remains visible with a pending indicator. Changing project/chat hides old context immediately, and closing the surface removes queued follow-up. Admitted IPC reads cannot be cancelled; reopening creates another reader, so this is not a claim of global cancellation or backend concurrency control.

## Evidence

The real shared React sidebar was measured in an isolated production-build fixture with 1,000 chats and 40 projects. Ten draft keystrokes produced:

| Observation | Before, Chromium | After, Chromium | After, Electron |
| --- | ---: | ---: | ---: |
| Unchanged chat title reads | 40,360 | 0 | 0 |
| Observed draft render/commit time | 5.6–10.2 ms | 0–0.8 ms | 0–0.8 ms |

These timings describe this local fixture, not end-to-end input latency or a universal frame-rate guarantee. Initial mounting still scales with list size. Equivalent cloned snapshots still require a bounded primitive-field comparison.

- The failing baseline is retained at `artifacts/chat-navigation/before-preview-O1RzL0/report.json`; the first after measurements are `after-preview-pxXm5B/report.json` and `after-desktop-hW7H1X/report.json` in the same directory.
- The real search component initially admitted three overlapping requests during a held read (`reads-preview-6cA0Dj/report.json`). The new browser/Electron checks admit one, discard obsolete results, retain only the newest query and recover from errors without automatic retries.
- Nine sidebar/order unit tests verify ordering, pinned/archived membership, one project-membership read per task, relevant primitive-field changes and avoidance of heavy project instruction data.
- Five deterministic queue tests verify quiet time, latest-only admission, single-flight reads, stale success/error suppression, synchronous exceptions, cleanup, cancellation before admission and recovery.
- `npm run test:chat-navigation` passes all four Chromium/Electron component runs: callback freshness, cloned-snapshot menu focus and anchors, true data changes, selected-project expansion, keyboard reorder, search/context burst handling, owner isolation, unmount and explicit refresh recovery. The narrow context view was inspected; no horizontal overflow or renderer errors were observed.
- `npm run build` passed. The full unit suite passed 1,451 tests with zero failures and one existing native-workflow replay skipped because its optional retained capture is absent.
- `npm run test:code-responsiveness` and `npm run test:chat-organization` passed, retaining transcript identity, drafts, response controls, keyboard menus and saved chat state.

The older sidebar-drag runner initially waited for hidden Code rows while the app was on its default Meta AI Chat surface. The failure screenshot confirmed that setup error. It now selects the exact local renderer and explicitly switches to Muse Code before running its original assertions. This was a test-runner correction, not a production navigation change.

All eight drag/reorder assertions then passed in the full Electron app, including moving the selected chat with its draft and preserving saved order across renderer reload. The runner explicitly selects Code after reload as well. Its report is retained at `artifacts/sidebar-drag/source-EhOVsF/report.json` and the runner is included in `test:chat-navigation` for both Windows workflows.

Both Windows validation workflows run the new component checks and retain failure reports. Tests use isolated state and no paid model requests or live account profile.

## Delivery boundary

Independent whole-feature review found no material correctness, regression or security issues. The reviewer independently passed 14 unit tests, checked 500 ordering-equivalence datasets and recorded the reviewed file hashes. Both workflow documents parse and register the new regression suite exactly once.

Source acceptance is complete. CI/release and installed C08 acceptance must be verified against the resulting exact commit and published artifact. The separately verified prior installation is recorded in [desktop 0.2.178 acceptance](2026-10-29-desktop-0.2.178.md).

The implementation plan and local red/green/review evidence are retained under `docs/superpowers/plans/2026-10-29-chat-navigation.md` and `.superpowers/sdd/2026-10-29-chat-navigation/` respectively. Local fixture reports are ignored, not published account data.
