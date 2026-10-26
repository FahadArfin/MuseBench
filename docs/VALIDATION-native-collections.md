# MuseBench validation

25 October 2026, Windows x64 (reports use UTC). Local packaged application; no publication or deployment.

## Current result

Ideas and Goals now share MuseBench's native appearance: grouped idea cards, matching previews, goal categories/cards, and setup dialogs. Theme, response font, text size and reduced motion use the same finite appearance settings as chat. The official live pages and original handlers remain the source of account content and behavior; no second collection store or private service API was introduced.

Passed **288/288 unit tests**, TypeScript/Vite build and Windows packaging, **68 packaged UI checks** (8 collections, 7 chat, 12 sidebar, 25 personal, 16 coding), and **10 signed-in checks** (6 collections, 4 chat). All 26 packaged source/build files and the native helper match the validated source.

The saved account exposes 24 ideas and no saved goals. Live verification loaded the idea list, opened a real preview from the native sidebar, refreshed metadata, restored original styling and returned to native styling while retaining document identity/selection. Goals category setup remained open when switching away and back, then closed without submission. Browser sandbox, context isolation and web security remain enabled with no Node integration, preload or workspace bridge. The chat regression also typed and cleared an unsent temporary draft in an initially empty composer.

## Evidence

- [Full unit suite](../artifacts/native-collections-unit-tests.tap): 288 passed, 0 failed/skipped.
- [Build/package log](../artifacts/native-collections-package.log): TypeScript, Vite and Electron builder passed.
- [Source collections](../artifacts/native-collections/source-RpfTjf/report.json): 8 checks.
- [Packaged collections](../artifacts/native-collections/packaged-SKtlig/report.json): 8 checks; themes, cards/dialogs, font/motion, retained state, dynamic account-content updates, narrow layout, controls, origin guards and isolation.
- [Ideas preview using fictional data](../artifacts/native-collections/packaged-SKtlig/1-ideas-dark.png), [light Goals](../artifacts/native-collections/packaged-SKtlig/5-goals-light.png), and [narrow goal setup](../artifacts/native-collections/packaged-SKtlig/8-goal-setup-narrow.png). Private account content is not captured.
- [Packaged chat](../artifacts/native-chat/packaged-IaRg0B/report.json): 7 checks.
- [Packaged sidebar](../artifacts/native-sidebar/packaged-Ctr00k/report.json): 12 checks.
- [Packaged personal workspace](../artifacts/personal-ui/packaged-ju3FYO/report.json): 25 checks including separate sessions, auth popups, account navigation, overlays, retained drafts, restart and clean shutdown.
- [Packaged coding regression](../artifacts/redesign-ui/packaged-Hkp5To/report.json): 16 checks; existing coding workflow and review gates remain intact.
- [Real source collections](../artifacts/native-collections-saved-session/source/report.json): 6 checks.
- [Real packaged collections](../artifacts/native-collections-saved-session/packaged/report.json): 6 checks; counts/geometry/booleans only.
- [Real packaged chat](../artifacts/native-chat-saved-session/packaged/report.json): 4 checks and temporary-draft cleanup.
- [Package verification](../artifacts/personal-package-verification.json): 26 source/build files and native helper match.
- [Self-review](native-collections-review.md), [integration boundaries](PERSONAL-MUSE.md), and [normal-profile launch](../artifacts/native-collections-normal-launch.json).

## Regression and synchronization proof

The initial source fails the new presentation regression before the feature was added: [RED evidence](../artifacts/native-collections/source-7C0cN4/report.json). Final source and package pass.

The offline fixture changes an idea title, inserts a new idea and updates a populated goal's title/status after rendering. The styled official DOM and native sidebar reflect those updates through the existing refresh path. Original control counters remain at zero for creation, launch, deletion and approval throughout. The live account check confirms current account reads and refreshes; it does not claim a new cross-device write/sync experiment.

Collection styling is scoped to recognized Muse surfaces, with goal-card rules restricted to Goals. Appearance extraction preserves the existing finite-value/injection and original-layout serialization contracts. Unknown/authentication layouts retain their original presentation. Dark/light and narrow fictional captures were visually inspected.

## Limits and recovery

This is native visual presentation over the official Muse client. Login, collection loading, previews, goal creation, streaming and approval actions still belong to Muse. Website hooks may change; the header toggle restores original styling without reload. Populated goals have fixture coverage because the current account has no saved goals.

No real messages, idea launches, goal creation/deletion/completion, approvals, uploads, CLI/model calls, OAuth grants or WhatsApp pairing were performed. No private content, cookies or tokens were saved to reports. The normal profile, projects and credentials were preserved.

CLI sandbox/execution code is unchanged. Earlier real shell/model evidence remains in [VALIDATION-redesign.md](VALIDATION-redesign.md) and [its record](../artifacts/validation.redesign.json). Previous conversation validation is preserved in [VALIDATION-native-chat.md](VALIDATION-native-chat.md) and [its record](../artifacts/validation.native-chat.json). The pre-update package is recoverable at `artifacts/native-collections-baseline/app.asar`; older archives remain.

