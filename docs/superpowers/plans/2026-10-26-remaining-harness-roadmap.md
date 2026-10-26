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
- [ ] **2. Budgets:** validated per-chat/queued time and step profiles; show actual effective limits, preserve defaults and stop/cleanup. Files: shared/run-options, runtime/exec, composer, controller tests. Verify invalid inputs and native arguments/timeout, commit/push.
- [ ] **3. Background chats:** task-bound runtime registry, independent navigation, running badges and targeted stop; serialize overlapping checkout writes and retain restart recovery. Test concurrent isolated tasks, switching during output, cancellation and late events. Commit/push.
- [ ] **4. Context handoffs:** attributed text/files sent to a chosen chat queue, preserving source and recipient identity; no implicit approval. Test cross-project references, duplicates and archived recipients. Commit/push.
- [ ] **5. Workflow library:** saved editable app workflow templates, phases, budgets, writable scope and completion checks; inspect installed native workflow contracts before native execution controls. Test persistence, validation and dispatch. Commit/push.
- [ ] **6. Context/usage:** expose context omissions and actual native usage where supported; compaction must use a validated native API or remain explicitly unavailable. Test limits/provenance. Commit/push.
- [ ] **7. Worktree lifecycle:** setup action, task association, retained/recoverable archives; never destructive implicit cleanup. Test dirty/locked/missing/submodule cases and restart. Commit/push.
- [ ] **8. Skill follow-through:** invocation receipts from native events, import preview/provenance and small tested MuseBench skill pack. Validate actual installed loader events. Commit/push.
- [ ] **9. Interactive runtime:** refresh Windows MSP probes and official docs; implement validated exact-turn steering, request-ID questions/approvals, feature negotiation and reconnect. No sandbox bypass. Test idempotency, stale targets and multiple pending requests. Commit/push supported behavior; record concrete external blockers separately.
- [ ] **10. Agents:** real child event/control panel with attempt-specific messaging/cancellation, descendants, workspace and usage; gate actions on negotiated support. Verify real native events plus malformed/late fixtures. Commit/push.
- [ ] **11. Models/extensions:** installed model discovery and compatible reasoning; reviewed project trust/web/hooks without weakening execution boundaries. Verify native support and config tests. Commit/push.
- [ ] **12. Final verification:** independent whole-change review, regression fixes, full suite, browser smoke, desktop parity, packaged-source verification and desktop update. Ensure all commits pushed.

## Execution ledger

- Ruling: continue on the existing clean main checkout to keep the user's active preview connected to current sources. Feature pushes are explicitly authorized; no force pushes or unrelated changes.
- Ruling: approved research is the design baseline; implement sequentially without repeating design questions. Unsupported native functions are not marked complete merely because a disabled button exists.
- Base: 63484c9.

- Feature 1: capability tests RED (missing module) then GREEN; 29 runtime/capability tests, production build and browser smoke passed. Preview labels all connection capabilities as simulated.
