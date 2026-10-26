# MuseBench validation

25 October 2026, Windows x64 (timestamps in reports use UTC). Local Windows application; no publication or deployment.

## Current result

Muse Code projects now open an overview with saved conversations and a New chat action. The sidebar also provides a New chat shortcut beside each project. The first submitted request creates a separate persisted child conversation; opening a blank composer does not create an empty record. Chats use the full workspace by default, with Review available on demand through its toolbar button and plan/review links.

Passed **288 unit tests**, TypeScript/Vite build and Windows packaging, **61 packaged UI checks**, and **3 read-only saved-profile checks**. All 26 packaged source/build files and the native helper match the validated source. MuseBench was reopened with the existing normal profile.

## Evidence

- [Unit suite](../artifacts/project-overview-unit-tests.tap): 288 passed; no failures or skips.
- [Build and Windows package](../artifacts/project-overview-package.log).
- [Project overview regression](../artifacts/project-overview/packaged-LJqRTG/report.json): 9 checks covering actual task IDs/project association, overview and nested chat navigation, new-chat creation, isolated histories, drafts, approval gates, native menu opening, narrow layout and restart.
- [Dark overview](../artifacts/project-overview/packaged-LJqRTG/01-overview-dark.png), [light overview](../artifacts/project-overview/packaged-LJqRTG/02-overview-light.png), [narrow overview](../artifacts/project-overview/packaged-LJqRTG/03-overview-narrow.png), and [full-width conversation](../artifacts/project-overview/packaged-LJqRTG/05-conversation.png). All screenshot content is fictional.
- [Coding navigation regression](../artifacts/redesign-ui/packaged-ODwcWQ/report.json): 16 checks, including saved chats, composer/project drafts, Customize plan drafts, keyboard shortcuts, preferences, runtime controls and restart.
- [Complete sample workflow](../artifacts/packaged-ui-results.json): 11 checks, including real local file edits, working preview, project test execution, checkpoint storage and invalidation after an external edit.
- [Personal workspace regression](../artifacts/personal-ui/packaged-z2YyLV/report.json): 25 checks covering product switching, drafts, account/browser isolation, official auth popups, navigation, persistence and shutdown.
- [Saved profile](../artifacts/project-overview-saved-session.json): 3 checks; existing project history matches its overview, saved Muse login loads account collections, returning from Meta AI retains the overview, and browser sandbox/context isolation/web security remain enabled.
- [Package byte verification](../artifacts/personal-package-verification.json), [unchanged execution/auth boundaries](../artifacts/project-overview-boundaries.json), and [normal-profile relaunch](../artifacts/project-overview-normal-launch.json).
- [Design](superpowers/specs/2026-10-25-project-overview-design.md), [implementation plan](superpowers/plans/2026-10-25-project-overview.md), and [self-review](project-overview-review.md).

## Scope and recovery

The initial new regression [failed against the previous interface](../artifacts/project-overview/source-5xJ2Tu/report.json) because it had no project overview. The new source and packaged app pass. Existing UI tests now explicitly open Review before interacting with it; approval, revision checks and checkpoint requirements remain intact.

No real messages, new account content, model calls, authentication grants, WhatsApp pairing, or CLI execution were performed for this UI change. The normal profile and credentials were preserved; private account/project content is absent from screenshots and logs. The login probe only records booleans and fixed check descriptions.

All 17 Electron/controller/runtime files and the native helper are byte-identical to the previous release. No shell, sandbox, IPC, credential or persistence format changed. Prior native collections/chat presentation checks and live sandboxed CLI evidence remain in [the previous validation](VALIDATION-native-collections.md) and [coding validation](VALIDATION-redesign.md). Those earlier live CLI checks were not rerun for this navigation change.

The previous packaged application archive is recoverable at `artifacts/project-overview-baseline/app.asar`; prior validation is preserved in `artifacts/validation.native-collections.json`.
