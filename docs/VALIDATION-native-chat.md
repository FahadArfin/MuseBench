# MuseBench validation

25 October 2026, Windows x64 (reports use UTC). Local packaged Windows application; no publication or deployment.

## Current result

Muse's actual messages and composer now match the native MuseBench shell. The official transcript receives plain assistant prose, rounded user messages, readable rich text/code, and a larger two-row composer. Existing theme, transcript size, response font and reduced-motion preferences carry across. The original message elements and input handlers remain in place.

Validation passed **288/288 unit tests**, TypeScript/Vite build, Windows packaging, **60 packaged UI checks** (7 chat, 12 sidebar, 25 personal workspace, 16 coding), and **17 signed-in checks** (4 chat, 8 collections, 5 account/layout). All 24 packaged source/build files and the native helper match the validated source. A final composer-control background refinement was followed by 5 focused tests, a rebuild, all 60 packaged checks, and the live chat checks.

The saved Muse login loaded successfully. In an initially empty official composer, the check typed a temporary draft without sending, switched to the original layout and back, verified the same document and draft, then cleared only that temporary draft. The main transcript reserves the real status-panel width; its controls remain inside the composer. Sandbox, context isolation and web security are enabled, with no Node integration, preload or workspace bridge on the remote page.

## Evidence

- [Unit suite](../artifacts/native-chat-unit-tests.tap): 288 passed, no failures/skips.
- [Final focused presentation tests](../artifacts/native-chat-final-style-tests.tap): 5 passed.
- [Build and package](../artifacts/native-chat-package.log): TypeScript, Vite and Electron builder passed.
- [Final packaged conversation](../artifacts/native-chat/packaged-yPnGO5/report.json): 7 checks covering both themes, contrast, rich content, narrow layout, retained drafts, contenteditable hydration, original restoration, authentication guards and isolation.
- [Final source conversation](../artifacts/native-chat/source-lZZ5Be/report.json): 7 checks passed.
- [Fictional combined-window preview](../artifacts/native-chat/packaged-yPnGO5/screenshots/02-fixture-dark-rich-chat-window.png), [light theme](../artifacts/native-chat/packaged-yPnGO5/screenshots/04-fixture-light-large-monospace.png), and [narrow composer](../artifacts/native-chat/packaged-yPnGO5/screenshots/05-fixture-narrow-chat-composer.png). These contain fictional content, not the user's account.
- [Packaged sidebar](../artifacts/native-sidebar/packaged-hMFYRM/report.json): 12 checks.
- [Packaged personal workspace](../artifacts/personal-ui/packaged-5CMH86/report.json): 25 checks, including retained sessions, account navigation, auth popups, overlays, restart and clean close.
- [Packaged coding regression](../artifacts/redesign-ui/packaged-RYcX2E/report.json): 16 checks; history, plan/review gates, drafts, settings and persistence remain intact.
- [Real packaged conversation](../artifacts/native-chat-saved-session/packaged/report.json): 4 checks plus temporary-draft cleanup; only geometry and non-sensitive status recorded.
- [Real source conversation](../artifacts/native-chat-saved-session/source/report.json): 4 checks plus temporary-draft cleanup.
- [Real packaged collections](../artifacts/native-sidebar-saved-session/packaged/report.json): 8 checks, real idea previews and unsent new-chat navigation.
- [Real packaged account/layout](../artifacts/personal-saved-session/report.json): 5 checks, including opening Messaging channels without pairing.
- [Package byte verification](../artifacts/personal-package-verification.json): 24 files and native helper match.
- [Independent review](native-chat-review.md), [integration boundaries](PERSONAL-MUSE.md), and [normal profile launch](../artifacts/native-chat-normal-launch.json).

## Findings resolved

The previous package fails the new native-chat style regression: [RED evidence](../artifacts/native-chat/packaged-Z2r2Uc/report.json). The new presentation passes in source and package. Finite appearance maps reject CSS input; a regression also covers inherited object keys. Rapid dark/light/original changes serialize stylesheet removal and insertion without losing original-mode restoration.

Early fictional captures incorrectly centered the transcript across the status panel. Live numeric geometry showed that Muse already reserves a separate 360px panel. The fixture now mirrors that layout and asserts separation and alignment. Explicit paired status-button colors and transparent auxiliary composer buttons prevent inherited text colors from becoming unreadable over fixed site backgrounds. Final dark/light contrast checks exceed 4.5:1.

## Proof boundaries and recovery

The sidebar is native React/Electron UI; the conversation is a removable visual integration over Meta's official client. Sending, attachments, streaming, approvals and authentication remain official controls. This update does not replace the hosted client or rely on a private consumer API. Appearance restoration retains the document, including its draft. Website hooks may change; the header toggle restores the original layout.

No real messages, uploads, approvals, CLI/model requests, fresh OAuth grants or WhatsApp pairing were performed. Real login and unsent input were checked; sending/streaming behavior was not newly exercised against the service. Fictional fixtures verify retained message nodes and streaming/disabled state rather than model output. The account still exposes its main conversation, 24 ideas and no saved side chats/goals, so populated multiple-chat/goal behavior has fixture coverage.

The native CLI execution/sandbox implementation is unchanged. Prior real shell/model evidence remains in [VALIDATION-redesign.md](VALIDATION-redesign.md) and [its record](../artifacts/validation.redesign.json). Previous sidebar validation is preserved in [VALIDATION-native-sidebar.md](VALIDATION-native-sidebar.md) and [its record](../artifacts/validation.native-sidebar.json). The pre-update package is recoverable at `artifacts/native-chat-baseline/app.asar`; older archives remain. Projects, chats and authentication data were preserved.

