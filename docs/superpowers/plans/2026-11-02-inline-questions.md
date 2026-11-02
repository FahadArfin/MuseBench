# Inline Muse Code questions implementation plan

**Goal:** Show Muse's structured clarification requests directly above the Code composer, matching the supplied compact question card: suggested choices and a custom answer, with Skip/Send.

**Architecture:** Reuse `userInput/requested`, `answerInput`, and the existing native identity/receipt validation. Keep model wording and option labels intact. This is UI for native interactive questions, not a heuristic that converts ordinary assistant prose into requests. Preserve the earlier uncommitted tray batch and leave transport, permissions, and the installed app unchanged.

**Design decisions:** No answer is selected or sent automatically. Single/multiple selection follows the native schema. A custom answer replaces option selection for that question. Keep forms mounted when collapsed or switching pending requests; reset on request revision/owner change. Render safe Markdown, retain exact option labels, support keyboard/IME, prevent duplicate submission, and keep uncertain responses locked. The runtime dialog links back to the inline form instead of creating a second form. Existing attention notifications announce a question and open its chat.

## Tasks

- [x] Extend the production question UI fixture with compact inline behavior, custom/choice answers, collapse, multiple pending requests, Skip, receipt locks, and keyboard/IME checks; confirm new expectations fail before implementation.
- [x] Update `NativeQuestion.tsx` and `native-question.css`, mount the question dock in `App.tsx`, and replace the runtime-dialog question form with an Answer in chat action. Make the non-submitting engagement event avoid the global UI busy state.
- [x] Update question notification wording and bind notification clicks to the owning chat, retaining preferences and privacy. Cover with focused notifier tests.
- [x] Run focused question/runtime/notification tests, typecheck/build, and isolated Electron checks using injected protocol requests and no provider calls. Inspect wide/narrow screenshots, obtain a bounded review, and fix material findings.

## Review focus

- Revision or chat changes must never send an earlier answer to a new request.
- Multiple pending requests retain separate answer state and native identities.
- Focus/engagement must not interrupt custom typing or submit via IME composition.
- Failed/uncertain submission cannot duplicate answers; blank or incomplete answers cannot send.
- No permissions, transport changes, provider requests, installed-app changes, or publication in this batch.

## Evidence and implementation notes

- Native schema confirmed from the installed SDK's `msp.d.ts` and existing `user-input.mjs`/runtime `answerInput`. UI uses its single/multiple choices and 500-character custom answers; Skip sends the native cancel action. Windows exec mode does not expose interactive questions, so ordinary question prose is unchanged.
- Ruling: `answerInput/engage` is quiet in both App and controller dispatch. It announces focus without submitting a response and must not disable the input the user just focused. Its existing serialization and identity validation are preserved; answer/cancel keep busy handling. The controller regression reproduced the busy publication before the change.
- 171 focused tests passed (`artifacts/inline-question-targeted.log`); production build/typecheck passed (`artifacts/inline-question-build.log`).
- Isolated Electron component fixture passed 11 flows (`artifacts/native-question-ui/desktop-kjNL8H/report.json`), covering exact answers, Markdown, keyboard/IME, rejection/unknown outcomes, collapse, multiple requests and Skip.
- Full production App/preload/publisher fixture passed seven flows with injected native requests (`artifacts/inline-questions/desktop-zzZA9U/report.json`), including uninterrupted engagement typing, main/answer drafts, exact binding, settlement, selected-request routing, no stale focus replay and narrow layout. No provider requests or renderer errors. Wide/narrow screenshots inspected.
- Focused review found missing selected-request routing and a reveal replay on later revisions. Both were corrected and covered by the App regression; final bounded recheck found no remaining issue in those fixes. Reveal serials are consumed once and focus is bound to the exact request revision.
- Earlier tray batch preserved. No commit/publication, installed-app restart, profile changes or permission changes.
