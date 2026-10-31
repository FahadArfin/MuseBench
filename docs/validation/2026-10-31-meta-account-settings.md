# Meta AI settings and account windows

## Change

Accounts and connections now offers separate **Meta AI settings & plan** and **Meta AI apps** shortcuts. Muse account, Muse connections and WhatsApp remain separate. Meta AI upgrades are explicitly distinguished from Muse Code billing. Preview and desktop share the same controls; preview explains when the real desktop account session is required.

The old popup policy rejected Accounts Center and initial `about:blank` windows. Account popups now retain Electron's real opener, POST flow and existing personal session, with no renderer Node access or preload. Accounts Center is admitted only in the owned account flow; it is not added to ordinary chat navigation. Initial blank windows must originate from an approved official page. After an official HTTPS commit, a return to blank is rejected. Nested windows and unapproved destinations remain blocked.

The settings shortcut operates visible official Meta AI controls, bounded to General or Apps. It cannot choose Upgrade, Connect, consent, or purchase. It cancels when superseded or when the user navigates away, including delayed queued scripts. If the official controls change, MuseBench restores the original navigation.

Blocked account steps now have an actionable notice. The browser action opens the fixed root of the originating service, even after switching between Muse and Meta AI. No remote URL query or token is forwarded. Refresh is offered only while viewing the matching service.

## Evidence

- Full unit suite: 2,132 tests, 2,131 passed, one skipped, no failures (`artifacts/personal-accounts-unit.txt`).
- Final focused settings, policy, browser-controller and CI tests: 109 passed (`artifacts/personal-accounts-final-focused.txt`).
- Build passed (`artifacts/personal-accounts-build.txt`).
- Shared account UI passed browser and Electron fixtures, including narrow layout and fallback source after navigation (`artifacts/meta-settings/preview-9hMzrp/report.json`, `artifacts/meta-settings/desktop-eQL5HE/report.json`). Both variants are included in the Windows navigation CI suite; only clean fixture reports are uploaded.
- Full personal Electron fixture passed (`artifacts/personal-accounts-electron-final.txt`; `artifacts/personal-ui/source-L4atZz/report.json`). This covers real reserved-window/opener behavior, sandbox/session isolation, blocked Google navigation, retained views, provider-session persistence after restart, and clean shutdown after closing an account window. No model requests were made.
- Independent review found and then verified fixes for stale settings navigation and wrong-service browser fallback. Reviewer independently passed 103 relevant tests.

An initial full smoke run exposed an outdated test assumption: the test expected the app to quit with an authentication window open. Existing lifecycle guards intentionally preserve that flow. The fixture now proves the close is blocked, closes its own account window, then proves clean exit. Failure cleanup is bounded to the test-owned process. Production close guards were not weakened.

## Provider and installed boundaries

The installed 0.2.289 Meta AI page was inspected read-only: its signed-in Settings menu exposes General and Apps, with an official `https://accountscenter.meta.com/` link. No Upgrade, Connect, OAuth consent or payment was submitted. The actual upgrade checkout target and completed app authorization are not verified by fixtures.

Google requires OAuth sign-in outside embedded developer-controlled browsers. MuseBench does not spoof a browser or bypass that restriction. The user may need the official browser step and then return to refresh; this change does not promise that every provider completes inside an embedded window.

App control is visibly enabled in the installed app, but the native connection remains unavailable. Therefore no safe native idle preflight or installed verification of this candidate has been established. The running installed app and its profile must remain untouched until restart safety can be verified. A source/CI result is not installed or provider acceptance.

## Sources

- [Electron window.open](https://www.electronjs.org/docs/latest/api/window-open): opener behavior and inherited preferences for blank windows.
- [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies): embedded user-agent restrictions.

## Release validation follow-up

Release run 41209761480 passed packaging and five validation groups, including the new navigation tests, but the chats group stopped at the existing saved-prompts target-size assertion. Its desktop fixture sampled the opening dialog before the entrance animation completed. Local diagnostic sampling reproduced a nominal 40px button as 39.99998474121094px during a fractional vertical translation, with width 88px and gap 12px (`artifacts/prompt-shelf/desktop-2ZLnwo/report.json`).

The smoke test now waits for the real finite modal and scrim entrance animations, with a three-second failure deadline. It records initial and settled measurements, requires no active entrance animations and fully opaque/untransformed content, and retains the original 40px height, 88px width and 8px minimum gap assertions. Production motion and button styling are unchanged. Corrected preview and desktop suites passed (`artifacts/prompt-shelf/preview-TZcLQX/report.json`, `artifacts/prompt-shelf/desktop-dRxUwh/report.json`). The failed release was not published or installed.
