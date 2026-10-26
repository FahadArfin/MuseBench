# MuseBench validation — 2026-10-26

## Muse Code slash menu

The final Windows package includes the reference-style slash picker, real Muse reasoning/access settings, optional planning, saved goals and memory instructions, installed skills, chat/history tools, copy/export, appearance, dictation and connection/status commands. Provider-specific capabilities have explicit Info entries. See [SLASH-COMMANDS.md](SLASH-COMMANDS.md) for coverage and differences.

- **316 unit tests passed**, no failures or skips (`artifacts/slash-unit-tests.tap`).
- **52 checks passed against the final desktop package**: slash commands 15, composer 7, direct chat 5, projects 9, navigation/history 16. Exact reports are in `artifacts/validation.json`. The source slash suite also passed 14 checks.
- **One real Muse request** in the final package returned both the saved memory marker and active goal marker. It completed without plan approval, verified the native sandbox under Ask me, confirmed process cleanup, and left project files unchanged. An earlier build also passed the same live request: two model requests total this turn. These were conversation/instruction tests, not new shell or file-edit tests.
- **32 packaged source/build files and both native helpers match** the validated source (`artifacts/personal-package-verification.json`).
- **15 runtime, personal-session/presentation, run-option policy and dictation modules are byte-identical** to the prior package (`artifacts/slash-boundaries.json`). Browser login storage was not modified. Electron sandbox, context isolation, web security and disabled Node integration passed checks.
- Actual installed Muse skill discovery succeeded. The separate usage endpoint rejected its credential lookup; the UI handles that failure and links to official billing. The real model request succeeded with the existing login. Skill insertion was checked; arbitrary skill execution and external MCP/plugin integration were not introduced or claimed.
- Composer regression checks include synthetic-audio transcription through Windows speech recognition. Physical microphone capture was not tested this turn.
- Dark/light, desktop/narrow, the reasoning submenu and actual Skills group were visually compared with the supplied references. Evidence and limitations are recorded in `design-qa.md`.

The normal visible app launch uses the existing user profile; its evidence is saved in `artifacts/slash-normal-launch.json`. Recovery archive: `artifacts/slash-baseline/app.asar`. Prior validation: [direct chat](VALIDATION-direct-chat.md).

## Corrections made during implementation

Tests first reproduced missing command parsing, command-info service and persistent controller actions. UI checks covered direct argument handling, preceding draft preservation, unknown-command interception, installed skill insertion, file-picker export and restart persistence. Direct goal pause/resume, explicit Fast on/off, and `/plan <request>` behavior were tightened before packaging.

The final review found three edge cases: multiline commands bypassing local dispatch, typed arguments overriding a submenu selection, and new-chat commands using hidden previous history. All three were corrected, regression-tested and independently re-reviewed before the final package. See [slash-review.md](slash-review.md). No runtime sandbox flags or personal browser origin rules were changed.
