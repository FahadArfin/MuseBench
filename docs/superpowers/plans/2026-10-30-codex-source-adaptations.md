# Codex Source Adaptations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver six concrete improvements identified by comparison with pinned public Codex source.

**Architecture:** Extend current shared context/presentation functions and Electron boundaries. Preserve Muse ownership and authoritative stored state; introduce no second backend. Each task is independently reviewed and pushed, and the final latest release is installed once after validation.

**Tech Stack:** Node ESM, TypeScript/React, Electron 45, existing Muse SDK, SQLite, Node test runner and Playwright fixture scripts.

**Spec:** `docs/superpowers/specs/2026-10-30-codex-source-adaptations-design.md`

## Global Constraints

- Native Muse remains the backend. No paid model calls, hidden inference, personal account/billing/permission changes, or execution of upstream Codex code.
- Existing native session, request, approval, source digest, cancellation and no-replay boundaries remain authoritative.
- Provider frames, credentials, form values and private tool configuration are excluded from new diagnostics.
- Preview and desktop share product UI. Preview fixtures are labeled and never establish provider acceptance.
- Preserve saved chats, profiles, drafts, source history and existing compatibility identifiers.
- Keep current context, IPC, filesystem, schema and receive limits unless a specific requirement below narrows them.
- Test with disposable fixtures and focused behavior assertions; source, real Electron, scripted native, CI and installed evidence are distinct.
- Commit and push each reviewed finished feature. Install only the exact latest fully validated published Windows x64 artifact, with idle checks, full profile backup, manifest/hash verification, graceful close and reopen.

## Review Focus

- Clearing settings in a resumed/forked session conveys removal without claiming erased history (Task 1).
- Unicode/JSON escaping and failed structured results retain truthful outcome within the final wire bound (Task 2).
- A late reply or unrelated render cannot produce navigation success, and an already committed target is independent of paused unrelated animation (Task 3).
- Slow consumers, initial reads and action replies cannot accumulate state or roll back newer state; error receipts remain attached to their action (Task 4).
- Approval source names and per-field provenance are untrusted display data, never authority or secret-value projections (Tasks 5 and 6).

### Task 1: Complete app instruction snapshots (CS01)

**Files:** modify `src/shared/chat-context.mjs`, `src/shared/chat-context.d.mts`, `src/controller/context-receipts.mjs`, `src/shared/types.ts`, `src/ui/ContextReceipt.tsx`, relevant existing Memory/project instruction help in `src/ui/Preferences.tsx` and `src/ui/CommandDialog.tsx`; test `test/context-receipts.test.mjs` and focused controller tests. A small new `src/shared/app-instructions.mjs` helper plus declaration/test is appropriate if it keeps composition focused. Update guide/validation and roadmap row.

**Interfaces:** `composeChatContext(input)` keeps its call signature and returns an additive `instructionSnapshot:{version:1,scope:'app-settings',personal:'included'|'empty',project:'included'|'empty'}`. `contextReceipt` carries that descriptor without changing current personal/project SHA-256 fields. No accepted-state store or native mutation is added.

- [ ] Add failing tests for nonempty/edit/clear, unchanged, both empty, project isolation, resumed/legacy context, native/fallback and scope exclusions. Assert old instructions never appear in newly composed current sections, explicit empty scope text does, current requests/objectives/repository instruction behavior remain intact, and bounds still reject oversized input.
- [ ] Run the focused tests and save the expected regression output in this plan's SDD workspace.
- [ ] Render a complete named two-scope snapshot on every composed request, replacing only previous app-saved settings. Preserve full current text and add the versioned receipt descriptor. Explain future request behavior in existing help/disclosure.
- [ ] Exercise actual controller prompt composition for queue admission, fork/side and rejected/unknown send fixtures; verify no settings-save/preview request. Run existing context/queue/relation tests plus typecheck/build and a shared browser/Electron context inspection journey. Add the journey to a focused script rather than broad screenshots for every case.
- [ ] Run `npm.cmd test` once before commit, record result, self-review and commit `feat(context): replace stale app-saved instructions explicitly`.

### Task 2: Bounded useful discovery output (CS02)

**Files:** `src/runtime/discovery-gateway.mjs`; create `src/runtime/discovery-output.mjs` and `test/discovery-output.test.mjs`; extend `test/discovery-mcp-gateway.test.mjs` and relevant remote fixtures. Update `docs/TOOL-DISCOVERY.md`, validation and roadmap.

