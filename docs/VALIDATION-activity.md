# MuseBench validation — 26 October 2026

## Activity, threads and file changes

Muse Code records activity under each prompt. Expand the inline row for tool output, or open **Threads** for request history and native work steps. Waiting, Working and Resolved reflect runtime state. Panels remain closed by default. The changed-files chip previews paths and line counts; choosing a path opens that file in Changes.

Counts compare with the chat's starting files, not Git HEAD or only the latest message. A shared bounded line diff fixes overcounting of separated edits and trailing newlines. Expensive comparisons are explicitly approximate; large rendered comparisons are capped with a notice. Files refresh during work and after completion.

- **352 unit tests passed**, no failures or skips: `artifacts/activity-unit-tests.txt`.
- **69 packaged desktop checks passed**, no renderer errors: activity 11, project overview 9, review workflow 11, navigation/profile 17, composer 7, slash commands 14. Exact reports: `artifacts/validation.json`.
- Desktop activity checks use isolated, explicitly labelled fixtures. They exercise expandable output, real file snapshots, selected diffs, keyboard/focus behavior, streamed UI updates, dark/light themes and narrow windows. Controller tests replay native-shaped events through the real runtime and controller, including persistence, cancellation, approval aborts and workflow attribution.
- A **live native sandboxed workflow** completed through the production runtime: two owned runs, background handoff, exact disposable README marker returned, confirmed Windows Job cleanup. Evidence: `artifacts/activity-agent-probe/run-R0VUvh/report.json`. Its initial marker assertion used the wrong native message field; it was corrected by replaying the captured records against the verified exit-zero result. Two earlier bounded diagnostic probes established the contract; one hit the old parser's post-terminal rejection.
- The workflow fold admits the observed serial parent-session pattern: registered durable launch, exact workflow terminal, native background reporting command. Global sequence/identity checks and original single-run validation remain. Completion requires all expected handoffs, independently verified Meta identities for every owned run and confirmed process exit. Four handoffs maximum. Arbitrary child streams, parallel commands and multiple outstanding workflows fail closed. Approval and process-owner rules remain.
- **35 packaged source/build files and both native helpers** match source: `artifacts/personal-package-verification.json`.
- **17 login/Electron/runtime modules are byte-identical** to the prior package; sandbox/approval argument builders are identical: `artifacts/activity-boundaries.json`. No credentials or browser storage were read or reset. Existing profile reopened successfully: `artifacts/activity-normal-launch.json`.

## Current limits

Muse 1.4.13 Windows exec reports workflow and tool tasks, but does **not** expose individual child-agent progress, objectives or transcripts. The UI does not invent agents. Threads show reported work; the Agents tab explains the limitation. Threads inspect requests in the current chat, not independently steerable concurrent model conversations. Activity starts with new requests; earlier history is preserved without invented backfills.

History is bounded to 40 requests and a storage budget; output and rendered-diff limits are visible. Existing sandboxed shell commands still need a compatible workspace outside the Windows user-profile directory on this machine. Physical microphone input was not retested; the packaged dictation check used synthetic audio.

Recovery: `artifacts/activity-baseline/app.asar`. Visual QA: `design-qa.md`. Earlier profile navigation validation: [VALIDATION-profile-menu.md](VALIDATION-profile-menu.md).


## Review workflow removal (2026-10-26)

Removed the top-bar Review button, guided plan/approval screen, sequential review tabs, workflow continuation buttons, and evidence footer. The edited-files card opens File changes directly. `/preview` and `/checks` open independent project tools. Saved controller/checkpoint data is unchanged. The former staged-demo UI scripts describe a retired workflow; they are not acceptance evidence for this interface.

Production build, activity smoke (real file counts, selected diff, keyboard activation, expansion, narrow layout, standalone preview/checks), and browser-preview smoke passed. See artifacts/remove-review-build.txt, artifacts/remove-review-activity.txt, artifacts/remove-review-preview.txt. The preview screenshot at artifacts/browser-preview/code.png confirms the top bar contains no Review control.
