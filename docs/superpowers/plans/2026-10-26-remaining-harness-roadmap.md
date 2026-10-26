# Remaining harness roadmap implementation plan

> Use superpowers:executing-plans to implement and verify each feature, then push its commit.

**Goal:** Complete the remaining approved research roadmap with functional controls, shared desktop/preview UI, and explicit native capability boundaries.

**Architecture:** Extend the existing controller and runtime contracts incrementally. Pure shared modules define validated settings and capability descriptions; native services own processes and Git; the shared React renderer consumes truthful state. Background runtimes must bind events to tasks rather than the selected chat.

**Stack:** Electron, React, TypeScript, Node, SQLite, Git, installed Muse CLI/SDK.

**Spec:** ../../MUSE-CLI-HARNESS-RESEARCH-2026-10-26.md

## Constraints and review focus

- Never bypass native sandbox readiness or turn peer/model text into user consent.
- Preserve existing chats, drafts, queues, workspaces, and package identity.
- Preview uses shared controls and explicitly simulated runtime data; no fake native execution receipts.
- Route every event, stop, approval and continuation to an exact task/run. Block overlapping writable checkouts.
- Missing logs, stale requests, failed process cleanup, malformed settings, interrupted writes and dirty worktrees fail visibly and preserve recoverable state.
- User has authorized implementation and per-feature GitHub pushes; no repeated design or publishing approval is needed.

## Feature sequence

- [x] **1. Capabilities:** shared capability contract and connection display; test disconnected/exec/MSP/preview states and unsupported reasons. Files: shared/runtime-capabilities.*, UI WorkspacePanels, capability tests. Verify build/browser, commit/push.
- [x] **2. Budgets:** validated per-chat/queued time and step profiles; show actual effective limits, preserve defaults and stop/cleanup. Files: shared/run-options, runtime/exec, composer, controller tests. Verify invalid inputs and native arguments/timeout, commit/push.
- [x] **3. Background chats:** task-bound runtime registry, independent navigation, running badges and targeted stop; serialize overlapping checkout writes and retain restart recovery. Test concurrent isolated tasks, switching during output, cancellation and late events. Commit/push.
- [x] **4. Context handoffs:** attributed text/files sent to a chosen chat queue, preserving source and recipient identity; no implicit approval. Test cross-project references, duplicates and archived recipients. Commit/push.
- [x] **5. Workflow library:** saved editable app workflow templates, phases, budgets, writable scope and completion checks; inspect installed native workflow contracts before native execution controls. Test persistence, validation and dispatch. Commit/push.
- [x] **6. Context/usage:** expose context omissions and actual native usage where supported; compaction must use a validated native API or remain explicitly unavailable. Test limits/provenance. Commit/push.
- [x] **7. Worktree lifecycle:** setup action, task association, retained/recoverable archives; never destructive implicit cleanup. Test dirty/locked/missing/submodule cases and restart. Commit/push.
- [x] **8. Skill follow-through:** invocation receipts from native events, import preview/provenance and small tested MuseBench skill pack. Validate actual installed loader events. Commit/push.
- [ ] **9. Interactive runtime:** refresh Windows MSP probes and official docs; implement validated exact-turn steering, request-ID questions/approvals, feature negotiation and reconnect. No sandbox bypass. Test idempotency, stale targets and multiple pending requests. Commit/push supported behavior; record concrete external blockers separately.
- [ ] **10. Agents:** real child event/control panel with attempt-specific messaging/cancellation, descendants, workspace and usage; gate actions on negotiated support. Verify real native events plus malformed/late fixtures. Commit/push.
- [ ] **11. Models/extensions:** installed model discovery and compatible reasoning; reviewed project trust/web/hooks without weakening execution boundaries. Verify native support and config tests. Commit/push.
- [ ] **12. Final verification:** independent whole-change review, regression fixes, full suite, browser smoke, desktop parity, packaged-source verification and desktop update. Ensure all commits pushed.

## Execution ledger

- Ruling: continue on the existing clean main checkout to keep the user's active preview connected to current sources. Feature pushes are explicitly authorized; no force pushes or unrelated changes.
- Ruling: approved research is the design baseline; implement sequentially without repeating design questions. Unsupported native functions are not marked complete merely because a disabled button exists.
- Base: 63484c9.

- Feature 1: capability tests RED (missing module) then GREEN; 29 runtime/capability tests, production build and browser smoke passed. Preview labels all connection capabilities as simulated.

- Feature 2: budget tests RED then GREEN; 53 runtime/controller/settings tests, build and browser smoke passed. Presets are Standard (3 min/8 steps), Extended (15 min/32 steps), Deep (45 min/96 steps). Older settings keep original defaults; queues retain their selected run options. Token caps are explicitly not claimed.

