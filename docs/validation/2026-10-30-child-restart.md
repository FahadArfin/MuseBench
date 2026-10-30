# Active workflow child restart: pinned native and shared UI evidence

Validated 30 October 2026 on Windows with Muse host **1.4.14**, SDK **1.4.14**, schema fingerprint `sha256:c94c3d1f2f51e6424074b9ec43eac3eedcf532d3dcd77351ec1383a87d3049c6`.

The [official workflow manual](https://dev.meta.ai/docs/muse-code/workflows) describes restarting a running child. The earlier [native child contract](2026-10-30-native-child-contract.md) tested a **terminal** attempt and received `invalid_target`. That result remains evidence for that target. It did not establish that active restart was unsupported. MuseBench's shared policy had offered Retry on terminal attempts and only Skip on active ones.

## Verified native behavior

`node scripts/native-child-contract.mjs --local-fixture` now requires these observations through production runtime, adapter, tracker and native command dispatch:

1. A real workflow owns two active children. Each workflow attempt has `status:started`; its subagent projection has `controlStatus:running`.
2. One `workflow/childControl` command sends `action:retry` for the exact observed workflow run, child and attempt 1.
3. The host reports **attempt 2 for the same workflow run and child**. The independent child's item, session and workflow ownership remain unchanged and it stays running.
4. Attempt 1 with the current workflow revision is rejected locally before dispatch. Only the latest attempt remains eligible.
5. Skip settles attempt 2 as `cancelled` with `workflow_child_skipped`; independent Stop settles the other child as `cancelled` with `generated_child_cancelled`.
6. The separate completed-child case still observes `CHILD_READY`, reads the exact child session's activity, and admits Read result and Close. Close admission still does not establish a closed projection or authorize Reopen.

The controls/completed cases used **9/7 localhost HTTP requests** and **60/45 native notifications**. Both passed, confirmed shutdown of their owned host, and removed their temporary profile/project. The fixture performs **zero model inference**, uses no personal credentials, and forwards no requests. Synthetic response usage counters are not inference or billing measurements.

The ignored `artifacts/native-child-contract/report.json` contains exact session, turn, workflow, child, attempt, revision and command IDs, source revision and tested script SHA-256. Acceptance and observed progression are separate fields. This fixture establishes the pinned host/runtime contract; remote-model acceptance is outside this evidence.

## Product contract

The visible action is **Restart attempt**; the compatibility wire action stays `retry`. Only current `started`/`running` workflow attempts under an `inProgress` parent offer Restart alongside Skip. Terminal, unknown and incomplete states do not authorize Restart. Tracker preparation binds native workflow ownership and current revision/latest attempt; renderer-supplied run IDs cannot redirect it.

An accepted acknowledgment does not fabricate a later attempt. The runtime retains pending restart ownership and refuses another command for that child until a later attempt or known terminal workflow is observed. Same-attempt revisions and unknown parent states do not settle it. Unknown dispatch outcomes are never replayed, even after attempt progression. Unrelated child Stop/result/activity behavior is preserved.

Browser preview uses the same tracker/policy and labels a simulated active workflow and attempt-2 transition as a preview. The native runtime uses only host observations for these transitions.

## Verification and negative proof

- Regression RED: three initial policy/tracker tests failed for the active-restart reversal, label and terminal-parent protection. The corrected policy passed. A separate incomplete-state assertion failed before its guard was added.
- Runtime RED: a repeated command after accepted acknowledgment was admitted; its regression failed before the pending-work guard. An unknown parent status also incorrectly released pending work; its assertion failed before restricting terminal settlement. Both passed after correction. Separate coverage verifies unknown-outcome no-replay and exact native ownership.
- Rendered RED: the real shared component left Restart enabled after admission; the browser regression failed before the accepted-attempt guard. Final browser and Electron fixtures each pass eight checks covering Restart/Skip action selection, keyboard dispatch, terminal absence, attempt-2 display/stale-row removal, accepted/pending/unknown blocking, earlier-request ownership, and 320px layout. No native host or provider is used in UI fixtures.
- A separate one-shot native negative copy required nonexistent attempt 3 after the accepted restart. It exited nonzero at the progression gate, with confirmed cleanup/removal, proving acknowledgment alone cannot pass the runner. The temporary negative script was removed; its bounded report is `artifacts/child-restart-negative/report.json`.
- Missing, unknown and extra CLI arguments were refused before host startup. Scenario (60 seconds), cleanup reserve (10 seconds), operation (10 seconds), request (32), event (2,000), and body (1 MiB) limits remain enforced. No uncertain native command is retried.
- Focused native/inspection/runtime/CI tests: **137 passed**. Full suite: **1,742 passed, zero failures, one unchanged optional historical-capture skip**. Production build passed (existing large-bundle advisory). Existing browser/Electron child-activity fixtures passed nine checks each. Browser/Electron preview parity passed **100** comparisons with no failures.

Exact commands and evidence hashes are retained in the ignored implementation report at `.superpowers/sdd/2026-10-30-child-restart/task-1-report.md`. The new `test:child-restart` browser/Electron fixture is wired into the native CI group. Independent whole-feature review, integration, CI/publication and installed-app acceptance belong to the parent delivery workflow and are not implied by these local results.

## Remaining boundaries

Direct-child delegation and remote MCP are separate work. A separate 30 October isolated delegation probe explicitly set `run.subagent_delegation_mode=auto` on Muse 1.4.14 and still advertised zero `subagent_*` tools (four localhost Responses requests, 21 notifications, zero inference, confirmed cleanup). Its receipt is retained in the main checkout's `artifacts/roadmap-remaining-20261030/direct-delegation-probe.json`; this feature did not rerun or change that configuration. Direct follow-up/resume/reopen therefore remain unproved in an eligible direct-child lifecycle. Workflow-owned results continue to refuse direct follow-up/reopen, and Close acknowledgment alone still does not establish closed settlement.
