# File review browser implementation plan

**Goal:** Open the selected output prompt's complete captured changes by default, with an All changes workspace view, directory navigation, captured file history and VS Code access. Replace the repeated deferred-file boxes with automatic selected-file comparisons and improve code/diff contrast.

**Architecture:** Retain immutable snapshot object references for every captured source change. A new source-bound review API returns metadata and bounded pages of exact diff hunks, without sending entire large files through IPC. The shared React browser owns scope, prompt, tree/filter, selected file and captured history; a virtualized, safely tokenized diff renderer displays the selected page. Existing browser/annotation/Meta changes remain untouched except narrow shared integrations.

**Constraints:** Local batch only; no publication, installation, installed-profile changes, paid model requests or new dependencies. Preserve workspace permissions and path/root/revision checks. Existing capture limits remain 100,000 files, 256 MiB/file and 16 GiB/workspace; comparison pages are implementation details, not a repeated warning in every file. Existing bounded run retention remains explicit. History means retained prompt captures, not a promise of Git commit history.

## Tasks

- [x] Backend: preserve all captured manifests and object references, including source-object garbage collection; expose typed inspection and paged comparison APIs. Compare selected immutable pairs asynchronously, preserve all changed hunks beyond the previous 2 MiB/3,000-row boundaries, and segment giant lines without silently losing content. Test more than 100 changed files, large/late changes, historical integrity and stale/foreign requests.
- [x] File browser: prompt/All changes controls, directory tree, filename filtering, truthful line counts, all-files option, auto-selected diff, captured-version selector, editor action, loading/error/empty states and ownership-safe responses. Preserve review/comment controls when available. Verify narrow and desktop layouts.
- [x] Renderer: restrained syntax colors, distinct additions/deletions/gutters/hunk separators, lossless line text, virtualized rows and bounded comparison pages. Improve legacy Diff colors and automatic deferred comparison while retaining checkpoint compatibility.
- [x] Integration: trusted IPC/preload APIs, preview implementation with the same UI, current-workspace membership checks for VS Code, prompt-specific dock routing and refreshed source-diff fixture. Run final typecheck/build and relevant targeted unit/interaction checks. Review material edge cases before reporting completion.

## Review focus

- A historical file changed or deleted again must still display the captured pair; never substitute today's content.
- Prompt selection must not label the whole chat/workspace delta as changes made by that prompt.
- Selecting another file, scope, prompt, project or chat must reject late async results.
- Large files and giant single lines must retain all changed content through bounded pages.
- Opening files in an editor must validate the current real project path; deleted/historical-only files must explain why they cannot be opened as current files.


## Divider behavior added to this batch

Dragging the chat/details divider to the workspace's right edge closes details. Dragging to the left edge makes details fill the content area. Restore split and double-click restore the normal split; Home expands, End closes, and ArrowRight restores from full width. The chat stays mounted and its unsent draft is preserved. The accessible separator reports the measured workspace width.

## Completed verification

- Full build and final TypeScript/renderer builds passed; no new dependency was installed.
- 82 targeted tests passed across paged review, snapshot/GC retention, run captures, file diffs, and editor path/membership validation. Coverage includes over 100 captured changes, large and giant-line comparisons, immutable historical content, newline-only/CRLF changes, signed page binding, retry recovery and safe stale-cache cleanup.
- Production Electron source review passed large-file IPC and automatic selection beyond 2 MiB, both pointer-edge divider states, keyboard restore, tall diff virtualization and draft preservation: `artifacts/source-diff/desktop-E4ujWA`.
- Production Electron activity regression passed file-tree selection, per-prompt default, legacy review/comment access, keyboard opening, narrow layout and light theme: `artifacts/activity-ui/source-v4d4tm`.
- Shared browser fixture passed 11 scope/history/paging/late-response/error/editor/narrow checks: `artifacts/file-review-browser/preview-UWVV0K`. The 500-file fixture passed 8 additional bounded-tree, deep selection, filtering, review callback and recreated-current-file checks: `artifacts/file-review-browser/large-0xb8c8`.
- Existing desktop review/comment checks passed: `artifacts/run-changes/desktop-TqA22z`. Motion/focus regression passed: `artifacts/motion/desktop-7XGxm5`.
- Independent review findings were fixed: final-newline markers, retryable failed jobs, late-mounted viewport sizing, fullscreen keyboard restore, current-file access for an older deletion capture, and retained review/comment controls.
- CI now runs the normal and large-tree review fixtures alongside the existing production source-diff and activity checks.

## Practical boundaries

History is the retained before/after captures from this chat (the existing retention policy is 20 per chat and 100 globally), not Git commit history. Newly captured runs retain every source entry within the existing source limits. Old captures that discarded text or file names cannot reliably reconstruct it; the viewer reports unavailable rather than substituting today's contents. File line counts load immediately for inline text and when other comparisons are selected; unknown totals remain visibly pending rather than appearing as zero. Large exact comparisons use fixed, isolated Git operations, bounded worker memory and paged spool files; failures expose a retry/editor action rather than partial results labelled complete. No real model request, installed-profile change, installation, restart or publication occurred.
