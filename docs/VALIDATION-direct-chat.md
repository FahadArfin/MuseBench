# MuseBench validation — 2026-10-26

## Direct Muse chat

The final packaged application starts a Muse conversation from Send without local plan approval. Typing in the sample creates a separate Muse chat while retaining the tutorial. Optional Plan mode, checkpoint review, action approval choices and the sandbox remain available. A failed connection retains the draft without adding duplicate unsent messages.

- **306 unit tests passed**, no failures or skips (`artifacts/direct-chat-unit-tests.tap`).
- **52 desktop UI checks passed** against the final package: direct chat 4 live + 5 offline, composer 7, projects 9, navigation 16, tutorial workflow 11. Exact reports are in `artifacts/validation.json`.
- **Two real Muse replies** completed in the final package without approving a plan: first Send from the sample and a follow-up. Native sandbox readiness, Ask me, authoritative completion and confirmed process cleanup were verified; project files stayed unchanged. This was a conversation check, not a new live file-edit/shell test.
- The real Windows speech recognizer transcribed synthetic audio into the composer. Physical microphone input was not tested this turn.
- **30 packaged source/build files and both native helpers match** the source (`artifacts/personal-package-verification.json`).
- **17 runtime, action-policy, personal-session and dictation modules are byte-identical** to the prior package (`artifacts/direct-chat-boundaries.json`). No browser login storage was modified.
- Recovery archive: `artifacts/direct-chat-baseline/app.asar`. Prior timeline validation: `docs/VALIDATION-timeline.md`.

## Regression found and fixed

The original controller blocked both Chat and Plan sends before plan approval; four new tests reproduced this. UI verification also caught a task-switch effect clearing a failed first-send draft. The correction was rebuilt and the composer, direct chat and navigation checks rerun on the final package.

Normal visible launch evidence is saved in `artifacts/direct-chat-normal-launch.json`.