**Interfaces:** `boundDiscoveryResult(receipt,result)` returns the current `{...receipt,outcome,result}` unchanged when the complete wrapped frame fits; otherwise returns `{...receipt,outcome,truncated:true,preview:{text,originalWireBytes,omittedTextCodePoints,omittedNonTextBlocks},notice}`. Preview is not `result.structuredContent`. Export the frame-size measurement for focused tests, using the existing conservative 128-character request ID framing.

- [ ] Add failing behavior tests for valid large success/failure, invalid original output schema, quotes/backslashes, astral Unicode and combining marks, multiple text blocks, structured/media-only results, limit boundaries and unchanged downstream call count.
- [ ] Run focused red tests and retain output.
- [ ] Preserve original validation before calling the helper. Bound preview to 16,000 Unicode code points with head/tail/omission marker and then enforce the whole 131,072-byte frame bound. Text blocks only; omit media, metadata and structured output with clear notice. Keep unknown-outcome handling and transport bounds unchanged.
- [ ] Run gateway/remote/output tests with disposable stdio and loopback HTTP fixtures, assert source receipt/error status and one call. Run existing native scripted gateway contract only with local canned responses if needed to prove shape admission; no real inference.
- [ ] Run full unit suite once, self-review, document precise evidence and commit `feat(tools): retain useful previews of large discovery results`.

### Task 3: Native navigation completion receipts (CS03)

**Files:** `electron/native-control-service.mjs`, `electron/preload.cjs`, `src/ui/native-control-ui.ts`, `src/ui/App.tsx`, `src/shared/native-control-types.ts`, relevant declaration bridge; create a focused semantic-commit/visual-settle helper if needed. Tests: `test/native-control-service.test.mjs`, `scripts/native-control-smoke.mjs`, focused browser navigation journey. Update `docs/native-app-mcp.md`, validation and roadmap.

**Interfaces:** preserve `createNativeRenderer(...).call(operation,args,signal)` and existing tool names. Keep inspect result fields; add optional `navigation:{committed:true,visualSettled:boolean}` on verified navigation. Add a bounded safe phase-receipt read to diagnostics. React callback must resolve only when the exact requested shell destination commits; an explicit registered completion token may be observed from `useLayoutEffect`. No time-only target success.

- [ ] Add red tests for main reply after deadline while timer is overdue, single terminal completion, wrong claim/target, cancellation/renderer loss, and no late second response.
- [ ] Add browser/real Electron regressions for exact destination commit, relevant delayed transition, hidden/unrelated/infinite/zero-rate animations, stalled rAF and reduced motion. Existing delayed settings transition assertion must test visual status correctly under the new 400 ms visual budget.
- [ ] Implement strict main reply deadline and bounded 20-operation phase receipts. Bind semantic completion to request/target including requested subdestination. Limit optional visual wait to 400 ms and only relevant visible progressing transitions; return verified semantic state even if visual settling is incomplete. Preserve screenshot independence and no replay.
- [ ] Run focused unit and actual Electron native-control journeys, ensuring no personal app/profile modifications. Update documented tool result/diagnostic contract. Run typecheck/build and full unit suite once.
- [ ] Self-review and commit `fix(native): acknowledge committed navigation independently of animation`.

### Task 4: Bounded renderer state delivery (CS04)

**Files:** create `electron/renderer-state-publisher.mjs`, focused tests, shared ordering helper if useful; wire `electron/main.mjs`, `electron/preload.cjs`, shared bridge/types and `src/ui/App.tsx`. Preview public contract stays state-only. Add `scripts/renderer-state-smoke.mjs` plus CI chats group registration in `scripts/run-ci-suite.mjs`; update validation/roadmap.

**Interfaces:** `createRendererStatePublisher({send,readState,now,setTimer,clearTimer})` exposes `publish(state)`, `ack({generation,revision})`, `attach()`, `detach()`, `close()` and a read-only bounded diagnostic snapshot. Internal envelope `{generation,revision,state}`; public bridge returns state. A single reducer/order gate handles every Code state-producing response and push. Actual ack occurs after the view consumer has accepted the snapshot; preserve command-specific success/error separately from state ordering.