- Feature 3: background controller test RED then GREEN; 625 tests, browser smoke, production build and 25 parity scenes passed. Two real native model requests completed in separate task sessions with correctly routed replies. Queue continuation, isolated stop, overlap rejection, restart receipts and shutdown cancellation are covered. At most four chats run concurrently; overlapping root folders are serialized.
- Feature 3 regression fixes: shutdown cancellation precedes waiting for preflight, removed chats detach retained contexts, and legacy approval behavior remains unchanged. Retained task contexts keep archive/move metadata synchronized.

- Feature 4: attributed handoffs retain bounded file snapshots and recipient permissions, deduplicate retries across restart, and reject stale sources/archived recipients. 627 regression tests, production build and browser smoke passed; added a focused size/attribution check before commit.

- Feature 5: four editable app-owned workflow templates queue bounded phases with immutable snapshots, budgets, relative scope instructions and completion checks. Native QA-only workflow commands are not invoked. Validation, restart persistence, idempotency, ordered execution and failure hold tests pass; 631 tests, production build and browser smoke passed. Scope instructions are explicitly not a separate filesystem sandbox; self-review is not called independent review.

- Feature 6: native run-usage counters now flow through correlated event folds into persisted chat state and Session/Context views. Missing reports remain unknown; repeated reports replace earlier counters, aggregate reporting is marked partial, and child inclusion is explicit. Last-request history omissions are visible; native history is distinguished from replay. 90 targeted tests, build and browser smoke passed; two previously captured real Meta usage reports matched the parser. Native compaction remains unavailable on Windows exec (the documented session/compact interface requires MSP); recap is explicitly not compaction. Interactive compaction remains part of feature 9 validation.

- Feature 7: explicit package-script setup runs inside a managed worktree, with persisted task association and logs. Archive creates a Git snapshot using a private index and retains the original checkout including ignored files; unarchive reopens it, and snapshot recovery creates a separate branch/worktree. Locked, symlink, embedded-repository and submodule archives fail without deleting files. Dirty/staged/untracked contents, restart, setup isolation and archive/recovery tests pass. 636 tests, production build and browser smoke passed. Browser coverage exposed the growing composer menu overlapping the header; it now opens into available space. Fixed two Windows-encoded separator bytes found during this build.

- Feature 8: native read_skill receipts parsed from a real successful bundled:git load; model prose cannot create them. Import review shows bounded instructions, files and source SHA-256; changed sources invalidate install and import provenance survives restart. Three optional MuseBench references passed installed CLI validation and baseline/follow-up reference retrieval checks (baseline judgment already passed). Preview uses the same skill source text and review UI. 640 tests, build and browser checks passed. Pack sources are materialized outside the packaged asar before native CLI validation. Background/unresolved chats block configuration changes.

- Feature 9 external blocker: rechecked installed 1.4.13-R6996.1, latest published SDK 1.4.13 and official steering/compaction contracts. Windows sandbox readiness remains ready but MSP initialize returns sandboxAvailability=unavailable without a reason. Probe closed its own host, created no session and made no model call. Upstream issue 107 remains open. Exact-turn steering, concurrent questions/approvals and native compaction remain unfinished; no bypass, fake control or unverified adapter is enabled.
- Feature 10 partial delivery: Agents & workflows exposes only correlated native parent workflow status, parent run identity and reported concurrency limit. It does not turn the limit into an agent count or invent descendant identities, workspace or usage. Full attempt-specific child messaging/cancellation remains blocked by feature 9 and absent exec child streams. Real captured workflow fixture and malformed/foreign event tests cover projection.

- Feature 11 model delivery: sessionless native model/list returns the real provider catalog despite the MSP execution gate; it creates no session or model call. Composer selects declared models and reasoning tiers, preserves model descriptions, and refreshes/validates before submission. Explicit model identity is checked against native run events. A real selected-model request completed successfully. 644 regression tests, build and browser checks passed before final model-mismatch regression. Native web_fetch failed two bounded probes (inside and outside the user profile), stalling after allow:self_mediated_network_approval; cleanup confirmed. Web remains disabled, not marked supported. Hooks run outside the tool sandbox/approval flow per official docs and remain disabled pending a separately validated reviewed host execution path.

- Feature 11 project-skill delivery: Customize previews bounded project instruction files and records their root/digest only after explicit in-app trust. Native Code and skill discovery use --trust-workspace only while that review matches; edits invalidate it and revocation is available. Native global trust, project MCP/hooks, ancestors, symlinks and oversized instruction trees are not implicitly authorized. A real run loaded a project-scoped trust-proof skill and returned a confirmed read_skill receipt. Broad saved trust/hooks remain unsupported rather than weakening the existing guard.
