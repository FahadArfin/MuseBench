# MuseBench validation

25 October 2026, Windows x64 (reports use UTC). Local build only; no publication or deployment.

## Current result

The seamless Meta AI update and startup repair passed **249/249 unit tests**, TypeScript/Vite build, Windows packaging, **25/25 source and packaged personal-workspace checks**, **16/16 packaged coding-workspace checks**, and **5/5 real signed-in checks in the final packaged app**. The saved Muse session remained signed in. Independent final review found no blockers.

The latest reported `ERR_FAILED (-2)` dialog was reproduced when a test closed Electron during its initial local document load. Startup now suppresses that canceled load during teardown while still showing genuine startup failures. Both cases passed a real Electron lifecycle probe. The earlier `Object has been destroyed` protection remains covered by native window-close tests with retained views and an owned account popup.

The account shortcut initially failed on the live site despite passing synchronous fixtures: Muse's server-rendered Settings button can appear before its handlers are ready. The final adapter re-queries the current button and uses bounded, idempotent menu-opening attempts. The fixture now replaces an inert trigger after document completion; the live packaged shortcut opens the selected Messaging channels tab.

## Evidence

- [Unit tests](../artifacts/seamless-unit-tests.tap): 249 passed, 0 failed/skipped.
- [Build and packaging](../artifacts/seamless-package.log): TypeScript, Vite, Electron builder completed.
- [Final packaged personal workflow](../artifacts/personal-ui/packaged-y8U1Bv/report.json): 25 passed; drafts, four retained sections, route synchronization, overlays, layout restoration, late hydration, account shortcuts, popup opener/session behavior, origin restrictions, resize/zoom, restart, and native close. No renderer/main-process errors; exit code 0.
- [Source personal workflow](../artifacts/personal-ui/source-4RR0EA/report.json): the same 25 checks passed.
- [Packaged coding regression](../artifacts/redesign-ui/packaged-ncBtbx/report.json): 16 passed, including projects/chats, review, previews, checks, history, and restart.
- [Real signed-in packaged check](../artifacts/personal-saved-session/report.json): 5 passed: existing login, integrated layout, original-layout restoration, native WhatsApp shortcut opening official Messaging channels, and no remote Node/workspace bridge.
- [Real signed-in source check](../artifacts/personal-saved-session/source-report.json): the same 5 checks passed.
- [Live navigation diagnostics](../artifacts/personal-menu-probe/report.json): observed idempotent Settings menu opening plus real Search Muse dialog, Feed route, and Library route. No message content or credentials recorded.
- [Startup lifecycle probe](../artifacts/startup/source-WaUe3B/report.json): quit during load exits without a dialog; genuine local load failure produces the expected error. Four unit cases also cover the startup handler.
- [Package/source verification](../artifacts/seamless-package-verification.json): 21 packaged source/build files and native helper match the validated bytes.
- [Accounts panel capture](../artifacts/personal-saved-session/accounts.png): local account UI with the remote page hidden.
- [Integration design and research](PERSONAL-MUSE.md).

## Proof boundaries

The signed-in test used the existing profile in place. It did not read or copy cookies/tokens, submit chat messages, change account permissions, pair WhatsApp, or make model requests. A fresh Facebook OAuth grant and WhatsApp pairing were not automated. Authentication popup behavior was tested using isolated official-host fixtures; live access was verified through the existing Muse login.

This is an integrated official web client. The consulted documentation did not provide a public consumer API for replacing Muse's complete Chat/Ideas/Goals application with native data views. Fixed navigation hooks can change; failure restores the full official layout. Account and phone pairing remain on Meta's official UI.

## Prior coding proof and recovery

The prior real Muse CLI sandboxed shell workflow, preview, revision checks, and checkpoint evidence remain in [the redesign validation](VALIDATION-redesign.md) and [its machine-readable record](../artifacts/validation.redesign.json). This update sent no CLI/model request and did not disable or alter the official CLI sandbox.

The previous personal integration record is preserved in [VALIDATION-personal-initial.md](VALIDATION-personal-initial.md) and `artifacts/validation.personal-initial.json`. The pre-update packaged archive is retained at `artifacts/seamless-baseline/app.asar`; the older `artifacts/personal-baseline/app.asar` remains available. No user projects, chats, or credentials were removed.
