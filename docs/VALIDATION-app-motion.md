# App motion audit and validation

Audited 28 October 2026. Applies to the shared browser-preview and Electron renderer.

## Audit and changes

| Journey | Before | Implemented | Evidence |
| --- | --- | --- | --- |
| Muse/Meta service groups and Chat/Ideas/Goals | Services eased over 380 ms with a delayed fade; children snapped | Reversible 280 ms content-height expansion with synchronized chevrons and immediate inert/ARIA state | Real frame samples, focused collapse and five rapid reversals |
| Code projects, pinned chats and recents | Immediate hide/unmount | Shared disclosure motion; project rows release their DOM and stop constructing hidden rows after closing | Intermediate heights, six project reversals, restored rows and final height |
| Profile/composer/context menus, dialogs, review docks, narrow navigation | Abrupt appearances | Small 140–200 ms opacity/translation entrances; animation layers release on completion | Menu/dialog running-animation checks, inspected light/dark/narrow captures |
| Code chat/project navigation | Abrupt swaps | 160 ms cancellable opacity fade on navigation identity, retaining the mounted composer | Draft value and exact DOM identity survive switching; streaming does not restart the fade |
| Settings, Customize/catalog, billing, Work, Sites, Spaces | Inconsistent transitions between sections | Shared keyed surface fade; rapid navigation retains at most one animation per surface | Browser and production Electron renderer checks |
| Reduced motion | CSS delays survived shortened durations; composer movement ignored mid-flight OS changes | Central OS/app policy, initialized before rendering; cancel scripted motion and respect the OS for scroll actions | App and OS tests, including a reproduced failing composer-movement test before the fix |
| Startup | Existing staged typing and flight could be cut off by its deadline on a busy renderer | Preserved normal cadence; fit travel and icon morphing to the remaining time, then hand off after a fully painted final frame | 15 startup checks, including slow first paint, low-budget fading and native-view release gate |
| Long transcripts and cached native pages | Existing memoization, lazy details and cached documents | Retained; no per-message animation or native-browser transform/resize animation | Responsiveness suite, 12 navigation-cache checks, 92 geometry/style parity scenes |

Desktop sidebar width changes remain immediate so native browser views and fixed overlays retain exact bounds. The sidebar content gets a short fade. Closing menus/dialogs remains immediate so actions and focus restoration do not wait for presentation.

## Fresh local verification

- `npm test`: 1,084 passed, zero failures.
- `npm run build`: TypeScript and production bundle passed. Existing bundle-size advisory remains.
- `npm run test:motion`: 12 checks in browser preview and 12 in the production Electron renderer; zero page errors. Collapse and expansion each recorded 28 rendered frames over 450 ms, spanning 101 px to 0 px and back.
- `npm run test:preview-parity`: 92 shared scenes passed, including native shell controls, settings, Customize, Code, Work, Sites, Spaces, billing and collapsed navigation.
- `npm run test:browser-preview`: navigation, isolation, settings and responsive layout passed. Updated the service-disclosure assertions to use the semantic open state.
- `npm run test:startup-animation`: 15 checks passed, including simulated slow first paint, low-budget fading, actual isolated Electron cold launch and reload behavior.
- `npm run test:chat-organization`: eight checks in each renderer passed; pinned-menu focus, keyboard controls, confirmation flows and persistence remain functional.
- `npm run test:code-responsiveness`: renderer, dictation subscription and 500-prompt timeline regressions passed; existing history DOM and drafts survive streaming and chat switches.
- `npm run test:navigation-cache`: 12 checks passed for independent documents/drafts, cached tools, auth changes and teardown.

## Reproducible evidence

- Baseline screenshots and failed interpolation observation: `artifacts/motion/before-preview-hUL9qZ/report.json`, `artifacts/motion/preview-F8R6bL/report.json`.
- Reproduced reduced-motion composer defect: `artifacts/motion/preview-0Fhf51/report.json` (one live transform animation remained after OS preference change).
- Final motion reports: `artifacts/motion/preview-XZJYfQ/report.json` and `artifacts/motion/desktop-NQ8FuQ/report.json`.
- Browser recording: `artifacts/motion/preview-XZJYfQ/page@9b8cbee2941bda77bdf363271eb33bb8.webm`.
- Inspected screenshots include `light-settings.png`, `customize.png`, `narrow-navigation.png` and Electron `work-home.png`.
- Existing regression reports: `artifacts/preview-parity/report.json`, `artifacts/navigation-cache/report.json`, `artifacts/code-render-responsiveness/report.json`, `artifacts/timeline-performance/report.json`, `artifacts/startup-animation/source-ks6rqh/report.json`, `artifacts/chat-organization/menu-KMVI2u/report.json`.
- Windows CI caught a slow-renderer launch deadline failure and a pinned-menu dismissal. The slow first-paint fixture reproduced the landing defect in `artifacts/startup-animation/source-mw5MHR/report.json`. The menu trace recorded a 1 px programmatic scroll in the disclosure clip; using non-scrolling `overflow:clip` removes the dismissal without weakening the scroll-dismiss behavior. Both regressions passed locally after the fixes.

The Electron motion runner renders the production bundle in an isolated offscreen BrowserWindow at 60 fps. A normally hidden Windows window was throttled to one frame per second and was unsuitable for measuring short transitions. Native-window startup and geometry checks remain covered by the separate existing suites. Provider documents are fixtures; this does not claim changes to or live measurement of Meta's own page animation. No model calls, payments, account changes or real-profile edits were used.

Independent source review found no remaining actionable findings after composer cancellation, lazy closed-project children, and stronger reversal tests were added. The motion suite now runs in both Windows validation and release workflows.

Follow-up review of the CI fixes found no blockers. Its suggested low-budget startup scenario was added and passed.

Startup browser measurements now use the built renderer with the preview fixture bridge. Cold Vite development transforms could consume the presentation watchdog after React mounted; that is not the shipped loading path. Both the normal built-renderer run and `--slow-renderer` (seven-second bundle delay) passed all 15 startup checks. A severely delayed paint may fade or reach the watchdog before fading; the regression requires released interaction and no unfinished flight in either case. The real Electron cold-launch tests remain unchanged.

The next release's Windows check exposed a separate late-font race: startup calculated centering and cursor advances from fallback glyphs after a 100 ms font wait, then the bundled font changed the title width. CI recorded a 4.342 px horizontal offset. Delaying the brand font by 350 ms reproduced the same failure locally. Startup now waits up to 400 ms for the actual brand glyphs, then either measures them or skips the flourish and opens the app. The total launch watchdog stays at 2.1 seconds. A separate two-second delayed-font test verifies that no misaligned animation starts. All 17 startup checks passed after the correction (`artifacts/startup-animation/source-EtOMjs/report.json`); the red reproduction is `source-pxCaKQ/report.json`.
