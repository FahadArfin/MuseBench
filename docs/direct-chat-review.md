# Direct Muse chat — 2026-10-26

The user reported that even “talk to me” led to a mandatory plan review. Two separate behaviors caused this: both the renderer and controller required `planApproved` for Muse messages; the sample composer saved messages as local demo notes.

## Changes

- Sending a new Muse chat now creates the task and submits its first prompt in the same user action.
- An unavailable/disconnected runtime connects using the selected project and the existing native readiness checks. Blocked, uncertain, pending-approval and verified connections are never silently replaced.
- Chat and optional Plan requests no longer require local plan approval. No fabricated approval is recorded.
- Typing in a tutorial creates a separate real Muse child chat; the tutorial and its baseline remain available.
- Connection/submission failures keep the editable draft and do not add duplicate unsent prompts.
- The optional tutorial/checkpoint review remains available. Runtime action approvals, sandbox configuration, personal web sessions and login storage are unchanged.

## Verification

Four focused tests first failed on the original plan gate, then passed after the correction. The full suite passes 306 tests. The packaged app completed two real Muse requests (initial and follow-up) without plan approval, under Ask me with verified native sandbox readiness, authoritative completion, confirmed cleanup, and no project changes. Offline UI checks cover absent CLI, retry, new chat, tutorial-to-Muse transition, optional planning, draft persistence and narrow layout. Existing project/composer/tutorial/navigation checks are recorded with the release validation.

No account credentials or profile contents are included in the evidence. The live test used isolated MuseBench history and the existing official CLI sign-in. Recovery archive: `artifacts/direct-chat-baseline/app.asar`.
