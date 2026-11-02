# Chat session tools implementation plan

**Goal:** A collapsible right-side panel, inspired by the supplied screenshot, collects real changes, subagents, processes and sources, plus Browser, Images, temporary Side chat and project app shortcuts.

**Design:** A narrow overview rail opens from a title-bar button and contains expandable groups. Opening an existing Changes/Sub-Agents/Checks view reuses that view. Browser, gallery and temporary chat open as rail pages with a Back control. Keep the main transcript and draft mounted. Remember rail visibility and section expansion, reset chat-owned detail state on navigation, and use a full-width overlay below 1050px. Keep existing shortcuts working.

**Approved side chat:** Same project files, independent conversation, discarded when closed. Use an independent read-only exec runtime with session logging disabled; never copy the main chat's history or forward side-chat messages to it. Do not start a model process on opening the panel. Start only on an explicit Send. Reconcile owner changes, cancel/clean up on close, and include active side work in app quit/update/billing busy guards. No provider call is made during tests.

**Browser:** A sandboxed Electron WebContentsView with its own in-memory session, no Node/preload bridge, no permissions/downloads/popups, HTTP(S) navigation only, and chat-bound ownership. Mount only when its pane is visible; hide beneath app dialogs and stop/dispose on close or owner changes. Browser preview uses a clearly bounded sandboxed iframe fallback for local previews.

**Images:** List chat uploads from saved history and captured PNG/JPEG/WebP file changes from this chat's run captures. Display truthful provenance (uploaded / created / modified), deduplicate, cap metadata, and load thumbnails lazily. Validate current owner, file containment, regular-file/non-symlink status, signature, byte limit and captured hash before reading workspace image bytes. Never attribute arbitrary project images or Markdown URLs to this chat.

**Useful existing tools:** Captured command output, project preview, validation checks, context/sources, checkpoints, native session controls, File Explorer, Terminal, VS Code and copy working directory. Show observed active commands as running commands; do not invent background processes where the runtime supplies none.

- [x] Add failing service and UI checks for ownership, lifecycle, real data and isolation.
- [x] Implement temporary chat, browser and image services with trusted IPC and bounded data.
- [x] Build shared session rail and wire existing views/app shortcuts.
- [x] Validate focused suites, build/typecheck, isolated Electron interactions, browser containment and screenshot comparison; obtain fresh code review and fix confirmed findings.

**Constraints:** Continue in the existing feature branch; preserve both earlier uncommitted batches. Keep this batch local. No installation, installed-app restart, provider-account changes or paid live model checks.

## Final verification

- `artifacts/session-tools-targeted.log`: 71 service, captured-change, exec-runtime and quit-lifecycle tests passed.
- `artifacts/session-tools-build-final.log` (final refresh): production build and TypeScript checks passed.
- `artifacts/session-tools/desktop-5J1Y0J/report.json`: six isolated Electron checks passed with real WebContentsView, IPC/image service and synthetic native model; zero provider calls and no renderer errors. Includes native browser containment at 125% app zoom and main-renderer reload cleanup.
- `artifacts/session-tools/desktop-VTICd8/report.json`: final overview/narrow visual check passed after change-count clipping correction.
- `artifacts/queue-composer/desktop-ZdfhGL/report.json`: all seven queue regression checks passed after App integration.
- Fresh independent review found duplicate side answers, destructive Stop, stale browser address updates, zoom placement and reload cleanup issues. All were fixed and the reviewer confirmed no remaining P0/P1/P2 in those changes.
- `design-qa.md` appends the comparison and limitations. No publication or installed-app action performed.
