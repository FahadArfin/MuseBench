# Imported plugin hook controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let people review and control supported Claude- and Codex-style plugin hooks in the existing compact plugin details.

**Architecture:** Reconcile the native CLI projection with the contained installed source, then reuse exact per-capability grants and reconnect checks. Preserve shell strings verbatim and disclose their execution, matching and ignored presentation fields. Share all controls between preview and desktop.

**Tech Stack:** Electron/Node, React/TypeScript, Muse CLI/SDK 1.4.14, Node tests and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-extension-catalog-design.md`, already approved. Standing user instructions authorize implementation and publication of each completed integration.

## Global Constraints

- Browsing and inspection never execute or approve a plugin command.
- Use only exact native per-capability approval/rejection, bound to installed package, definition, settings and source identity.
- No additional model usage; owned native acceptance checks actual `echo` provider before a turn. Retain audit folders.
- Keep existing compact controls, on-demand inspection and all native/MCP behavior. No new polling, duplicate navigation or automatic installation.
- Keep the authorized main checkout, preview and desktop synchronized; preserve real profile/settings.

## Evidence and scope

The installed 1.4.14 CLI imported conventional/inline Claude hooks and explicit-file Codex hooks. Three isolated echo phases proved zero executions before approval, nine owned executions after approval, and zero after revocation. Six live hookRun receipts covered prompt/stop hooks; SessionStart was proved by owned recorder output. Manual matching tests proved `Bash|Read` inclusion and `Write` exclusion. The manual test did not enforce Claude `if`; conditional hooks stay setup-required pending normal-runtime proof. Quoted Windows shell paths failed in one native fixture: never rewrite or promise portability for arbitrary commands. Evidence is in ignored `artifacts/imported-plugin-hooks/`.

## Review Focus

- Hidden or ambiguous source behavior, including a condition omitted by native inspection, must not receive approval.
- Source paths, manifest family, package edits and native projection drift must invalidate review.
- Shell strings must remain complete; credential redaction must neither expose recognized secrets nor hide executable syntax.
- Imported commands must show shell execution and matching before consent; unsupported hooks must not borrow another hook's grant.
- Preview and desktop must retain matching compact controls with no idle refresh or late-result reopening.

### Task 1: Source-bound imported hook inspection

**Files:** new `electron/imported-plugin-hook.mjs`, `electron/plugin-hook-definition.mjs`, `electron/plugin-capabilities.mjs`, `electron/plugin-command-review.mjs`, new `test/imported-plugin-hook.test.mjs`, `test/plugin-capabilities.test.mjs`.

**Interfaces:** `inspectPluginHook` retains `{supported,reason?,hook?,source?}`; supported imported hooks add `execution:'shell'`, `source:string`, `ignoredSilent:boolean`, with `matcher:string|null`. Source inspection verifies relative containment and exact shell/event/timeout/async projection. `displayPluginShellCommand(command)` returns the unchanged string or refuses ambiguous recognized credentials. Existing native hook/MCP interfaces remain compatible.

- [x] Add failing tests for all three observed layouts; shell/matcher metadata; ambiguous/unknown fields, conditions, source escapes, stale projection and missing files; full command display and secret rejection.
- [x] Run `node --test test/imported-plugin-hook.test.mjs test/plugin-capabilities.test.mjs`. Expected initially: imported support absent.
- [x] Implement bounded source reconciliation and exact service grant/revoke. Permit missing native source_path only after imported source verification. Limit shell strings to 16,000 characters, retain whitespace, reject other controls.
- [x] Repeat focused tests. Expected: all pass; installation/inspection does not execute scripts.

### Task 2: Shared compact imported-hook controls

**Files:** `src/shared/customize-types.ts`, `src/ui/PluginTools.tsx`, `src/preview/bridge.ts`, `scripts/plugin-tools-smoke.mjs`.

**Interfaces:** Optional imported hook metadata from Task 1; existing action and revision contract unchanged. Preview adds a simulated imported hook with independent grants.

- [x] Add failing browser/Electron behavior checks for shell command, source, matcher, ignored silent setting and explicit consent; revoke independently and preserve unsupported/no-refresh/narrow checks.
- [x] Run `npm.cmd run test:plugin-tools`. Expected initially: imported controls absent.
- [x] Implement compact metadata and confirmation; render the exact shell string rather than pretending it is argv.
- [x] Run `npm.cmd run build` and `npm.cmd run test:plugin-tools`. Expected: all pass.

### Task 3: Production acceptance and review

**Files:** ignored native probe, new `docs/validation/2026-10-29-imported-plugin-hooks.md`, `docs/REMAINING-FEATURES-2026-10-27.md`.

- [x] Exercise all three imported layouts through production Customize and configuration review using an isolated owned profile. Verify exact approval and revoke with native echo output/receipts; conditions remain unsupported; inspect without executing. Expected: zero model requests, all owned processes closed.
- [x] Run `npm.cmd test`, build, catalog preview/desktop and preview parity. Expected: all pass.
- [x] Commit complete feature locally and obtain one fresh-context final review of the immutable base-to-head range. Fix Important/Critical findings with RED-to-GREEN regressions and full suite; no second review.

### Task 4: Publish and installed acceptance

- [ ] Push completed feature; await exact-head Validate and seven-target Release success.
- [ ] Verify release manifest, installer hashes and latest.yml, then install/reopen when idle. Preserve profile and verify installed source/version.
- [ ] Inspect all Customize pages through native control, confirm preview parity and record delivery evidence.

Commit once Tasks 1-3 form a complete feature; keep review fixes separate. Publish only after validation/review. The ledger records each task's tests and immutable ranges.
