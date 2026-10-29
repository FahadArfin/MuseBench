# Native App MCP Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation with a final independent review.

**Goal:** Let Codex inspect and navigate the installed MuseBench through native MCP tools.
**Architecture:** Official MCP SDK stdio relay → authenticated profile-local loopback bridge → typed main-process services and correlated shell requests.
**Tech Stack:** Electron, Node HTTP, MCP TypeScript SDK, React/TypeScript, node:test, Playwright Electron for isolated acceptance.
**Spec:** docs/superpowers/specs/2026-10-28-native-app-mcp-design.md

## Global constraints
- Off by default, user-controlled, private current-user endpoint; no tokens in Codex config.
- Fixed schemas, no arbitrary evaluation or side-effecting provider actions.
- Shared renderer for preview/desktop; exact installed artifact verification.

## Review focus
- Wrong profile/token/origin and extra request fields must never reach services.
- Disable/restart revokes old credentials; relay re-reads discovery without replay.
- Renderer timeout/navigation cancellation must not leave executable stale requests.
- Shell inspection excludes inputs, auth secrets and embedded third-party content.
- Packaged relay must run from the installed executable/ASAR on supported desktop platforms.

## Tasks
1. [x] Add fixed tool schemas, private local host and SDK relay. Test auth, validation, startup/off/restart, bounds, MCP initialize/list/call and malformed calls with injected service.
2. [x] Add main-process service and correlated renderer transport; shared shell inspection/navigation; App control Settings, preload/types/preview. Test native navigation, screenshot and history without model requests.
3. [x] Add isolated Electron end-to-end MCP smoke and CI coverage; run targeted tests, build, full tests and parity as appropriate. Review immutable diff and fix material findings.
4. [ ] Push completed feature, await release, verify/install/reopen exact artifact. Enable for this authorized profile, register Codex using supported CLI, exercise actual installed connection. Record whether existing Codex chat needs tool refresh.

## Execution decisions
- Continue the clean primary checkout as previously authorized to keep the live preview aligned.
- User already requested implementation and connection; no repeat design approval gate.
- Register an installed-app command, not a transient checkout path.

## Validation before release
- Build passed; 1,168 tests passed; 97 preview/desktop parity scenes passed.
- Real Electron MCP smoke: navigation, Settings, Customize, screenshot, diagnostics, disable, stalled-renderer cancellation and shared preview panel passed.
- Windows packaged executable/ASAR MCP handshake, status and navigation passed.
- Independent review found three material issues. Regression tests first reproduced each; fixes now reject cancelled UI admission, remove pre-existing explicit Windows grants, and observe Electron's actual console/unresponsive events. No deferred minor findings.
- Cross-platform packaged execution and installed-release/Codex acceptance remain release checks. Linux AppImage moving mount-path limitation is documented. Screenshots may contain visible account/chat content by design. Provider availability is reported separately from shell navigation and is not fabricated by offline checks.
