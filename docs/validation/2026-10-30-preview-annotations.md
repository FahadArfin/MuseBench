# CX05 preview annotations validation

30 October 2026. Base dc0101b90d0300b4e8263a9e061551a2d30bb96c, isolated branch codex/preview-annotations.

## Scope

Code project preview: fixed DOM reader, bounded temporary selection, exact owner/frame/page binding, explicit comment-to-draft workflow. The current iframe sandbox and trusted top-level IPC admission remain unchanged. No provider or model request, account change, new grant or telemetry.

## Evidence

- Eleven focused unit cases cover strict public input, sanitized page identity, bounded data, plain untrusted evidence, TTL/discard/navigation, capture races, late feedback, owner/frame/URL changes, changed/removed/moved targets, read timeout and destroyed-frame cleanup. Missing service and adapter were observed failing first.
- Real Chromium DOM capture verifies visible text, excluded controls/editable/hidden/offscreen content, bounded traversal/text, nested-frame isolation and no click activation.
- Eight shared production UI checks in both browser and Electron: pointer/keyboard selection, unsent durable draft append, images/files/mode preservation, SPA navigation invalidation, draft capacity rejection retaining comments, Escape, late capture/feedback after chat changes, and narrow/reduced-motion layout.
- Electron parity uses the real fixed-frame adapter across different loopback origins, with a real context-isolated preload/IPC boundary. Its project frame has no MuseBench bridge.
- Production desktop shell/preload/controller and actual copied tutorial server: selected a heading, saved feedback to the owning draft, verified unchanged message count, and invalidated a selection on a same-URL reload. Clean isolated profile; no provider calls.
- Build/typecheck passed. Existing browser-preview navigation/isolation/settings/responsive regression passed. Full unit suite: 1,575 passed, one pre-existing optional skip, zero failed. Final review and delivery receipts are appended after completion.

## Corrections found by actual execution

The first Electron navigation test exposed access to a destroyed frame when a chat was switched. A reproducing unit case failed; the adapter now clears the destroyed reference before reading its properties.

The actual desktop preview exposed a layout coupling: adding the comment form introduced an outer scrollbar, narrowed the iframe and correctly invalidated its geometry. Reserving the preview panel's scrollbar gutter keeps the target stable. The same real-app test then passed without loosening stale-evidence checks.

One full-suite failure was the deliberate CI inventory assertion: the new annotation suite had not been added to its required list. Updated that inventory while retaining every previous check. No test was removed or relaxed.

Visual inspection also found an idle selection notice on the next chat after the old frame disappeared. An Electron regression failed first; invalidation notifications now update the UI only while an annotation is active. Browser and Electron checks passed again.

## Boundaries and choices

First delivery covers the local Code preview. Other web surfaces and nested-frame internals remain outside scope. Structural selectors identify visible targets; this is not a source-code location map. Excerpts are bounded, and selection blocks page interaction until cancelled. Existing drafts persist only after explicit Add to draft.

The fixed capture function follows the documented [Electron frame API](https://www.electronjs.org/docs/latest/api/web-frame-main) and [navigation lifecycle](https://www.electronjs.org/docs/latest/api/web-contents), inspected 30 October. Host/page evidence is not an instruction source.

Evidence retained under .superpowers/sdd/2026-10-30-preview-annotations and artifacts/preview-annotations in the isolated worktree. Screenshots of the actual production tutorial selection were inspected. Release and installation proof remain separate.
