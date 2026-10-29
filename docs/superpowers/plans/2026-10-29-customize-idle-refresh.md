# Stable Customize during chat refresh

Use superpowers:executing-plans for this authorized follow-up to the approved extension catalog design.

## Evidence and scope

Installed 0.2.161 showed a 61px catalog shift during a background chat refresh. A 200ms native sample and screenshot captured the task-running banner while the runtime was unavailable, correlating exactly with controller busy state. App.tsx polls chat refresh every five seconds; controller refresh correctly retains its operation lock, but that lock is presented as task activity in Customize.

Keep the controller and configuration safety guards intact. Pause the periodic/focus chat refresh effect while Customize is open. Live controller subscriptions remain active, and periodic refresh resumes after closing. Do not change any actual task, account, plugin grant or provider state.

## Task 1: Regression and narrow fix

- Add a browser/Electron regression that first observes chat refresh, opens Customize and verifies no background refresh across all five pages, then closes it and verifies refresh resumes.
- Watch the regression fail before adding the modal condition/dependency.
- Keep existing compact controls, consent and native events unchanged. Run both UI fixtures, production build and the complete unit suite.

Expected: the previous five-second polls disappear while browsing, then resume; all existing checks remain green. No model requests.

## Task 2: Review and delivery

- Commit the completed fix, obtain one final fresh-context review, and address Important findings with regressions; no repeated review.
- Push main under standing authorization, await exact-head Validate and Release, verify/install the immutable artifact, preserve profile and reopen.
- Inspect all five real Customize pages at 200ms intervals across multiple refresh periods. Verify preview source and native Codex control; retain receipts, including the initial failed installed check.

Review focus: effect cleanup and in-flight refresh; closing resumes polling; real background task notifications still reach the renderer; no weaker backend mutation or restart guard; shared preview/desktop behavior.

Use the authorized live main checkout to preserve preview alignment. Keep audit artifacts; no cleanup or provider inference.
