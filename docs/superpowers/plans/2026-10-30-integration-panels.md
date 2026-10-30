# Integration Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users review and save bounded native integration settings from compact installed-item details.

**Architecture:** Shared declarative field definitions and a finite main-process review service. The existing Customize command bridge carries inspection, preparation and single-use apply operations. A reusable React panel owns its draft and is keyed to the selected server revision.

**Tech Stack:** Existing Node, Electron, React/TypeScript, Playwright; no new dependencies.

**Spec:** docs/superpowers/specs/2026-10-30-integration-panels-design.md

## Global Constraints
- No model calls or personal account/configuration changes.
- Version 1 changes only required and two timeouts; credentials/executable identity remain private and unchanged.
- Approved source, idle owner, current revision and explicit review are required; no automatic reconnect.
- Preview and desktop share controls, with simulation clearly labeled.
- Inline implementation with one final independent review; preserve all evidence.

## Review Focus
- Source changes between preparation and atomic rename must never grant changed executable or credential configuration (Task 1 stale/race checks).
- A task/project may change while asynchronous settings or approval reads are pending (Task 1 ownership tests).
- Empty, unknown, fractional, out-of-range and ambiguous fields must not coerce into a different setting (Task 1 contract tests).
- Late UI responses must not replace another item's draft; editing after review invalidates the pending apply (Task 2 browser checks).
- Saving must not imply live reconfiguration or duplicate execution, including after persistence/approval failure (Task 1 failure and replay tests; Task 2 status checks).

### Task 1: Finite panel contract and reviewed persistence
**Files:** src/shared/integration-panel.mjs, src/shared/integration-panel.d.mts, electron/integration-panels.mjs, electron/customize.mjs, src/shared/customize-types.ts, test/integration-panels.test.mjs.
**Interfaces:** `createIntegrationPanels({settings,writeSettings,review,getState,isActive,isClosed,now})` exposes `inspect({name,revision})`, `prepare({name,revision,values})`, `apply({token,reviewed:true})`, `close()`. Commands `inspectIntegrationPanel`, `prepareIntegrationPanel`, `applyIntegrationPanel` return `integrationPanel` / `integrationReview`; applied result returns fresh state and reconnect message.
- [ ] Write failing tests for schema/defaults, exact approved source, private-field preservation, source/owner races, expiry/replay, busy transitions and failure handling.
- [ ] Run `node --test test/integration-panels.test.mjs` — expect RED for missing implementation.
- [ ] Implement the bounded schema/service and wire Customize with pre-commit checks.
- [ ] Run focused panel, Customize, plugin and project MCP tests — expect PASS; commit.

### Task 2: Compact shared settings and verification
**Files:** src/ui/IntegrationPanel.tsx, src/ui/CustomizeDialog.tsx, src/ui/customize.css, src/preview/bridge.ts, scripts/integration-panel-smoke.mjs, scripts/run-ci-suite.mjs, package.json, .github/workflows/windows-checks.yml, test/ci-workflow.test.mjs, docs/INTEGRATION-PANELS.md.
**Interfaces:** `IntegrationPanel({name,revision,disabled,onChanged})` consumes finite Customize commands; local draft/review state does not outlive the selected owner. Browser preview provides explicit simulation using the same shared field validation.
- [ ] Write a browser and real isolated Electron smoke for disclosure, draft/cancel/review/apply, stale review rejection, item-switch isolation, narrow layout and reconnect status. Expect RED before the panel exists.
- [ ] Implement the shared panel, preview adapter and installed detail placement; add the smoke to the existing extensions CI group and coverage contract.
- [ ] Run `npm run test:integration-panels`, focused regressions, `npm test`, `npm run build` — expect PASS. Update roadmap and evidence, commit.

### Task 3: Review and verified delivery
**Files:** docs/validation/2026-10-30-integration-panels.md, docs/ROADMAP-2026-10-29.md and focused corrections.
**Interfaces:** Exact reviewed source and published installer; personal native controls distinct from disposable mutation fixtures.
- [ ] Request one fresh whole-branch review, re-grade findings, fix Important/Critical with RED→GREEN, retain evidence.
- [ ] Push completed feature to main after fresh checks; wait for all six Windows groups and publication.
- [ ] Verify exact installer hashes, recheck idle state, back up profile, gracefully install/reopen and inspect native UI; run isolated installed panel checks without changing personal integrations.
