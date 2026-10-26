# MuseBench validation

25 October 2026 local time, Windows x64. Report timestamps use UTC. Local Windows application; no publication or deployment.

## Current result

Muse Code now has the requested compact Codex-style composer: plus menu, approval selection, reasoning picker, local dictation and circular Send. Reasoning and approval settings persist per chat and reach the official native Muse CLI. High/Ask are the defaults; Ask, Auto-review and No prompts all retain the sandbox. Dictation appends editable text without sending or storing audio.

Passed **298 unit tests**, TypeScript/Vite build and Windows packaging, **68 packaged UI checks**, **9 real Muse workflow checks**, and **3 saved-profile checks**. All **28 packaged source/build files and both native helpers** match the validated source. Saved Muse login and browser isolation were verified. The updated normal application was reopened; launch evidence is linked below.

## Evidence

- [Unit suite](../artifacts/composer-unit-tests.tap): 298 passed; zero failures/skips.
- [Build and package](../artifacts/composer-package.log).
- [Composer](../artifacts/composer/packaged-1ZVxdK/report.json): seven checks for real menus, draft settings, native local recognition, error recovery, chat persistence, narrow/light/dark layout and restart. [Reasoning picker](../artifacts/composer/packaged-1ZVxdK/02-reasoning-menu.png), [approval menu](../artifacts/composer/packaged-1ZVxdK/01-approval-menu.png), [transcribed draft](../artifacts/composer/packaged-1ZVxdK/03-transcribed-draft.png), [narrow composer](../artifacts/composer/packaged-1ZVxdK/04-composer-narrow.png).
- [Project overview](../artifacts/project-overview/packaged-fGx3HC/report.json): nine checks.
- [Coding navigation](../artifacts/redesign-ui/packaged-mXjQhL/report.json): 16 checks.
- [Sample review workflow](../artifacts/packaged-ui-results.json): 11 checks.
- [Personal workspace](../artifacts/personal-ui/packaged-QTQoXU/report.json): 25 checks, including auth popup/session isolation, navigation, draft persistence and shutdown.
- [Real Muse workflow](../artifacts/live-workflow/2026-10-26T03-34-16-567Z/report.json): one model request with **xhigh + auto**, nine checks. Exact two-line edit, one sandboxed PowerShell test passing all three project tests, rendered command results, working preview, independent app Check, reviewed checkpoint, restart persistence and native process cleanup. No automatic retry.
- [Saved profile](../artifacts/composer-saved-session.json): existing history and Muse login preserved; signed-in chats/ideas/goals load; browser sandboxes remain enabled.
- [Package bytes](../artifacts/personal-package-verification.json), [normal-profile launch](../artifacts/composer-normal-launch.json), [self-review](composer-review.md), [design](superpowers/specs/2026-10-25-composer-design.md), [plan](superpowers/plans/2026-10-25-composer.md).

## Proof limits and recovery

The UI test initially [failed against the old composer](../artifacts/composer/source-HKj8lN/report.json). New runtime-argument tests and speech cancellation tests also reproduced failures before implementation/fixes. The final unit suite and packaged regressions pass.

Speech verification uses the actual Windows recognizer with synthesized audio; **the physical microphone and this user's voice have not been tested**. No microphone was captured during verification. Speech remains editable before sending. No new audio service or credential was introduced. Muse's own interactive voice feature is unavailable on Windows; the app uses the installed local System.Speech recognizer.

The real request verifies the selected Extra high/Auto-review path, native terminal/exit evidence and shell workflow. All three access mappings have unit coverage, and Ask/Auto-review/No-prompts arguments were checked against the installed CLI. No prompts was accepted by an inert echo probe; it was not separately exercised with another billed model request. Readiness and successful commands are not an exhaustive sandbox security audit. Prior confinement/process-lifetime evidence remains in [sandboxed commands](SANDBOXED-COMMANDS.md).

The normal profile and credentials were preserved. Saved-login verification is read-only and logs no private account content. The previous app archive is recoverable at `artifacts/composer-baseline/app.asar`; previous validation and package evidence are retained in [VALIDATION-project-overview.md](VALIDATION-project-overview.md), `artifacts/validation.project-overview.json`, and `artifacts/project-overview-package-verification.json`.
