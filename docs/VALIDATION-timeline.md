# MuseBench validation

26 October 2026, Windows x64. Local packaged application; no publication or deployment.

## Current result

Muse Code, Muse AI bot chats and regular Meta AI Chat have a prompt timeline with hover/focus previews, click/Enter jumps, active markers, keyboard navigation and streaming updates. Unsent drafts remain intact. The rail appears after two rendered prompts; unloaded/virtualized website history is not invented or fetched separately.

The observed Meta AI login redirect to auth.meta.ai is now supported. Muse and Meta AI reuse the existing Muse browser session, with separate pages and origin storage. No cookies were inspected/copied and the previous Chat partition remains on disk. Shared account authentication invalidates stale account metadata. Meta's System appearance follows MuseBench; CLI sign-in remains separate.

Passed **303 unit tests**, build/Windows packaging, **84 packaged UI checks**, and **5 read-only saved-profile checks**. All **30 packaged source/build files and both native helpers** match validated source. Both live website logins remain available after restart; Meta renders dark, and browser sandboxes, context isolation and web security remain enabled.

## Evidence

- [Unit suite](../artifacts/timeline-unit-tests.tap), [package build](../artifacts/timeline-package.log).
- [Timeline UI](../artifacts/timeline/packaged-GPzlha/report.json): 9 checks across all three chat surfaces, including exact targets, preview/no-scroll, drafts, repeated prompts, keyboard, narrow/theme layouts, streaming/long history, conversation replacement and teardown.
- [Composer regression](../artifacts/composer/packaged-6G60ch/report.json): 7 checks, including native local dictation with synthetic audio.
- [Project overview](../artifacts/project-overview/packaged-B37SqN/report.json): 9 checks; [coding navigation](../artifacts/redesign-ui/packaged-B3BaT1/report.json): 16; [sample workflow](../artifacts/packaged-ui-results.json): 11.
- [Personal workspace](../artifacts/personal-ui/packaged-Av2HnL/report.json): 25 checks; [native chat presentation](../artifacts/native-chat/packaged-jiyg4L/report.json): 7.
- [Saved profile](../artifacts/timeline-saved-session.json): 5 checks, no private transcript or credential logging. Both website accounts remain signed in. The inspected live conversations are short/empty, so rail interaction proof uses fictional offline conversations; this distinction is recorded in the report.
- [Package bytes](../artifacts/personal-package-verification.json), [execution boundaries](../artifacts/timeline-boundaries.json), [normal launch](../artifacts/timeline-normal-launch.json).
- [Visual QA](../design-qa.md), [self-review](timeline-review.md), [spec](superpowers/specs/2026-10-26-prompt-timeline.md), [plan](superpowers/plans/2026-10-26-prompt-timeline.md).

The initial timeline check [failed against the previous interface](../artifacts/timeline/source-5tS9Qa/report.json). Shared-login/auth-host tests also reproduced three failures before the changes and now pass. Meta's message hooks were confirmed from its public client code; no private endpoint, framework state or account storage was inspected. Live login was completed by the user on Meta's official pages.

No new model request was needed for this navigation/account-session change. Runtime, approval and native process/speech helpers are unchanged from the previously validated composer release; its live sandboxed edit/test evidence remains in [VALIDATION-composer.md](VALIDATION-composer.md). The previous app archive is at `artifacts/timeline-baseline/app.asar`, with prior validation in `artifacts/validation.composer.json` and package proof in `artifacts/composer-package-verification.json`.
