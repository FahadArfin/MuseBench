# Launch polish implementation plan

**Goal:** Refine the existing centered blue terminal typing and sidebar landing without lengthening startup.

**Architecture:** Keep the existing process-owned launch ticket and mounted app. Refine only the shared React wordmark, CSS and Web Animations choreography. No new dependencies or provider behavior changes.

**Design:** A compact terminal chevron and one moving underscore; stationary letters reveal softly with a short pause before AI. Hold the completed wordmark briefly, then accelerate and settle into the measured sidebar position. A faint blue light behind the mark disappears as the app is revealed. Avoid bounce, particles, glossy text, large glows and extra copy.

**Constraints:** Facebook blue; centered title; exact sidebar handoff; normal sequence under two seconds; reduced-motion skip; immediate Escape/click/resize skip; existing native visibility gate and bounded fallback; same renderer in preview and desktop.

## Implementation and verification

- [x] Refine `src/ui/LaunchAnimation.tsx` and `src/ui/launch-animation.css`: approximately 850 ms typing/hold, 740 ms travel, smaller optical proportions, one caret following measured glyph positions.
- [x] Extend `scripts/startup-animation-smoke.mjs` to inspect caret position, acceleration, handoff and light/dark rendering while preserving lifecycle checks.
- [x] Build, run the startup smoke with cold-renderer delay, inspect rendered frames/video, and review skip/reduced-motion behavior.
- [x] Check desktop package and preview parity; capture the updated launch preview for review.

## Validation

- Build succeeded; 1,053 unit tests and 92 preview/desktop parity scenes passed.
- Normal browser/source Electron startup: 13 checks passed. Delayed renderer: 9 checks passed. Packaged Electron: 2 checks passed, including the same frame-level motion assertions.
- The package verifier matched 190 source/build files and both native helpers.
- Source reports: `artifacts/startup-animation/source-AmVNel/report.json`, `source-YdgDKR/report.json`; packaged report: `packaged-lM4Ffl/report.json`. The updated demo is `source-AmVNel/launch-demo.webm`.
- Release validation exposed an existing test-window selection race: hidden account lookup windows could precede the local renderer. Profile and chat organization smoke tests now select the local renderer; their 6 and 16 checks passed respectively.
- A delayed-renderer run produced one blank preview load without a mounted app. An isolated retry and a full delayed run passed; load diagnostics now record failures if it recurs.
- Read-only final review found no actionable concerns.

## Review focus

- Missing/collapsed sidebar fades in place.
- Cold font loading does not shift the landing position.
- A skipped animation never hides the real brand or leaves the app inert.
- Native provider views remain hidden until the DOM animation completes.
- The caret disappears before the terminal becomes the final chat icon.
