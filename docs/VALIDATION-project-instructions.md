# Project instruction inspector validation

Validated 28 October 2026. The inspector is a bounded filesystem observation of documented Muse selection, not a capture of a running model's context.

## Implemented

- Customize → Skills → Installed has an on-demand, smoothly collapsible Project instructions panel.
- Shows candidate hierarchy through the nearest Git boundary, selected and shadowed files, UTF-8 byte costs, source text and existing project review status.
- Read-only command resolves the controller's active project; ignores renderer-supplied roots, rejects selection races, works during active runs, and never invokes Muse.
- The existing trust review inventory remains separate, revision-bound, explicitly approved and guarded against active tasks. No ancestor trust expansion or automatic approval.
- Safe text previews reject candidate links, non-regular/binary/invalid UTF-8 files and bounded-read overflows. Partial results retain unknown totals. Failed UI refresh removes the old inspection.
- Preview uses labeled sample data. Shared components preserve keyboard access, focus behavior and reduced motion.

## Evidence

- Initial backend red: `artifacts/project-instructions-red.log` (14 expected missing-feature failures).
- Focused filesystem, service and trust tests: 54 passed (`project-instructions-review-green.log`). Includes first-file precedence, Unicode bytes, Git worktree boundary files, empty/oversized/binary/invalid files, junctions, 500 KB aggregate and 32-level limits, active selection changes and unchanged permissions.
- UI red: `artifacts/project-instructions-ui-red.log` (missing Project instructions control).
- Shared catalog checks: 14 browser checks (`artifacts/catalog-preview/compact-pxynj7/report.json`) and 9 isolated production Electron renderer/preload checks (`artifacts/catalog-desktop/source-Lkep6m/report.json`). Both include on-demand reads, reversible collapse, source text escaping, narrow layout, failed-refresh clearing and partial recovery. Screenshots in those folders were inspected.
- `npm run build`: TypeScript and production bundle passed. Existing bundle-size advisory remains.
- `npm test`: 1,110 passed, zero failures/skips (`artifacts/project-instructions-suite-final.log`).
- `npm run test:preview-parity`: 93 scenes passed, including the inspector and separate review flow. Old test navigation was updated from the replaced details summary to the new buttons.
- `npm run test:motion`: 12 browser and 12 Electron motion checks passed. Reports: `artifacts/motion/preview-FBM4IA` and `artifacts/motion/desktop-2Ia5de`.
- Real read-only observation of this checkout: one level, Git boundary at the workspace root, no project instruction files, complete zero-byte observation. No file or review changes.
- Windows validation/release runs 40742522100 and 40742522105 stopped in the broad browser smoke test because it still targeted the replaced `Project skills and rules` summary. Updated that journey to expand Project instructions and Project trust review, then assert the current reviewed-state text and revoke control. The complete browser smoke test passed locally (`artifacts/project-instructions-browser-preview-fix.log`); all trust and consent assertions remain in place.

## Review and decisions

Independent read-only review found one P2: a displayed observation and subsequently read trust inventory could refer to different contents. Temporary-filesystem regressions reproduced both changed text and restored higher-priority filenames showing a false reviewed label. The fix compares all documented candidate paths and text, including absence, against the review inventory before reporting trust; incomplete or mismatched observations have unavailable trust. Both tests passed after the fix; the full suite was rerun. No minor findings were deferred.

Native session loading, hostile concurrent filesystem mutation guarantees and release/installed-artifact acceptance were not claimed by that source review. Runtime authorization still revalidates separately. Native model/session acceptance is outside this read-only feature, and no new paid model runs were authorized. The optional `muse init` generation preview remains deferred pending qualification of its model-call behavior. Delivery requires terminal exact-head Windows CI and installed artifact/UI verification recorded separately after publication.
