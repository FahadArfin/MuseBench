# MuseBench validation

25 October 2026, Windows x64 (reports use UTC). Local Windows build; no publication or deployment.

## Current result

Native Muse navigation is implemented: searchable, collapsible Muse chats, Ideas, and Goals lists, opaque item selection, New Muse chat, selected titles, and retained conversation drafts. The final build passed **283/283 unit tests**, TypeScript/Vite build, Windows packaging, **12/12 native sidebar checks**, **25/25 personal workspace checks**, **16/16 coding checks**, and **13 real signed-in checks** in the packaged app. All 23 packaged source/build files and the native helper match the validated files. Independent review found no remaining blockers.

The saved account exposed **1 main conversation, 24 ideas, and 0 goals**. Live checks opened and reopened a real idea preview, returned to the main conversation, opened an unsent new-chat page, checked the empty Goals state, and verified account navigation and browser isolation. No messages or model requests were sent, and no account permissions were changed.

## Evidence

- [Full unit suite](../artifacts/native-sidebar-unit-tests.tap): 283 passed, 0 failed/skipped.
- [Build and package](../artifacts/native-sidebar-package.log): TypeScript, Vite and Electron builder passed.
- [Packaged native sidebar](../artifacts/native-sidebar/packaged-0si11P/report.json): 12 checks; filtering, groups, safe targets, chat A/B draft preservation, new draft reuse, idea reopening, refresh, remote Ctrl+K/N, narrow layout, authentication clearing and native close.
- [Source native sidebar](../artifacts/native-sidebar/source-GQ1FHq/report.json): 12 checks passed.
- [Packaged personal workspace](../artifacts/personal-ui/packaged-0B6oMS/report.json): 25 checks; official-host fixtures, separate sessions, overlays, account/settings navigation, popup opener behavior, drafts, resize/zoom, restart and native close. No main-process or renderer errors; exit code 0.
- [Source personal workspace](../artifacts/personal-ui/source-EcMnlc/report.json): 25 checks, including delayed Settings-tab hydration.
- [Packaged coding regression](../artifacts/redesign-ui/packaged-J7Dfve/report.json): 16 checks, including history, plan gates, drafts, review, settings and persistence.
- [Real packaged native collections](../artifacts/native-sidebar-saved-session/packaged/report.json): 8 checks; only counts/booleans recorded, no private titles or messages.
- [Real packaged account/layout checks](../artifacts/personal-saved-session/report.json): 5 checks, including the official Messaging channels shortcut without WhatsApp pairing.
- [Earlier real source collections](../artifacts/native-sidebar-saved-session/source/report.json): 8 checks before final authentication-race hardening.
- [Package byte verification](../artifacts/personal-package-verification.json): 23 files and native helper match.
- [Review](native-sidebar-review.md) and [integration boundaries](PERSONAL-MUSE.md).
- [Normal profile launch](../artifacts/native-sidebar-normal-launch.json): rebuilt app reopened; existing login retained.

## Findings resolved during validation

Real thread pages lack the root Side chats navigation. Chat selection now uses validated catalog links in separately retained views while keeping the root collection document available. Switching A/B/main preserves drafts; New Muse chat reuses an unsent draft.

Known closed idea previews clear selection and the same row can reopen them. Ctrl+K/N is forwarded from remote composers. Authentication in both owned popups and retained pages clears old IDs, suspends reads, disposes old-account extra views, and reloads stale collections. Delayed navigation commits cannot adopt a newer account generation. These races have focused regressions.

A cold live account shortcut opened Settings before its tab handlers were ready. A delayed/replaced-tab fixture reproduced the failure in [the old package](../artifacts/personal-ui/packaged-K9tGTf/report.json). The fixed adapter retries only idempotent tab navigation and waits for an active marker. Final source, package, and live checks pass. [Initial live evidence](../artifacts/personal-saved-session/native-sidebar-initial.json) is retained.

An initial full-suite run had a Windows EBUSY error removing a temporary timeout-test folder after its assertions passed. [That log](../artifacts/native-sidebar-unit-tests-initial.tap) is retained. Subsequent standalone full runs passed all 283 tests; no unrelated controller behavior was changed.

## Proof boundaries and recovery

Navigation and sidebar rows are native React/Electron UI. Composition, idea previews, goal actions, authentication and approvals remain Meta's official client. No documented public consumer listing API was found in the consulted official sources. The adapter reads bounded rendered titles/links only; up to 100 items per group, not an exhaustive account export. Metadata stays in memory. Private APIs, hidden framework state, cookies and tokens are not used.

The current account has no saved side chats or goals, so populated multi-chat/goal cases have fixture coverage rather than live-account proof. Fresh OAuth grants and WhatsApp pairing were not performed. Original website navigation remains recoverable if site controls change.

Muse Code and its native CLI sandbox remain unchanged. Prior real shell/model workflow evidence is preserved in [VALIDATION-redesign.md](VALIDATION-redesign.md) and [its record](../artifacts/validation.redesign.json). This update made zero CLI/model calls. The prior UI validation is preserved in [VALIDATION-seamless.md](VALIDATION-seamless.md) and `artifacts/validation.seamless.json`. The pre-update archive is `artifacts/native-sidebar-baseline/app.asar`; older recovery archives remain. User projects, chats and credentials were preserved.
