# Motion refinement audit

Reviewed 28 October 2026. This extends the earlier `VALIDATION-app-motion.md` pass across the same shared preview and Electron renderer.

## Journeys reviewed

| Journey | Finding and implementation |
| --- | --- |
| Muse and Meta navigation, Code projects, pinned/recent chats | Existing reversible disclosures retained. Reviewed rapid reversals, keyboard focus, narrow navigation and saved state. |
| Code request activity and tool details | Request activity now interpolates its height and releases hidden output after closing. Native details use intrinsic-height CSS transitions, with immediate keyboard exclusion and focus restoration while closing. |
| Changed files and file diffs | Extra file rows and individual diffs expand/collapse with the shared disclosure. Large closed content stays lazy; rotating chevrons share the same timing. |
| Sub-Agent list, details and tabs | A short navigation fade softens content replacement. Live status/stream updates do not replay it. |
| Chat and Work selection | The control stays centered while its selected pill moves over 240 ms. Switching back mid-animation continues from the visible position, including remounting the Spaces workspace. |
| Work recents/search, Sites and Spaces lists | Replaced immediate hiding with the same reversible disclosure. Search focus and list semantics remain available. |
| Settings, Customize, billing, menus and dialogs | Existing short entrances and keyed navigation fades remain consistent; verified in dark/light appearances and rapid tab changes. |
| Launch and long chats | Existing launch cadence retained. Startup, lazy history, draft identity, streaming, dictation subscriptions and 500-prompt timeline regression checks passed. |

No animation is attached to each streamed token. Native browser host bounds and sidebar width changes remain immediate so embedded views retain their correct coordinates. Menu/dialog dismissal remains immediate for focus restoration. Meta's own remote pages are not restyled by this work.

## Verification

- `npm test`: **1,131 passed**, no failures or skips in the final local run.
- `npm run build`: TypeScript and production bundle passed; the pre-existing bundle-size advisory remains.
- `npm run test:motion`: **16 checks in preview and 16 in production Electron**, no page errors. Activity expansion sampled 29 frames from 0 to 123.0625 px with intermediate heights in each renderer. Covers reversal, keyboard focus during collapse, nested/pre-existing inert state, reduced motion, lazy DOM release, selection alignment, Spaces remount and native host geometry.
- `npm run test:activity`: **14 isolated desktop checks** passed, including actual filesystem diffs, long-file-list interpolation, DOM release, keyboard access and narrow layout. This existing suite now also runs in Windows validation and release CI.
- `npm run test:code-responsiveness`: renderer behavior, dictation subscriptions and 500-prompt timeline checks passed. The closed-output check now verifies immediate inert state and bounded release after the exit transition, rather than expecting synchronous unmount.
- `npm run test:preview-parity`: **97 scenes** matched structure, styling and geometry within 1 px, no errors, including collapsed and deliberately delayed native details.
- `npm run test:startup-animation`: **17 checks** passed during this pass, including delayed fonts/first paint, reduced motion and actual isolated native-window launch/reload.
- `npm run test:browser-preview`: navigation, isolation, settings and responsive layout passed.

One repeated full test run encountered a transient `fetch failed` in the unchanged Spaces oversized-request test. All 20 Spaces hub tests passed in isolation, and the subsequent complete 1,131-test run passed. No server behavior was changed as part of the motion work.

## Review and reproducible evidence

The independent final review found two defects. Both were reproduced before their fixes:

1. Deferred native-details visibility left output focusable during its closing animation. An app-scoped observer now makes non-summary children inert immediately, restores focus to the summary, and restores only restrictions it owns on reopening. Nested disclosures preserve their own closed state and pre-existing inert restrictions.
2. A newly remounted Spaces selection pill skipped its incoming animation. The shared selector now honors the captured origin on initial mount as well as subsequent mode changes.

Local evidence, intentionally excluded from Git:

- Original missing interpolation: `artifacts/motion/preview-L7klhE/report.json`; file-list regression: `artifacts/activity-ui/source-79S83N/report.json`.
- Focus regression before correction: `artifacts/motion/preview-shknza/report.json`; Spaces reversal regression: `artifacts/motion/preview-KfqqDB/report.json`.
- Final motion: `artifacts/motion/preview-6rZOzf/report.json`, `artifacts/motion/desktop-szAteH/report.json`.
- Desktop activity: `artifacts/activity-ui/source-72VHSA/report.json`.
- Final tests/build logs: `artifacts/motion-refinement/tests-final.log`, `build-reviewed.log`, `responsiveness-green.log`, `parity-reviewed.log`.
- Startup: `artifacts/startup-animation/source-lesocZ/report.json`.
- Inspected captures include production Electron `tool-detail.png`, `file-diff.png`, `customize.png`, `work-selector.png`, `narrow-navigation.png`, and the live preview `artifacts/motion-refinement/04-refined-work-navigation.png`.

The motion and parity suites use isolated offscreen Electron windows at 60 fps so Windows occlusion throttling does not invalidate short-transition measurements. The separate activity/startup suites use actual isolated desktop windows. Provider data is fixture data; no model calls or billing operations were performed. Exact published-build, installer hash and installed desktop evidence are recorded in `artifacts/motion-refinement/` during delivery.

## Release-check follow-up

Windows validation passed the feature commit, but its separate release run measured an expanded native tool contract before its transition ended (13 px of remaining movement). A local probe confirmed that Chromium's `document.getAnimations()` omits `::details-content` transitions even while their measured height changes. Delaying the desktop transition reproduced the mismatch. Parity now also waits for the pseudo-element's computed transition duration and delay, bounded at three seconds. The full deliberately slowed run passed, and regular CI now includes two additional contract scenes.

A subsequent local run captured the hidden Electron runtime dialog at its 5 px entrance offset. Parity now uses the same 60 fps offscreen compositor as the motion suite and rejects captures with unfinished finite animations. All **97** scenes passed afterward. These are verification-harness changes; application timing and geometry were not changed to satisfy the comparisons.

Evidence: `artifacts/motion-refinement/details-probe.log`, `parity-native-red.json`, `parity-slow-details-green.json`, `parity-hidden-dialog-red.json`, and the final `parity-final-97-compositor.log` / `artifacts/preview-parity/report.json`.

Native details enhancement is guarded by CSS support checks and follows [MDN's details-content reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::details-content) and [Chrome's intrinsic-size interpolation documentation](https://developer.chrome.com/docs/css-ui/animate-to-height-auto). Both OS and app reduced-motion preferences disable these transitions, including the native pseudo-element.
