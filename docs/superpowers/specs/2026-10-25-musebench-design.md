# MuseBench desktop MVP

The user requested implementation from the two supplied Markdown handoffs. This document adopts their local Muse-first architecture and narrow review workflow. MuseBench is the requested product name; Patchlight remains the name of the preserved reference package.

## Intent
Help someone make one change to a local web project and inspect the actual files, preview, and test evidence before accepting an exact revision. Build a functioning Windows desktop application, with honest unavailable states when Muse is absent.

## Approach
Electron with an isolated React/TypeScript renderer and Node controller is the selected engineering default from the handoff. A browser-only controller adds a privileged localhost API; Tauri adds a second systems language and sidecar packaging. Neither improves this first Windows delivery. The desktop preference was also offered to the user asynchronously.

## Scope and constraints
- One selected project and active task at a time; multiple saved project entries.
- Preserve supplied ZIP and MDs; extracted source under reference/ stays unchanged.
- Muse CLI and @muse-code/sdk only. No replacement agent, credentials copied from other apps, paid calls, publishing, or global installs in this build session.
- Discover a binary and surface diagnostics. Explicit Connect starts the official selected host; explicit Send submits a turn. Runtime schema/version mismatch fails closed.
- Main-process controller owns filesystem, child processes, evidence, and persistence. Renderer receives a small typed IPC API; preview frames get no IPC.
- Canonicalize workspaces, reject symlink escapes, exclude credentials and generated directories, bound file/log sizes. No arbitrary renderer filesystem path reads.
- Content hashes include selected project source contents. Baseline snapshot records starting state, including untracked files; changes report additions, modifications, and deletions. Any revision change invalidates prior preview/check/acceptance evidence.
- Check and preview commands come from package scripts, with their actual command visible before the user runs them. Use loopback preview and manage child process lifetime. Exit zero means the configured command passed, not proof of every acceptance criterion.
- Acceptance records a local checkpoint only, after approved plan, completed turn or explicitly manual work, inspected current preview, and a passed current check. Revalidate hashes before accepting.
- Persist local metadata/journal/checkpoint records in SQLite using Node's built-in sqlite module. Keep large bounded artifacts in application data.
- Include a deterministic tutorial that edits only its own copied sample project. Label its generated plan/edit as a demo. Its checks, diffs, revision hashes and preview are real controller operations.

## UI
Original quiet review desk: forest-green navigation, warm neutral workspace, blue primary actions, serif task heading, compact chat column and large review panel. Project picker, runtime setup dialog, task composer, five review stages, file diff drilldown, sandboxed preview, command logs, checkpoint history, keyboard focus and responsive layout. No copied logos or remote assets.

## Verification
Node tests exercise boundary paths, stale evidence, failed commands, persistence and checkpoint races. Preserve/run adapter contracts. Build TypeScript and Vite. Exercise the actual Electron renderer via Playwright, including tutorial flow, narrow layout, no renderer Node access and runtime unavailable diagnostics. Package a runnable Windows directory. Live Muse remains unverified until an eligible installed runtime and account are supplied and exercised.
