# Session MCP inventory implementation plan

> Use superpowers:executing-plans for this approved roadmap follow-up.

**Goal:** Show the real connected Code session's effective MCP configuration and authorization state without starting a turn or refreshing the interface in the background.

**Architecture:** An on-demand runtime read calls experimental `mcpServer/list` with the exact owned session ID. The controller validates the current chat and connection before and after the read. A collapsed panel in the shared Session dialog displays a bounded projection through a dedicated read-only IPC method.

**Stack:** Existing Electron, React, TypeScript and Muse SDK 1.4.14; no dependencies.

**Spec:** `../../WORKSPACE-MCP.md`, backed by the installed 1.4.14 experimental schema and the isolated native inventory probe on 29 October.

## Requirements and review focus

- No new host, authentication, model request, tool invocation, settings write or automatic read from opening the dialog.
- Keep the user's existing native connection, task ownership and runtime lifecycle unchanged, including during running turns.
- Reject malformed, foreign, stale or disconnected scopes; suppress overlapping reads and stale UI responses.
- Project only server name, source, transport and OAuth state. Keep unknown states explicit; configuration does not prove tool execution or connection health.
- Bound display to 200 entries with a disclosed omission count. Never forward raw errors, commands, credentials or arbitrary native fields.
- Preview is explicitly simulated and shares the desktop component. Preserve compact Customize navigation.

## Task 1: Native read and scoped bridge

- [x] Add runtime tests for exact session routing during active work, no lifecycle events, concurrent reads, malformed/extra fields, unsupported methods and disconnect races. Observe RED.
- [x] Implement projection, runtime read, selector forwarding, controller scope checks, trusted IPC, preload and bridge types. Verify focused tests and native zero-model probe.
- [x] Add controller tests for task/session scope and late navigation results; observe RED then GREEN.

## Task 2: Shared on-demand panel and delivery

- [x] Add collapsed Session panel and preview simulation. Opening loads once; reopening reuses the snapshot; explicit refresh replaces it; failure clears stale data.
- [x] Verify preview and production Electron views, read counts, running-session controls, failure states, safe text and narrow layout.
- [x] Update native gateway evidence without claiming model invocation or dynamic schema reload.
- [x] Run full tests/build and one independent final review; fix substantive findings.
- [ ] Commit/push, verify CI and install the exact release. Record delivery receipts under `artifacts/release-<version>/` to avoid a release-only follow-up commit.

## Execution rulings

- Existing authorization covers implementing the remaining roadmap and publishing each feature; continue on the active main checkout to preserve the running preview workflow.
- The experimental API was found in the actual installed binary and returned the required session-scoped row with confirmed cleanup and zero model calls. This supersedes the older claim that no native inventory query exists.
- A read-only inventory does not resolve native model invocation, dynamic schema reload, peer messaging, MSP turn budgets, child lifecycle acceptance or native voice synthesis.
- Independent review found that a caller timeout released the duplicate-read guard before the native SDK request settled. The regression reproduced this failure; the guard now follows the native promise and cannot clear a replacement connection's guard. Added direct late-response tests for chat navigation and connection replacement. All 93 runtime/controller/selector tests pass after the fix.
- Preview and Electron smoke checks cover no automatic request, cached reopen, explicit refresh, failure cleanup, safe text, duplicate suppression, collapsed accessibility and narrow layout. The real runtime probe returns the session-scoped gateway with zero model calls and confirmed shutdown. Local full-suite, build and native receipts are retained in `artifacts/roadmap-native-2026-10-29/`; CI repeats tests, build and both UI smokes.
- The first release attempt stopped before publishing. CI exposed the child smoke's global CSS selector now matching both disclosures; the failure reproduces locally and the selector now targets the Native child agents region. Windows ARM also exceeded an existing one-second dispatch deadline that includes real workspace I/O. The fixture now allows five seconds for preparation and explicitly verifies the injected native process is still open; Stop responsiveness deadlines and production timeouts remain unchanged. The new head must pass the full release workflow before installation.
- The next attempt passed Windows ARM and catalog checks, then the billing desktop smoke timed out before obtaining the preload bridge. Its startup used the first Electron page, unlike the existing catalog/profile tests that select the exact local `dist/index.html` shell. Billing now uses that bounded shell selection and records startup page errors and observed URLs on failure. Its full local desktop flow passes; release acceptance still requires a green exact-head workflow.
