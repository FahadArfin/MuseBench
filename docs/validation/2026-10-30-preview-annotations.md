# CX05 preview annotations validation

30 October 2026. Base dc0101b90d0300b4e8263a9e061551a2d30bb96c, isolated branch codex/preview-annotations.

## Scope

Code project preview: fixed DOM reader, bounded temporary selection, exact owner/frame/page binding, explicit comment-to-draft workflow. The current iframe sandbox and trusted top-level IPC admission remain unchanged. No provider or model request, account change, new grant or telemetry.

## Evidence

- Eleven focused unit cases cover strict public input, sanitized page identity, bounded data, plain untrusted evidence, TTL/discard/navigation, capture races, late feedback, owner/frame/URL changes, changed/removed/moved targets, read timeout and destroyed-frame cleanup. Missing service and adapter were observed failing first.
- Real Chromium DOM capture verifies visible text, excluded controls/editable/hidden/offscreen content, bounded traversal/text, nested-frame isolation and no click activation.
- Nine shared production UI checks in both browser and Electron: pointer/keyboard selection, unsent durable draft append, images/files/mode preservation, SPA navigation invalidation, draft capacity rejection retaining comments, Escape, forward/reverse Tab isolation, late capture/feedback after chat changes, and narrow/reduced-motion layout.
- Electron parity uses the real fixed-frame adapter across different loopback origins, with a real context-isolated preload/IPC boundary. Its project frame has no MuseBench bridge.
- Production desktop shell/preload/controller and actual copied tutorial server: selected a heading, saved feedback to the owning draft, verified unchanged message count, and invalidated a selection on a same-URL reload. Clean isolated profile; no provider calls.
- Build/typecheck passed. Existing browser-preview navigation/isolation/settings/responsive regression passed. Full unit suite: 1,575 passed, one pre-existing optional skip, zero failed. Final review and delivery receipts are appended after completion.

## Corrections found by actual execution

The first Electron navigation test exposed access to a destroyed frame when a chat was switched. A reproducing unit case failed; the adapter now clears the destroyed reference before reading its properties.

The actual desktop preview exposed a layout coupling: adding the comment form introduced an outer scrollbar, narrowed the iframe and correctly invalidated its geometry. Reserving the preview panel's scrollbar gutter keeps the target stable. The same real-app test then passed without loosening stale-evidence checks.

One full-suite failure was the deliberate CI inventory assertion: the new annotation suite had not been added to its required list. Updated that inventory while retaining every previous check. No test was removed or relaxed.

Visual inspection also found an idle selection notice on the next chat after the old frame disappeared. An Electron regression failed first; invalidation notifications now update the UI only while an annotation is active. Browser and Electron checks passed again.

## Independent review and fix pass

A fresh independent review covered dc0101b..7a5c5aa and found two material issues. Both were accepted and independently reproduced before fixes. No findings were deferred or declined.

- P1: range rectangles included closed-details text, overflow-clipped text, screen-reader clipping and the offscreen remainder of a partially visible text node. All four real Chromium regressions failed first. Capture now intersects ancestor clipping bounds, excludes collapsed/nonrectangular clipping, and admits only complete visible glyphs with a hit check. Work is capped at 500 DOM nodes, 4,000 inspected characters and 600 output characters. All four regressions pass while retaining the visible heading.
- P2: reverse Tab entered the iframe during selection and could activate its site button. The real production component regression failed first. The iframe is now inert and removed from tab order during selection. Forward/reverse Tab, no site activation and Escape cancellation pass in browser and Electron.

After the single fix pass, build/typecheck and the full unit suite passed again (1,575 passed, one existing optional skip, zero failures). Browser and real cross-origin Electron annotation suites each passed nine checks. Review findings, red/green logs and dispositions are retained in the local ledger; publication and installed acceptance remain separate below.

## Boundaries and choices

First delivery covers the local Code preview. Other web surfaces and nested-frame internals remain outside scope. Structural selectors identify visible targets; this is not a source-code location map. Excerpts are bounded, and selection blocks page interaction until cancelled. Existing drafts persist only after explicit Add to draft.

The fixed capture function follows the documented [Electron frame API](https://www.electronjs.org/docs/latest/api/web-frame-main) and [navigation lifecycle](https://www.electronjs.org/docs/latest/api/web-contents), inspected 30 October. Host/page evidence is not an instruction source.

Evidence retained under .superpowers/sdd/2026-10-30-preview-annotations and artifacts/preview-annotations in the isolated worktree. Screenshots of the actual production tutorial selection were inspected. Release and installation proof remain separate.

## Packaged application

The rebuilt Windows x64 package passed the real tutorial-server scenario after the review fixes. Production shell, preload, IPC and controller staged an unsent durable draft, then discarded a selection on same-URL reload. The selected-target screenshot was inspected. Evidence: artifacts/preview-annotations/app-pDNZ9V, review-package.log and review-packaged-app.log. This used isolated data, not the installed personal profile.

## Release-run correction

Release 0.2.194 (run 41025654423) was not published. Packaging and five validation groups passed; the real-app annotation test failed after staging feedback. The runner's smaller display correctly triggered the existing responsive panel close, while the test assumed the panel remained open. Explicitly setting a 1,000-pixel viewport reproduced the exact timeout locally. The test now asserts that close, reopens through the normal `/preview` command with the existing draft as prefix, verifies the durable draft remains identical, and continues the reload check. Product behavior is unchanged. Annotation suites and the CI contract suite passed; the packaged app also passed the corrected small-screen scenario. Failure reports for this suite are now included in CI's fixture-report artifact without profiles or screenshots.
