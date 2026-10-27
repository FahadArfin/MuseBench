# Open-source harness improvements delivery

Approved scope: implement the unblocked recommendations in `docs/OPEN-SOURCE-HARNESS-COMPARISON-2026-10-26.md`, with a tested commit and GitHub push per feature. Native-host limitations do not block app-owned work.

Architecture: retain Electron, SQLite, the controller, and shared React UI. Browser preview implements the same typed bridge with explicitly simulated data. Do not replace Muse, assume unsupported native controls, or represent simulations as execution evidence.

Delivery order and status:

1. Complete — durable message history, source excerpts, paging and indexed search.
2. Complete — validation profiles, revision-bound phase gates and diagnostics.
3. Complete — recoverable captured output with explicit limits and retrieval.
4. Complete — context inspector and source receipts.
5. Complete — selected-file checkpoint restore, redo and conflicts.
6. Complete — reviewed project lessons and skill promotion.
7. Complete — durable execution/delivery receipts and unknown outcomes.
8. Complete — bounded goal continuation with user priority.
9. Complete — focused reviewer contracts and explicit integration.
10. Complete — app-owned tool discovery; native semantic tools remain conditional on supported execution.
11. Complete — performance measurements and justified event/UI improvements.
12. Complete — runtime capability contracts and conformance tests.

For each item: inspect existing behavior; write meaningful failing tests; implement shared controller/bridge/UI behavior; verify focused regressions, build and applicable browser parity; review; commit and push before the next item. Keep evidence and limitations here. Current clean checkout serves the live preview; changes integrate here without replacing user data.

## Feature 1 contract

Store app-received messages independently of the 150-message display window. Index user/assistant text using a portable SQLite inverted index. The installed Node 22 SQLite build lacks FTS5 (verified by a failing store test); avoid an unsupported extension dependency. Preserve full received text across bounded snapshot saves and streaming updates. Migrate retained legacy messages without claiming recovery of previously discarded content. Expose bounded history pages and exact source messages through desktop IPC and preview fixtures. Search respects archive and project association; permanent deletion purges the history. Failed unaccepted prompts must not remain searchable. History excerpts can be copied into the existing draft without sending a model request.

Files: new history store and tests; controller persistence, runtime ingestion and deletion; bridge types and Electron handlers; preview bridge; shared ChatLibrary component. Verify old messages after restart, streaming replacement, truncation protection, scope/deletion, pagination and legacy migration. Source history excludes native tool transcript that the adapter did not deliver.


Feature 1 delivered: durable app-received messages, portable term index with literal Unicode substring fallback, 20-message history pages and 12,000-character source excerpts, draft inclusion, legacy coverage and deletion. Per-message capture limit is 1,048,576 characters and is disclosed when reached. Native history not delivered by the adapter cannot be reconstructed. Evidence: 662 tests passed; production build and package passed; 34 desktop/browser parity scenes including history search/source/draft passed; 89 packaged files and both native helpers matched source. Installed update verified all 76 distribution files, retaining a sibling backup and profile data. Normal installed startup was not tested. Independent review found and resolved literal/Unicode matching, draft excerpt sizing and asynchronous unaccepted-prompt cleanup issues.


Feature 2 delivered: saved project validation profiles (1–8 package scripts), sequential execution, exact-revision check receipts, stop on failure/cancellation/source mutation, workflow required-check gates on manual and automatic dispatch, profile-aware checkpoint acceptance, and bounded compiler diagnostics. No model-generated completion assertion opens a gate. Repairs remain explicit user-directed runs; the later bounded goal driver can consume these receipts. Independent review resolved old-pass reuse during a rerun and multi-script typing. Evidence: 668 tests passed; production package/build and 37 parity scenes passed, including profile state and typed required checks; 90 packaged files and native helpers match source. One unrelated HTTP rejection test failed once with fetch failed and passed both its isolated retry and the complete rerun.


Feature 3 delivered: captured check output before display truncation, owned native shell-output captures, head/tail/paging/exact search in a shared viewer, explicit upstream/capture truncation, interruption/expiry and task-deletion retention. Limits: 1,048,576 characters per capture; 16 live captures per chat, 128 across the app; older capture bodies expire while their status remains visible. Native text never delivered to MuseBench cannot be recovered. Independent review resolved timeout close-event ordering and Unicode-expanded search offsets. Evidence: 672 tests passed; package/build and 40 desktop/browser parity scenes passed; 92 packaged source/build files and both helpers matched. Native host execution remains separately blocked; native capture routing is covered by adapter/controller fixtures, not a new live host claim.

Feature 4 delivered: SHA-256 receipts for exact prepared input, instruction revisions, selected source hashes and replayed message identities; native context remains unknown. Known app-shortened messages are disclosed, and oversized handoff drafts require shortening instead of silent loss. Preview uses the same composer, including personal instructions and native continuation mode. Evidence: 676 tests and 41 desktop/browser parity scenes passed; production package verified. Independent review findings on clipped messages and preview guidance were resolved.

Feature 5 delivered: selected text-file checkpoint comparison and restore, pre-restore redo checkpoints, exact reviewed revision checks, per-file conflict checks, idle runtime/check/preview requirement, persisted operation journals and interrupted-operation notice. Added/deleted paths are explicit; renames are selected add/delete pairs. Binary contents are unavailable and refused. No Git index writes or conversation rewinds. Evidence: 680 tests; 42 production/browser parity scenes; 94 packaged source/build files and native helpers verified. Multi-file restore is journaled, not an atomic filesystem transaction; concurrent external filesystem mutation still requires review of partial results.