- [ ] Add failing tests: 10,000 writes without ack => one in-flight/one latest pending; matching ack delivers newest state; forged/stale ack cannot unblock; terminal/approval canonical facts survive; other observers unaffected; no resends after 2-second suspension; valid ack/explicit reattach recovers fresh state.
- [ ] Add ordering tests for initial-read versus push, delayed dispatch/choose-project result versus newer navigation, action error preservation, reload generation changes, and renderer teardown. Do not stamp captured stale action state with a newer revision.
- [ ] Implement the publisher and trusted IPC handshake. Subscribe before initial bootstrap. Suspend view delivery on timeout, rotate generation on reload/detach and reattach via a fresh canonical read. Never use presentation ack to reconnect/stop native work or replay actions.
- [ ] Run disposable Electron burst/reload/reattach and background-engine lifecycle checks with controlled fixture state. Record in-flight/pending maximum and final exact state, plus observed timing without claims about model speed. Verify preview and desktop public bridge behavior.
- [ ] Build, run full unit suite once, self-review and commit `perf(desktop): bound state delivery for slow renderers`.

### Task 5: Source-aware discovery approvals (CS05)

**Files:** `src/ui/permissions.mjs`, declaration if present, `src/ui/WorkspacePanels.tsx`, compact associated style; focused `test/ui-permissions.test.mjs`; browser/Electron native approval smoke using current fixture seams. Update tool guide, validation and roadmap.

**Interfaces:** extend `permissionDetails(value, runtime?)` with optional `discovery:{sourceId,tool,catalogRevision}` only for exact wrapper/validated args and matching current runtime-owned request plus reviewed source identity. Existing `pending`, raw details, choices/tokens, `approvalAllowed`, truncation/incompleteness fields are unchanged.

- [ ] Add red cases for exact valid wrapper and reviewed source, same-name sources, unknown ID, wrong wrapper, stale session/turn/current request, malformed/oversized args, hostile text and revised runtime selection. A catalog digest is requested identity, not proof of current catalog validity.
- [ ] Implement compact literal Source/Tool rows above the full raw details. Unsupported/unresolvable enrichment falls back to generic existing presentation. No metadata lookup, new auth choice or permission change.
- [ ] Run native approval unit regressions and shared preview/Electron cases for narrow layout, keyboard, raw-details access and disabled approval for incomplete requests. Verify exact one-time tokens are preserved through approve/deny fixture paths; no additional downstream effect on denial.
- [ ] Build and run full unit suite once, self-review, document boundaries and commit `feat(approvals): identify discovered tool sources clearly`.

### Task 6: Explain effective project MCP origins (CS06)

**Files:** `src/runtime/project-mcp.mjs`, `src/shared/customize-types.ts`, `src/ui/ProjectMcpReview.tsx`, existing compact CSS; tests `test/project-mcp.test.mjs` (resolve actual existing name), `scripts/project-mcp-smoke.mjs`. Update Customize/guide/validation/roadmap.

**Interfaces:** each safe server preview gains `settingSources` entries `{field,source:{path,revision}|null,overrides:{path,revision}[]}`. `source:null` denotes a built-in default. Canonical field path names include environment/header key names, never values. Source order and digest behavior remain the resolver's existing qualified semantics.

- [ ] Add red filesystem fixture tests for personal/root/nested precedence, nested map inheritance, array/scalar replacement, explicit false, canonical/legacy aliases, stable snapshot revision, mutation invalidation and secret-value absence from serialized public origins.
- [ ] Track origins alongside existing canonicalization/merge without changing the effective value or hash input semantics. Bind public origins to the same inspected source revisions. No new file reads/configuration writes or expanded native precedence.
- [ ] Add a collapsed Setting sources disclosure within existing Project server entries. Show effective-field origins and prior declarations compactly; built-in defaults are explicit. Keep review controls and source inventory usable at narrow width and via keyboard.
- [ ] Run focused project MCP/trust tests and `scripts/project-mcp-smoke.mjs` in preview and desktop. Verify source mutation forces normal re-review and no origin values leak credentials.
- [ ] Build, full unit suite once, self-review and commit `feat(customize): explain project MCP setting sources`.

## Parent integration and delivery

- [ ] Independently review each task and send focused findings to its implementer; preserve one report and exact diff per gate. After clearance, fast-forward clean main and push that feature. Do not run simultaneous implementation agents in shared files.
- [ ] After all six tasks, run the final whole-range review and relevant shared UI/native contract tests once. Fix actionable findings in a single consolidated wave and scoped re-review.
- [ ] Observe final exact-head Windows checks/release; superseded earlier builds are not installation candidates. Verify installer checksums/manifest/source identity; complete idle/profile-preserving installation and reopen.
- [ ] Inspect installed version and exposed controls with native MCP. Use disposable installed-app scenarios for controlled behavior and label them. Record personal navigation phase receipts if the previous timeout recurs.
- [ ] Report six delivered features, actual evidence, remaining external boundaries and important design rulings. Retain research/review/delivery evidence; no memory edits or heartbeat changes.
