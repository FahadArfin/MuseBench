# Project MCP review implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Continue the already approved remaining-solutions plan, step 5.

**Goal:** Let users inspect and approve native project MCP configuration from Customize, then run the same reviewed configuration in both desktop runtimes.

**Architecture:** Read the effective MCP configuration from personal settings and the nearest Git root through the selected workspace. Show source revisions, merged server definitions with secret values withheld, and the project instruction files covered by native workspace trust. Store only a fingerprint grant, tied to the workspace, sources and effective definitions. Recheck before connection and every turn. Never write native saved trust or rewrite project configuration.

**Spec:** `docs/superpowers/plans/2026-10-26-remaining-solutions.md`, step 5, and the current request for compact, consistent Customize controls.

**Tech stack:** Existing Node/Electron services, React UI, Muse 1.4.14 and shared preview contracts.

## Constraints and decisions

- Keep the shared live checkout and preview aligned, under the standing main/push/install authorization.
- Native `.mcp.json` requires canonical names. Personal settings accept canonical or legacy names, never ambiguous pairs. Objects merge; arrays replace.
- Review is bounded and rejects symbolic links, invalid/null configuration, ambiguous transports and unsupported executable capabilities. Environment and header values never enter the renderer or stored grant.
- Git-backed native trust scope is the nearest Git root through the working directory. Review all instruction directories in that scope as well as MCP sources. Without Git, MCP is scoped to the working directory and ancestor instruction files remain blocked pending native qualification. Outside-scope MCP, native hooks, saved trust, plugins and managed settings retain their existing independent checks.
- Hash the actual child environment with Windows case-insensitive lookup. Project server references to the app billing key are unsupported. Recheck work-starting controls as well as ordinary turns; cancellation must remain available after revocation.
- Keep the compact directory. Add one Project servers button to MCP/Connectors and a dedicated review panel, not a permanent block above the list.
- Native inventory can omit settings/project servers. Display reviewed configuration, never claim connectivity from inventory presence/absence.
- Native acceptance uses an isolated echo provider, with provider identity asserted before a turn, no credentials and zero model requests. Model-issued tools/call is a separate pending acceptance gate.

## Task 1: Configuration and grants

- [x] Write failing behavior tests for canonical personal config, merged project layers, isolated worktrees, redaction, stale/source/environment changes, revocation and malformed/symlink inputs.
- [x] Implement a bounded project snapshot and separate fingerprint grant. Connect the shared runtime guard and workspace trust checks to the exact child environment.
- [x] Verify both runtime paths reject stale grants before any model turn.

## Task 2: Compact project review

- [x] Add read-only review and explicit approve/revoke commands scoped to the selected project, with stale selection and active-task guards.
- [x] Render effective servers, source fingerprints and covered instruction files in one detail panel; keep personal server actions unchanged.
- [x] Mirror behavior in the preview and verify review, stale rejection and return to directory without duplicated filters.

## Task 3: Native acceptance and release

- [x] Extend the echo fixture to prove nested repository merge, worktree isolation, approved loading and changed-source rejection using actual review/guard code.
- [x] Run focused tests, complete suite, build, catalog preview/desktop and parity. Perform one independent final review.
- [ ] Record the exact native evidence and remaining limitations. Commit/push the feature, await terminal CI, hash-check and install the release, reopen and inspect via native MCP.

## Review focus

- A new/changed ancestor file or Git boundary must invalidate approval.
- Personal config edits and secret references must not bypass the effective project review or expose values.
- Native trust also admits project instructions: the review must cover those same files.
- A persistent MSP host must not run after a source/grant changes, even if the UI was already open.
- Preview actions must remain simulations; runtime listing is not proof of a usable tool.
