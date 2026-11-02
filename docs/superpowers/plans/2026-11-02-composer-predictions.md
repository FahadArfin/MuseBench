# Composer Predictions Implementation Plan

**Goal:** Offer a faint, editable follow-up prediction in Muse Code's existing composer. Tab accepts; accepting never submits. Enter uses existing send/queue behavior.

**Architecture:** Shared renderer ghost overlay and request hook; bounded conversation-only prediction helpers; optional host-owned, separate native Muse generation with an empty toolset. No new API provider. Local suggestions work without model usage. Background Muse use is off until explicitly enabled in settings or authorized by the user. All work remains in this local batch.

**Design:** Generate once after a completed assistant reply, not on every keystroke. Reuse the proposal while the typed prefix matches, preserving the exact typed text. Hide on conflicting edits, selection/caret movement, IME, dictation, commands, running work, pending questions, images/annotations, navigation and blur. Escape dismisses for this reply. Shift+Tab remains focus navigation. Never persist ghost text as a draft or implicitly accept it on Enter. Settings → General → Composer has Show predictions and Predict with Muse (normal Muse usage).

**Tradeoff:** Pure local suggestions are immediate and private but less capable; a separate Muse call can produce better conversation-specific follow-ups and consumes normal Muse usage. The proprietary Codex prediction service is unavailable here. Muse mode uses only current-chat text, has no workspace/shell/web/desktop tools, is canceled on owner changes or new foreground work, and must not affect the main chat transcript or status. Failed predictions remain quiet; the composer always works without them.

## Tasks

- [x] Tests and shared helpers: bounded current-chat context, local candidates, strict generated-text parsing, prefix acceptance, stale replies.
- [x] Host and optional native generation: separate prediction-only exec mode with empty toolset, scoped request/cancel IPC, latest reply ownership, timeout/dedup/cache, shutdown and update cleanup.
- [x] Shared UI and preferences: ghost overlay with matching textarea typography/wrapping/scroll, Tab/Escape/IME/focus/caret behavior, accessible hint, explicit Muse opt-in.
- [x] Verify meaningful keyboard flows, queue/commands/voice boundaries, light/dark/narrow layouts, preference persistence, native argument contract, build/typecheck and focused review.

**Review focus:** Ghost text never submits/persists without acceptance; requests cannot outlive owner or setting changes; replies cannot overwrite typing; Tab still navigates normally without a valid prediction; native prediction generation cannot execute tools.

## Evidence

- Official Composer Predictions reference fetched and reviewed. It offers a conversation-based follow-up after a reply, accepts with Tab without sending, and has a Show predictions setting. MuseBench implements that interaction independently.
- Optional background-usage question received no answer during implementation. Local suggestions remain enabled; normal-usage Muse inference requires the explicit Predict with Muse preference. No paid provider request was made.
- `npm.cmd run build`: passed, including TypeScript, current renderer and native bundle. Existing Vite large-chunk notice unchanged.
- Targeted prediction, preference/search, exec/planning policy and CI contract tests passed. Native CLI 1.4.14 accepted the empty-toolset configuration with provider `echo`; no model credits used. This verifies configuration/protocol acceptance, not generated prediction quality.
- Six focused keyboard/visual flows passed: ghost versus actual draft, Tab/Enter, prefix/caret/selection, Escape/focus, running work/IME/off switch, stale async replies across chats, wrapped light/dark 390px rendering. Receipt: `artifacts/composer-predictions/fixture-mPh9AU/report.json`.
- Real isolated source-app settings/IPC and restart persistence passed: `artifacts/settings-ui/source-Wjz3dv/report.json`.
- Existing Electron queue flow passed all seven checks: `artifacts/queue-composer/desktop-WHPKes/report.json`.
- Independent review found completion eligibility, per-reply attempt identity, and queued-prompt eligibility issues. Shared gates and regression tests fixed all three; reviewer confirmed fixes and cancellation/cleanup ownership.
- Batch remains local. No installed app/profile modification, install, restart or publication.

## Release follow-up

CI diagnostics exposed a deferred caret race after Tab acceptance: the animation-frame callback could reset a newer Select All to the end and prevent Delete from clearing the draft. A controlled held-frame regression reproduced the failure. Caret placement now runs in the matching React layout commit, with owner/text/focus checks; it cannot run after the next user selection. Normal and sixfold CPU-throttled keyboard flows pass, including the regression. The fixture records mount/focus/draft diagnostics on failure.
