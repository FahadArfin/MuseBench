# Controller and Electron shell review

Reviewed 2026-10-25 against `docs/superpowers/specs/2026-10-25-musebench-design.md`. Scope: controller, Electron main/preload/security, tutorial server and tests. Runtime implementation and UI implementation have separate reviewers. Application sources were not edited by this reviewer. Line references below identify the reviewed code; concurrent fixes may move them.

## Findings fixed during review

No findings remain open in this review scope after the fixes and focused regression checks below.

### P2: Persist cancellation before replacing the active task

`src/controller/index.mjs:98-105` and project-switch cleanup at `:144-148`.

`cancelCheck()` changes the old task to cancelled, but `startTask()` subsequently replaces `state.task` without saving the cancellation. The child's queued completion handler returns when its task ID is no longer current. If the child does not emit more output during cleanup, the old SQLite task row remains `running` indefinitely.

Confirmed using a real package command `node -e "console.log(12345);setTimeout(()=>{},5000)"`: wait for its marker, start a new manual task, then query `tasks.json` for the original task ID. The saved check retained `status: "running"` with no `endedAt`, although the process had been killed. Waiting for startup output matters: incidental output during cancellation can otherwise hide the defect by causing an emit/persist.

The controller now persists cancellation and its end time immediately, before replacing the active task, and normalizes historical running task records on startup. The focused regression waits for the standalone marker line before switching and passes independently.

### P1: Built-output preview was attributed to unrelated current source

`src/controller/index.mjs:120-128`, especially the former `vite preview` allowlist at `:123`.

The controller allowed `vite preview`, which serves an existing build, while hashing source and excluding `dist`/`build`. A previous build could therefore be inspected and accepted as evidence for subsequently changed source. The controller now refuses built-output preview without build provenance. The focused regression passes.

### P2: Changed tutorial source retained an already loaded old preview

`src/controller/index.mjs:90-97`, preview inspection at the `inspectPreview` action.

Starting the tutorial preview before applying the demo edit left the old iframe page loaded: the tutorial server has no HMR and the URL did not change. Inspection could then be attributed to the new source revision. Observed revision changes now stop the preview and require a fresh start. The focused regression passes.

### P2: An observed edit and revert could turn an invalidated running check green

`src/controller/index.mjs:94` and `:117`.

Confirmed before the fix: start a slow check, edit source and refresh, revert source and refresh, then let the check exit zero. It became `passed` despite the controller observing a different revision while the command ran. Running checks now carry sticky invalidation; returning to the original hash cannot restore their evidence. The focused regression passes.

### P2: Option-like script names ran npm options instead of the displayed command

`src/controller/index.mjs:60-64`.

Confirmed before the fix with package script `"--version": "node -e \"process.exit(9)\""`. Selecting it ran `npm run --version`, printed `10.9.2`, and recorded `passed`/exit 0 without executing the displayed failing command. Script names now must start with a word character. The focused regression passes.

## Verification and boundaries

Ran narrow real-process reproductions for edit/revert evidence, option-like script names, and outgoing-task persistence. Temporary fixtures were removed. Independently ran six focused regression tests covering the five resolved findings and the newly added explicit submitted-turn Muse completion gate: all six passed. The full suite was not rerun.

No additional actionable defect was found in the inspected Electron privilege boundary: sandboxed renderer, no Node integration, exact main-frame sender identity and UI URL checks, denied popups/webviews, and restricted frame navigation are present. This is a source review, not a claim of exhaustive exploit testing or live Muse verification.
