# Open-source harness improvements delivery

Approved scope: implement the unblocked recommendations in `docs/OPEN-SOURCE-HARNESS-COMPARISON-2026-10-26.md`, with a tested commit and GitHub push per feature. Native-host limitations do not block app-owned work.

Architecture: retain Electron, SQLite, the controller, and shared React UI. Browser preview implements the same typed bridge with explicitly simulated data. Do not replace Muse, assume unsupported native controls, or represent simulations as execution evidence.

Delivery order and status:

1. Complete — durable message history, source excerpts, paging and indexed search.
2. Complete — validation profiles, revision-bound phase gates and diagnostics.
3. Complete — recoverable captured output with explicit limits and retrieval.
4. Complete — context inspector and source receipts.
5. Complete — selected-file checkpoint restore, redo and conflicts.
6. In progress — reviewed project lessons and skill promotion.
7. Pending — durable execution/delivery receipts and unknown outcomes.
8. Pending — bounded goal continuation with user priority.
9. Pending — focused reviewer contracts and explicit integration.
10. Pending — app-owned tool discovery; native semantic tools remain conditional on supported execution.
11. Pending — performance measurements and justified event/UI improvements.
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
