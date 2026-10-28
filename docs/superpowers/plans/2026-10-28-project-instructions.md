# Project instruction inspector implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Standing authorization covers implementation, publication and desktop delivery.

**Goal:** Explain documented project-rule selection, size and trust status in a compact read-only inspector.
**Architecture:** Bounded filesystem observer in the runtime layer; finite active-project Customize IPC command; shared renderer and deterministic preview fixture. Existing trust authorization stays separate.
**Tech Stack:** Node filesystem, TypeScript, React, existing MotionDisclosure and Playwright.
**Spec:** docs/superpowers/specs/2026-10-28-project-instructions-design.md

## Global constraints

- No model calls, account changes, config writes or new trust grants during inspection.
- Canonical active workspace only; 32 levels, 100,000 bytes/file, 500,000 bytes total; no candidate links.
- First existing candidate at each level wins even if unreadable. Unknown totals are not zero.
- Describe documented selection, not live-session context. Personal rules, memory and skills excluded.
- Preserve native trust policy and preview/desktop parity. Use shared motion and reduced-motion policy.

## Review focus

File replacement during observation; stale result after project selection changes; unsafe ancestor links; first unreadable candidate incorrectly falling through; cached grant being mistaken for a loaded-session claim.

## Tasks

### Task 1: Observe documented hierarchy and wire read-only inspection

Files: create src/runtime/project-instructions.mjs and test/project-instructions.test.mjs; modify electron/customize.mjs, src/shared/customize-types.ts and test/customize.test.mjs.

Interface: inspectProjectInstructions(root) returns bounded hierarchy, file observations, byte totals and checked time. Customize inspectProject resolves active root, adds existing trust-review status, rejects selection races, and never invokes CLI.

- [ ] Write filesystem/service tests and observe the missing behavior fail.
- [ ] Implement bounded observation and finite command.
- [ ] Run node --test test/project-instructions.test.mjs test/project-trust.test.mjs test/customize.test.mjs; expect passing cases including failed/partial reads and unchanged trust.

### Task 2: Shared compact inspector and preview

Files: create src/ui/ProjectInstructions.tsx, src/ui/project-instructions.css, scripts/project-instructions-checks.mjs; modify CustomizeDialog.tsx, preview/bridge.ts, catalog preview/desktop smoke scripts.

Interface: typed inspection result from Task 1; existing reviewProject/approveProject/revokeProject remain revision-bound. Fetch on explicit panel opening/refresh. Separate inventory review disclosure.

- [ ] Add shared browser checks for expected inspector behavior; record red before UI implementation.
- [ ] Implement accessible disclosures, safe source text, partial/error states and preview samples.
- [ ] Build and run catalog preview/desktop checks and parity; inspect screenshots.

### Task 3: Review, validate, release and inspect

- [ ] Run npm test and required build/regressions; record evidence in docs/VALIDATION-project-instructions.md.
- [ ] Fresh whole-change reviewer; reproduce and fix material findings.
- [ ] Commit and push the completed feature as one unit to keep release/preview aligned.
- [ ] Wait for exact-head Windows validation/release; verify published installer and installed source identity; reopen and inspect native UI. Do not claim live context/model acceptance from fixtures.

## Execution record

Base: 1bee9b45e366837dece508b3007248edd28cee2b. Main checkout is clean and serves the user's preview; retain it for the previously authorized main-release workflow. Skill-context and app-motion features already shipped in 0.2.116 and must not be reimplemented.

Task 1: complete — missing behavior reproduced; 54 filesystem/service/trust checks pass after independent review's snapshot mismatch fix.

Task 2: complete — missing UI reproduced; 14 preview, 9 desktop, 93 parity scenes and 24 motion checks pass. Inspected normal and 375-pixel screenshots.

Task 3: local validation and independent review complete; full suite 1,110 passed. Review found one P2, reproduced for content and precedence changes, then fixed by matching the candidate observation against the trust inventory. No deferred minors. Publication and installed-artifact proof follow the exact-head release workflow.

Ruling: Do not interpret successful filesystem inspection as a native session context capture or broaden existing ancestor trust. The optional init preview remains unqualified; no model invocation is added. Cost: that optional generation shortcut remains absent.