Feature 6 delivered: explicit lesson proposals with source chat/message/revision and passing check provenance, searchable review, guidance comparison, stale-content rejection, duplicate detection, bounded acceptance into existing project instructions and exact-block revocation. Validated-source lessons can use the existing native skill validation/install path after explicit review; native use still requires a load receipt. No automatic learning claim or background model call. Evidence: 683 tests and 45 desktop/browser parity scenes, including proposed/accepted/revoked lessons; package verification passed.

Feature 7 delivered: independent SQLite execution intents, dispatch/acceptance/native identity/result receipts, restart recovery to unknown, and separate suppressed/submitted/shown/failed/unsupported notification delivery. No notification callback dispatches work; unsupported process/version facts remain unknown. The session inspector shares receipts in preview and desktop. Evidence: 687 tests, 45 parity scenes, 96 packaged source/build files and helpers verified. OS shown means notification visibility, not user reading or external side-effect success. Meta-hosted schedules remain outside this controller.

Feature 8 delivered: opt-in goal continuation with 1–8 rounds, 1–60 minute deadline, settled execution receipt requirement, revision-bound validation between runs, repair prompts from bounded diagnostics, repeated failure stop, user queue/message priority, authoritative pause and restart/navigation disarming. A deadline disconnects an active owned run and cancels its check; cleanup uncertainty remains visible. Passing checks pauses for human review rather than claiming subjective goal completion. Evidence: 692 tests; 47 parity scenes; 97 packaged files and native helpers verified. Actual native goal runs remain host-blocked; controller tests use injected runtimes and real local check processes.

Feature 9 delivered: independent correctness/test/investigator chats with source and checkout revision contracts, matching managed-worktree selection, Ask for approval, standard per-run limits, three review slots per parent, partial reported usage aggregation, owned-review cancellation and recursion refusal in app orchestration. Structured evidence is validated and added only to an empty parent draft after explicit integration and fresh revision checks. No automatic patching, sending, or read-only filesystem claim. Evidence: 695 tests; 50 shared preview/desktop parity scenes; package verified. Native review execution remains conditional on the same blocked host, covered here with injected runtimes.

Feature 10 delivered: searchable Workspace tools directory and /tools command with scoped availability, progressively disclosed input/result contracts and links into existing permission-checked controls. Compiler/linter diagnostics remain in the validation feature. Native semantic navigation and dynamic model-tool loading are explicitly unavailable; no speculative server installation or frontend-as-model-tool claim. Evidence: 696 tests, 52 parity scenes, production package verified.

Feature 11 delivered: measured controller progress coalescing (40 ms), bounded latest-state delivery, immediate lifecycle/input acceptance/pending/terminal flush, unchanged durable source capture, and redundant receipt/history-write avoidance. Synthetic four-chat benchmark: 11,443 ms and 204 full snapshots before; 326–342 ms and four snapshots after, with final control-aware run 341 ms. See docs/HARNESS-PERFORMANCE-2026-10-26.md for methodology and limits; renderer paint/RSS and native model speed are not measured claims. Evidence: 698 tests and 52 desktop/browser parity scenes; production package verified.

## Final review and integration

An independent final review reproduced four defects. Commit `efb12b1` resolved all four, with regression tests: goal dispatch rechecks its driver identity and deadline after awaited connection preparation; explicit disconnect retains ownership until terminal receipt settlement (missing cleanup remains unknown); review integration refuses file-only and image-only drafts; branches preserve known message truncation through restart and context inspection. The reviewer question input also uses the shared full-width styling. No reported finding was deferred.

The separately reviewed Full access change in PR #1 was merged without losing these fixes at `0193687`. It remains opt-in per connection, defaults to sandboxed, resets on disconnect, and preserves separate approval selection. It does not enable new interactive transport controls. Historical host-blocked notes above describe the evidence available when each feature shipped; the live checks below supersede that limitation for the tested paths only.

Final merged-tree verification: **709 tests passed, zero failures; 52 browser/production-Electron parity scenes passed; build and package passed; 99 packaged source/build files and both native helpers matched the source.** The installed desktop was replaced with that validated package, with all 76 distribution files hash-checked. A sibling backup and user profile were retained. Normal startup of this final installed build was not tested; isolated production-Electron parity is separate evidence.

### Full access live acceptance

At 2026-10-27 01:53:34–01:53:48 UTC, two real Muse requests used the actual controller and Windows exec adapter in a disposable user-profile workspace, with Full access explicitly selected and Ask for approval retained:

- A one-round, one-minute goal ran one managed PowerShell marker command, captured the output, recorded completed execution and confirmed cleanup, ran the saved npm validation profile, and stopped with “Checks passed; review the result.”
- After removing the app goal and closing/reopening the controller, the same native session resumed. Its context receipt was `native`, and the model recalled the unique marker without replayed app chat history. Execution completed with confirmed cleanup.

This verifies bounded goal execution and persistent-session recall on this host using the workaround. It is not a model-quality comparison, a sandbox repair, or proof of recovery after an ambiguous external side effect. Local diagnostic source/results: `artifacts/harness-full-access-validation.mjs` and `.json` (ignored machine-specific artifacts).

### Remaining experimental/native milestones

All unblocked app-owned items in this delivery list are complete and pushed individually. Full access removes the tested exec shell obstacle; it does **not** supply exact-turn MSP steering, native compaction, request/approval response transport, or attempt-specific child controls. The production Windows connection remains exec; its unsupported controls remain explicitly unavailable. Those milestones require their own interactive adapter implementation and real protocol acceptance tests, rather than removing a capability guard based on a shell result. Native semantic tools/dynamic tool exposure and comparative model evaluations also remain conditional experiments, not delivered capabilities. See `docs/FULL-ACCESS.md` for the workaround boundary.
