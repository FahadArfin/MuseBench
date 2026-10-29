# MCP settings compatibility implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. One fresh final review covers this correction.

**Goal:** Installing a first connector or MCP server must create a settings file accepted by the pinned Muse CLI.

**Architecture:** Keep the existing reviewed, atomic settings writer. Supply the native schema marker only when absent, preserve all existing fields, and keep discovery read-only. No project extension guard or model permission changes.

**Tech stack:** Node.js, Electron, Muse CLI / SDK 1.4.14.

**Spec and evidence:** Native 1.4.14 rejects a settings file without `schema_version` during `serve` initialization. The native `skills disable` command creates `schema_version: 1` in an isolated profile. `createCustomize.writeSettings` currently saves a first MCP recipe without that required marker. Earlier MuseBench-created files can have the same omission.

## Constraints and review focus

- Preserve existing schema markers, unrelated fields, secrets, server grants, backups and concurrent-write checks.
- A refresh must not migrate settings. Repair occurs only with an explicitly reviewed settings edit.
- Preview retains the same UI and command contract; no additional controls are needed.
- Native acceptance probe uses a disposable profile and workspace, no login, and no model turns.
- Project configuration support stays gated. A zero-model project probe returned empty native inventory; this does not establish model tool loading or absence.

## Task 1: Correct and verify settings writes

- [x] Add failing tests for first catalog/manual installs, repairing a missing marker during a reviewed edit, preserving an existing marker, and read-only discovery.
- [x] Run the regression tests and observe the missing-marker failure.
- [x] Add a repeatable native acceptance probe; observe failure on the current writer.
- [x] Set the default marker at the existing atomic-write boundary and rerun tests/probe.
- [x] Run relevant extension suites, build and fresh review.
- [ ] Commit and push; retain terminal release and installed-artifact receipts under `artifacts/release-<version>/`.
- [ ] Wait for release validation, install the hash-verified artifact, reopen and verify the installed source and Customize surface.

## Execution notes

- Base: `7666fcb69b3ea2d118273a28da8f6dba949878ac`.
- Ruling: Continue the user-authorized main/preview/release workflow for this correction; no unrelated settings migrations or native project-scope claims.
- Regression cycle: three missing-marker failures before the correction; five focused tests and 100 related extension tests pass after. `npm.cmd run build` passed.
- `node scripts/customize-settings-probe.mjs` failed at native initialization before the correction and passed with schema 1 / native host 1.4.14 after. Both runs closed the owned host and removed the isolated workspace. No model calls or credentials were used.
- Final review found that the probe needed to enforce the compatibility pin. It now reuses the app's compatibility gate with the loaded SDK version. An in-memory harness reproduces the old false pass and now rejects wrong host version, schema version and fingerprint, while accepting the matching tuple. The native probe passed again; 105 extension/compatibility tests passed. No production writer defect was found in review.
