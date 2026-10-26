# Customize implementation plan

> Execute inline with the executing-plans and test-driven-development skills.

**Goal:** A native Customize dialog, reachable from either sidebar, with Skills, Connectors, Plugins and MCP tabs and real installation/setup controls.

**Architecture:** A narrow Electron service calls the installed official CLI without a shell. Skills use its existing configuration. Plugin and MCP additions require an explicit extension review; exact reviewed configuration is recorded separately from CLI credentials. The existing Windows shell sandbox and its startup checks remain enabled. Unknown or changed extension configuration remains blocked.

**Tech stack:** Electron, React, TypeScript, Node test runner, Playwright; no new dependencies.

## Constraints and design

- General Settings remains in the profile menu. Customize uses the existing dark/light palette and Muse blue, searchable cards, compact tabs, setup forms and explicit statuses.
- All extension changes are user initiated, serialized and blocked during active Code/Work/Sites runs. No installation occurs merely by opening Customize.
- Skills: real list, enable/manual-only/disable, local install and create a SKILL.md workflow. Plugins: local folder validation/review/install, enable/disable/remove. MCP: HTTPS or local stdio configuration, toggle/remove and official OAuth login/logout.
- Connectors opens Muse's existing official connected-apps flow using its saved session, and offers custom MCP setup. No fabricated provider connections or catalogs.
- Explain at the point of activation that plugin/MCP programs and external services have their own access; they are not contained by Muse's project shell sandbox. Never pass --yolo or --disable-sandbox.
- Do not return CLI auth files, raw settings, headers or process stderr to the renderer. Existing secret fields remain untouched. CLI settings writes retain unrelated fields, reject concurrent edits and retain a backup.
- Review grants cover exact MCP entries and plugin inventory/package content. Changes outside Customize require review again; existing safeguards for managed configuration, hooks and project trust remain.

## Tasks

- [x] Backend tests first: validate malformed inputs, secret redaction, concurrent configuration edits, review invalidation, shell-free CLI arguments, active-run rejection and failed installation.
- [x] Implement `electron/customize.mjs`, `src/runtime/extension-review.mjs`, typed IPC and the smallest runtime integration for reviewed extensions.
- [x] Implement `src/ui/CustomizeDialog.tsx` and CSS; wire sidebar, Settings and /mcp entry points, skill catalog refresh, focus/keyboard behavior and provider handoff.
- [x] Verify with an isolated actual Muse CLI profile and local fixture skill/plugin; no account mutation or model requests. UI tests cover all tabs, forms, failure states, search, dark/light/narrow layouts and persistence.
- [x] Run regression tests/build, package, compare source with packaged files, open the updated normal-profile app.

## Research

Installed Muse 1.4.13-R6996.1: `skills --help`, `plugins --help`, `mcp login --help`; local fixture validation/install in an isolated temporary USERPROFILE/XDG directory. Official references: https://dev.meta.ai/docs/muse-code/extending and https://dev.meta.ai/docs/muse-code/configuration.

## Review focus

Stale folder/configuration between review and install; arbitrary path/argument IPC; malformed settings without destructive recovery; OAuth failures and secret-bearing diagnostics; active task concurrency and extension changes outside MuseBench.

## Completion evidence

534/534 unit tests; actual native CLI fixture workflow including MCP initialization/tool enumeration; packaged Customize UI 8 checks; slash 14, Settings 11 and redesign/sidebar 18 checks. Package verification: 55 source/build files plus both native helpers match. See docs/CUSTOMIZE.md and artifacts/customize-ui/packaged-ODMVAM/report.json.

Review fixed stale approvals, ambiguous package hash encoding, Sites/cleanup busy coverage, intervening settings edits, and approval after inventory-load failure. Settings writes detect conflicts before replacement but do not claim a cross-editor lock. Plugin runtime approval remains in the official CLI.
