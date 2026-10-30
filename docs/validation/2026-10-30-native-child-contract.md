# Native child contract: isolated Windows acceptance

**Later 30 October correction:** This is the initial terminal-target result. The [active restart validation](2026-10-30-child-restart.md) supersedes its Retry limitation: real Muse 1.4.14 accepted one restart of a running/`started` attempt and reported attempt 2 for the same workflow and child. The current runner requires that progression, local stale-attempt refusal, Skip of attempt 2, and independent Stop. The original terminal `invalid_target` below remains historical evidence for the tested terminal target; it is not a conclusion about running-child restart.

Validated 30 October 2026 with the installed Muse **1.4.14** host, SDK **1.4.14**, schema 1 fingerprint `sha256:c94c3d1f2f51e6424074b9ec43eac3eedcf532d3dcd77351ec1383a87d3049c6`.

The opt-in runner is [scripts/native-child-contract.mjs](../../scripts/native-child-contract.mjs):

```powershell
node scripts/native-child-contract.mjs --local-fixture
```

It uses production `createRuntime`, `send`, `childControl`, and `inspectChild` APIs. Native notifications pass through the production adapter/tracker; no native lifecycle frame is fabricated. A scripted localhost Responses endpoint returns only fixed tool calls using the actual advertised `muse.workflow`, child `muse.submit_result`, and observer `muse.submit_reminder_decision` schemas. The host creates and executes the workflow and owns all child transitions.

The provider performs **zero model inference**, uses no credentials and forwards no requests. Token usage in Responses is a synthetic fixture counter; it is not inference usage or a cost measurement. This verifies the native host/runtime contract, without establishing behavior of a remote model or provider.

## Observed controls

| Case | Required native observation | Result |
| --- | --- | --- |
| Workflow Skip | Exact observed workflow run, child and attempt 1; one admitted skip; same child's workflow terminal `cancelled` plus subagent error `workflow_child_skipped` | Passed |
| Independent child Stop | A different child remains running while Skip settles; one admitted stop; its workflow terminal `cancelled` plus error `generated_child_cancelled` | Passed |
| Child result | Child calls its advertised `submit_result` with `CHILD_READY`; parent subagent projection contains that exact result | Passed |
| Read activity | Production inspector reads the observed child session; matching child identity and available history with two native items | Passed |
| Read result | Exact observed result-ready child; `subagent/readResult` admission | Accepted; admission only |
| Close child | Exact observed result-ready child; `subagent/close` admission; fresh authoritative parent `session/read` after a bounded three-second observation | Accepted; last projection stayed `resultReady`, revision 5 |
| Retry | Exact terminal attempt 1, while another child keeps the workflow running | Rejected with `-32030`, `reason:invalid_target`, `retryable:false` |

The two cases used **8/7 local HTTP requests** and **56/45 native notifications**, respectively. Both finished with confirmed host shutdown and removal of their owned temporary profile/project. Each control goes through production eligibility, revision/attempt checks, current-turn ownership, and once-only dispatch. Receipts record command IDs and distinguish admission, rejection, uncertainty and observed settlement.

This fresh Skip result supersedes the historical Skip `invalid_target` observation in [the earlier lifecycle report](../research/child-lifecycle-2026-10-26.md) for this pinned host/configuration. It does not erase the earlier observation or establish every workflow state.

## Limits retained

The advertised root tools contain workflow delegation and no direct child-creation tool; the pinned MSP methods also have no direct-spawn command. These workflow-owned children remain ineligible for direct follow-up/reopen. There is no observed recoverable direct-child state for Resume.

Retry did not create a later attempt. The runner does not invent an attempt number or dispatch a stale-attempt test without a real later attempt. Retry acceptance and native stale-attempt rejection remain unproved.

Close admission did not establish closed settlement in the bounded observation or fresh parent history. Reopen was not dispatched. A future closed workflow-owned child would still be ineligible for direct reopen under the product's ownership gate. Direct-child follow-up/resume/reopen, closed settlement and full lifecycle acceptance remain **partial** and require another supported host capability/state.

## Bounds and isolation

- Only the exact `--local-fixture` argument list is accepted; missing, unknown or extra arguments fail before a host is started.
- Every scenario has a 60-second budget, reserving the final ten seconds for cleanup; individual awaited operations have at most ten seconds. The fixture accepts at most 32 HTTP requests, 2,000 native notifications and 1 MiB per request. Stored identities/results/errors are bounded; raw request prompts and native frames are not retained.
- Each case owns a new canonical temporary root with separate profile, XDG directories and project. It uses `configCatalog` and explicitly verifies the native provider/model route. It disables shell/write tools and contributor routing on that disposable host. No personal session, app installation, settings, grants or account is changed.
- Authorization/API-key/token headers, unexpected routes/tools, approvals/questions, foreign child events and replaced attempts fail the run. No approvals are automatically granted. No command is replayed after uncertainty or native rejection.
- Cleanup disconnects only the owned runtime and closes only its fixture endpoint. Recursive removal requires the canonical root to be directly inside the canonical temporary directory with the owned prefix. An unconfirmed shutdown fails the run and retains the temporary root for inspection.

The ignored report is `artifacts/native-child-contract/report.json`. It includes the tested script's SHA-256, source revision, bounded native identities/outcomes, endpoint request counts, unsupported states and cleanup receipts. A changed advertised contract or newly accepted Retry fails this pinned expectation so its new behavior can be assessed explicitly.

## Verification

The evidence assertions were first run without orchestration and failed for missing native Skip settlement. With the real native orchestration, both cases passed. A bounded negative copy returned the wrong child result: the completed case timed out at the result gate, exited nonzero, retained the missing-result failure and still confirmed shutdown/removal. Three invalid argument lists were refused. The temporary negative script was removed.

Focused regression command:

```powershell
node --test test/native-children.test.mjs test/child-inspection.test.mjs test/runtime.test.mjs
```

**127 focused tests passed, zero failures or skips.** The full `npm.cmd test` run also finished with **1,683 passed, zero failures, one skipped** (1,684 tests). The skipped test requires a retained historical native-workflow capture that is absent from this clean worktree. No production code changed. The parent delivery workflow owns whole-branch independent review, integration, full regression checks, release and installed-app verification; those outcomes are not implied here.

Independent whole-branch review of `fd7f45d..e5fedbe` approved the feature with no actionable findings. The reviewer independently reran the 127 focused tests, checked syntax/diff hygiene, matched the native report to the committed script hash, and inspected the full-suite evidence. The documented wrong-result negative run was not independently reproduced in that review; no stronger coverage is claimed. The feature is integrated separately from later context/tool-discovery work.
