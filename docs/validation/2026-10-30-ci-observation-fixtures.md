# CI fixture timing and observation correction

Base: a4fa196fb3f870c3cfeb4d9fa5b1caf2bcefdbb1. Investigated the appearance and gateway failures in [release run 41165750750](https://github.com/FahadArfin/MuseBench/actions/runs/41165750750). This correction changes test fixtures and evidence interpretation only; product animation, provider deadlines, runtime gates and T307 features remain unchanged.

## Launch motion evidence

The retained Electron report contained a 329.6 ms gap in moving-frame observations. The old checker selected a frame about 140 ms before the nominal quarter time and applied quarter-time bounds to its 0.006374 displacement. The later middle sample also carried stale geometry. This demonstrates inadequate frame coverage; it does not establish that the actual product easing changed, that the pause was smooth, or which component delayed observation.

The fixture now records maximum frame gaps and fraction-sample errors. Natural fraction assertions retain the existing bounds when observations are adequate (maximum gap 80 ms and nearest-fraction error 40 ms). Inadequate coverage is explicitly reported as unobserved, without retrying or calling it smooth.

Curve proof is independently mandatory: capture the actual production flight animation's keyframes and timing, then pause/replay that captured animation through Chromium at exact 25/50/75% timeline offsets and measure its transformed geometry. The approved cubic-bezier contract and the same quarter/middle/deceleration bounds remain enforced. An intentionally wrong ease-out control fails those bounds in both browser and Electron. Natural-run visible typing, flight, exact text/icon landing/handoff, input release, native-view hiding, reduced motion, failure release and no-replay checks remain intact.

The retained CI trace is a focused unit fixture. A controlled 330 ms main-thread flight stall reproduces the old failure, then passes with natural sampling explicitly inadequate (332.9 ms maximum gap) and independent rendered curve proof. Its paused geometry reports quarter 0.077592, middle 0.652703 and three-quarter 0.952738. This is rendered curve evidence, not a claim of smooth motion during the stall.

## Gateway deadlines

The positive escaped-output case shared a 200 ms call budget with the intentional uncertain-call case. A controlled fictional response delayed 350 ms returns unknown once under that old budget (242.7 ms elapsed including cleanup). This reproduces the suspected deadline mechanism. The original CI log did not retain its receipt or caught exception, so the precise CI exception remains unconfirmed.

Positive fixtures now use a bounded 5000 ms call budget, while product default reviewed-source deadlines stay unchanged. A dedicated negative test retains the original 200 ms deadline with a withheld receipt, asserting unknown outcome, closed/reconnect behavior, exactly one submitted effect, no replay and descendant cleanup. A separate delayed large-result test completes and truncates exactly once after the 350 ms scheduling delay. Existing encoded-output bounds remain independently tested.

## Verification

- `node --test test/startup-motion-analysis.test.mjs test/discovery-mcp-gateway.test.mjs test/discovery-output.test.mjs`: 40 passed, zero failed/skipped.
- `node scripts/startup-animation-smoke.mjs --browser-only`: 21 checks passed, including the controlled flight gap, real-font readiness, failure, reduced-motion and geometry cases. Report: `artifacts/startup-animation/source-lKfYHG/report.json`.
- `node scripts/startup-animation-smoke.mjs --desktop-only`: four production Electron groups passed, including deterministic rendered curve/wrong-curve control, live landing/native hiding, delayed optional probe, reload/second-instance no replay and lost-completion release. Report: `artifacts/startup-animation/source-yMVbVr/report.json`.

Both smoke reports contain no renderer errors. Desktop protocol responses and gateway effects are fictional disposable fixtures; no live provider, paid model request, personal profile or installed artifact was exercised. No full suite, push or installation was performed. Fresh exact-head remote CI and release acceptance remain pending.

## Native visibility boundary correction — 31 October

[Run 41167637799, appearance job 124438551966](https://github.com/FahadArfin/MuseBench/actions/runs/41167637799/job/124438551966) at 5e0f201 passed the curve checks, then failed the native-view hiding assertion. The only disputed native sample was at integer epoch 1793420110213 ms; the renderer's derived last-active time was 1793420110213.0999 ms. All earlier native samples were hidden. The 0.0999 ms cross-process clock boundary cannot establish whether that native reveal preceded renderer completion; the retained artifact did not record causal completion ordering. No actual early product reveal is established from it.

The source Electron fixture now assigns one main-process sequence counter to the actual renderer-completion IPC receipt, every native visibility transition and each polling sample. It requires hidden native samples before completion, hidden views at the completion receipt, and no visible transition or sample before that receipt. Post-completion visibility is checked separately. Timestamps remain diagnostic and no tolerance padding or product timing change was added. The renderer's existing finish path deletes its active marker before sending completion; its actual typing/flight/landing/release assertions remain intact.

A controlled negative fixture observes typing, reveals a fictional native view and hides it again in the same main-process turn between polling samples. The ordered checker must reject that transition, so coverage includes a violation the old interval sampler could miss. The normal run and the existing lost-completion four-second fail-open case retain their separate checks.

- `node --test test/startup-native-visibility.test.mjs test/startup-motion-analysis.test.mjs test/launch-animation.test.mjs`: 11 passed, zero failed/skipped. Coverage includes the same-millisecond ambiguity, early sample/transition/completion visibility rejection and missing evidence.
- `npm run test:startup-animation`: 26 checks passed across browser and production Electron, zero renderer errors. Report: `artifacts/startup-animation/source-DGVOco/report.json`. Normal launch records 72 hidden samples and 19 transitions before completion sequence 92, with 13 visible samples afterward. The negative control's visible transition is sequence 18 before completion 88 and is rejected.

This is a fixture-only correction on base 5e0f201; no product/gate/profile or final reviewed feature changes, build, broad tests, provider calls, push or installation were performed. Exact CI event ordering in the old artifact remains unknown; fresh exact-head CI is still required.
