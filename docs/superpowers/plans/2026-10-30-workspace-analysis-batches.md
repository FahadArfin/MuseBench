# Workspace analysis and batches implementation plan

Spec: `docs/superpowers/specs/2026-10-30-workspace-analysis-batches-design.md`.
Base: eea018bc4ada455145e94dfd93b7701af37738d6. Execute inline; existing attached isolated worktree. Preserve source/validation evidence. User has already authorized pushes and verified installs.

## Global constraints

No paid model runs, personal configuration/grant changes, arbitrary execution, hidden permission expansion or automatic replay. Keep v1 behavior and bounded workers/transport. Do not mark all OC03 delivered. Shared renderer for desktop/preview. Carry the verified 0.2.195 delivery receipt into this feature's documentation commit.

### Task 1: Shared operation catalog and one-snapshot analysis

Files: create `src/shared/workspace-analysis.mjs` and declarations; modify `src/controller/semantic-navigation.mjs`; tests `test/workspace-analysis.test.mjs`, `test/semantic-navigation.test.mjs`.

Interfaces: catalog exports exact tool-set normalization, operation descriptors and strict query/batch validation. Service retains `query(input, {signal}={})` and adds `batch(calls, {signal}={})`. Batch returns versioned receipt with ordered calls, snapshot and explicit scope; each result retains existing navigation result shape. New symbol/diagnostic results use bounded items. Abort rejects with `SEMANTIC_CANCELLED` and frees the worker.

- [x] RED: new operations reject today; batch absent; aborted query currently completes. Tests assert symbol/outline identity, syntax locations, one shared snapshot, independent per-call position failure, prevalidated IDs/count, cancellation followed by successful reuse, and no project plugin/outside reads.
- [x] Implement one bounded snapshot/compiler per batch, strict seven-operation catalog and worker cancellation.
- [x] Run `node --test test/workspace-analysis.test.mjs test/semantic-navigation.test.mjs`. Expected: all pass, existing scope/identity/limit regressions retained.
- [x] Commit focused service/catalog change and record evidence.

### Task 2: Versioned MCP discovery, batching and cancellation

Files: `src/runtime/workspace-mcp.mjs`, `electron/workspace-mcp-config.mjs`, relevant gateway/config tests and `scripts/workspace-mcp-probe.mjs`.

Interfaces: factory accepts `(root, {toolset='navigation-v1'}={})`, launches only known fixed flags. Server accepts the same trusted toolset. v1 tools unchanged; v2 adds batch. Cancellation handles active/queued requests out of band and passes AbortSignal to the owned service. Direct probe supports `--analysis` and records zero-model receipt evidence.

- [x] RED: v2 discovery and calls unavailable; queued/running cancellation does not work. Test invalid batch atomic rejection, output overflow receipts, duplicate IDs, cancellation ID/type/race isolation, queue/backpressure/EOF, fixed factory flags and Node/Electron subprocess execution.
- [x] Implement transport, strict launch mode and direct probe.
- [x] Run `node --test test/workspace-mcp.test.mjs test/workspace-mcp-config.test.mjs`. Expected: all pass including legacy and held-stdin shutdown cases.
- [x] Run `node scripts/workspace-mcp-probe.mjs --analysis --native`. Expected: seven-operation discovery, batch results, isolated native registration/cleanup, zero model calls. Commit.

### Task 3: Explicit session selection and compact receipts

Files: runtime/controller/security/native-session/types, preview bridge, connection dialog, workspace-tools directory, ordinary tool rendering; focused runtime/controller/session tests and shared browser/Electron smoke.

Interfaces: optional `workspaceToolset` is `'navigation-v1'|'analysis-v1'`; requires workspace tools and MSP, is persisted/restored, and cannot silently upgrade missing saved values. Renderer displays **Navigation** / **Analysis + batches** inside existing tools disclosure and provides searchable operation details. Receipt parser accepts only owned batch tool with valid bounded versioned payload.

- [x] RED: persisted mode lost, invalid mode reaches host, UI selection absent, receipt rows absent. Test legacy restore, selected resume, invalid mode rejection, no model call from discovery/receipt display, and equal browser/desktop UI.
- [x] Implement exact session mode propagation and compact accessible controls/receipts.
- [x] Run focused tests and browser/Electron smoke. Expected: both select/save/restore explicit mode and render bounded success/failure rows without sending. Run build and full unit suite; all pass.
- [x] Commit feature UI/integration and documentation.

### Task 4: Review, publish and verified desktop delivery

- [x] Record research limitations, direct evidence and 0.2.195 acceptance in docs; update roadmap OC03 as partial local implementation with explicit remaining prerequisites.
- [ ] Fresh whole-branch independent review of immutable base..HEAD; material findings get one RED→GREEN fix pass and full suite. Preserve ledger/evidence.
- [ ] Recheck latest main and local cleanliness, integrate/push completed feature. Wait for exact CI and published release; verify manifest, SHA256/SHA512, installer size and exact source.
- [ ] Fresh idle preflight, preserve complete profile/sessions, graceful close, verified install/reopen. Verify actual native version/health and named controls where exposed. Run production ASAR analysis probe separately, not as provider acceptance.

## Review focus

Review cancellation during initialization, queued work, worker construction, output backpressure and EOF; duplicate/numeric/string request IDs; batch snapshot/source identity and aggregate resource limits; input/metadata authority separation; unknown/saved tool-set widening; UI receipt spoofing/truncation/ownership; any path that starts project plugins, reads outside source scope, bypasses native permissions or claims provider acceptance from fixtures. Review schema-only discovery limitation explicitly.

## Self-review

Tasks cover all local-slice requirements. Task 1 catalog is consumed by Task 2 transport and Task 3 human discovery/validation. Task 2 receipt format is consumed by Task 3 parser. Native deferred third-party schema loading and paid model acceptance remain explicit prerequisites; this plan does not claim either.
