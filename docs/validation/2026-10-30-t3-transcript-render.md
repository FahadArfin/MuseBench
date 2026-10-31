# T307 measured transcript render containment

The existing message article is now a shallow-memoized component. Composer-only edits preserve its message and control props, so unchanged articles skip their render work. The outer transcript map, reading/follow hook, timeline, find controls and live run activity remain in place. Cloned bridge snapshots deliberately refresh articles; this change does not attempt to optimize streaming snapshots or introduce virtualization, transport, state or dependency changes.

Quotation uses one stable event entry point that invokes the latest committed handler through a layout-effect-updated reference. The handler retains the current draft owner, edited text, source and destination checks, archived/runtime gates and saved-prompt fences. Every other row callback and disabled state remains an ordinary shallow-compared prop; no custom comparator discards handlers.

## Measurement

`node scripts/transcript-render-smoke.mjs --baseline` ran before product edits at `7c64b27f4a3f2f2b8e0893afced024eb5d1c3f0d`. That original capture is retained but superseded: self-review found an invalid fixture request-origin value allowed a separate initial-request article beside the 150 mapped messages. The corrected fixture uses the valid history origin and asserts exactly 150 rendered message articles.

The Task 7 review base is `ddc09d3c223f6b93b9d552c91c6095ee5639ad8c`; the intervening keyboard-smoke correction changed only its fixture and documentation. Both commits have the identical App blob `59488c5070d409eaabe694ce1b08df2be10a40c6`. The corrected baseline uses `node scripts/transcript-render-smoke.mjs --baseline --source-ref ddc09d3c223f6b93b9d552c91c6095ee5639ad8c`: the fixture-only Vite load hook serves the immutable pre-edit App source without reverting current files. The final run uses the same corrected fixture and current App source.

The same source fixture supplies 150 alternating user/assistant messages, a 1440×960 viewport and the exact 31-character prompt `Inspect this fixture carefully.`. It dispatches one real production input event per successive character and waits two animation frames after each. A fixture-only Vite transform counts actual App and message-article-body executions; no instrumentation or personal content capture is shipped. Both runs use the development renderer, whose StrictMode double invocations are included in the counts.

| Observed fixture metric | Baseline | Final |
|---|---:|---:|
| Input events / timing samples | 31 | 31 |
| App executions during typing | 62 | 62 |
| Message article executions during typing | 9,300 | 0 |
| Article executions on one cloned streaming snapshot | 300 | 300 |
| Input event through two animation frames, median | 50.1 ms | 33.6 ms |
| Same interval, min–max | 32.8–182.8 ms | 28.2–99.8 ms |

These counts establish avoided unchanged article work. They are not DOM mutation counts, production commit counts or model-speed measurements. The timing includes development instrumentation and a two-frame floor; these single runs do not establish a consistent user-visible latency improvement. The outer map and App still execute.

Corrected local receipts: `artifacts/transcript-render/baseline-pLbtdZ/report.json` and `artifacts/transcript-render/final-Krzo8T/report.json`. Baseline App SHA-256: `77bdbd94b2103e9e77ddc176bb26950f223893187214134806003954e67afad2` (Git blob bytes); final App SHA-256: `6a64c3f200b15029118766b1936c0ee83b9569ed57c29183fff8b19511d13c0a`. The final run measured those edited App bytes atop the review base; its `sourceHead` identifies that base, and `appSha256` identifies the actual measured file. Replaying the corrected fixture against the pre-edit source without `--baseline` failed with 9,300 instead of zero unchanged article executions (`final-wr2qK3/report.json`). Original preliminary receipts `baseline-Vl1NBF`, `final-cB0Eqd` and `final-lMHCiL` remain superseded rather than deleted.

The measurement fixture passes six behavior checks: complete unsent draft persistence, streamed tail refresh, live tool output, quote after editing, quote after clearing and identical message IDs in another owner. Its fake bridge records 37 draft saves and one navigation dispatch across the full journey; provider-admission actions are counted from that action log and equal zero. This is a renderer fixture boundary, not a native/provider observation.

## Local validation and limits

- `npm.cmd run build` passed, including TypeScript, Vite and native helpers; the existing large-chunk advisory remains.
- `node --test test/ci-suites.test.mjs test/response-quote.test.mjs test/prompt-shelf.test.mjs`: 26 passed, zero failed or skipped.
- `npm.cmd run test:response-quote`: 12 checks each in preview and production Electron preload/IPC/controller, including selection, source changes, current edits, owner races, pending/unknown shelf fences and durable reload.
- `npm.cmd run test:transcript-position`: 13 checks each in preview and an Electron shared-renderer fixture, with both restoration errors at 0px.
- `npm.cmd run test:code-responsiveness`: 17 App checks, seven dictation checks and 14 timeline checks passed, retaining DOM/copy/feedback state, current branch targets, streaming, tool details and timeline operation budgets.
- `npm.cmd run test:chat-history-find`: 10 preview and nine production Electron checks passed, retaining streaming highlights, explicit scroll navigation, saved history and stale-result rejection.
- `npm.cmd run test:prompt-shelf`: 11 preview and nine production Electron checks passed, including screenshot/Plan persistence, owner fences, recovery and no blind saves.
- `npm.cmd run test:workspace-focus`: 22 checks each in preview and production Electron, including focus cancellation, released reading continuity and the explicit 1024px dock boundary.
- `npm.cmd run test:native-retry`: six checks each in preview and production Electron, retaining status updates and clearing on progress, completion and disconnect.
- `node scripts/project-mcp-smoke.mjs` then its `--desktop` variant: three checks each passed; behavioral assertions are unchanged and the output now qualifies its unmeasured provider boundary.

CI runs the new source work regression in the sequential chats group and uploads only clean report JSON. The required-command inventory also now includes the already-registered native-retry check. The project-MCP report's historical literal `providerRequests: 0` was removed; its assertions remain, and its documentation now states that fixture does not measure provider calls.

These are source and disposable-profile fixture results. The source measurement is distinct from production Electron behavioral checks. `MUSEBENCH_EXECUTABLE` was unset; existing behavioral smokes support it for later exact-artifact validation. No installed/published artifact, personal profile or live Muse/provider was exercised. Whole-branch review, exact-head remote CI, release and installation remain the parent delivery workflow's responsibility.
