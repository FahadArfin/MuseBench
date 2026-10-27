# Native child lifecycle evidence

Implementation and bounded native probes begun 26 October 2026 (local date; probe timestamps are UTC). Installed SDK/native contract: Muse 1.4.13. The source contract is `node_modules/@muse-code/sdk/dist/src/msp.d.ts` and the exported stable schema in `artifacts/muse-install/schema-stable/msp.schema.json`.

## Control corrections

- A `resultReady` child no longer offers **Resume**. Result completion does not establish a paused/recoverable child. `recoveryPending` and `manualReconciliation` also do not automatically acquire resume controls.
- Workflow-owned child rows no longer offer direct follow-up/reopen. Ownership is taken from the host's `workflowRunId`, or correlated with an observed workflow's child IDs when that field is absent on the subagent. Workflow attempt controls remain separate.
- Workflow child state `started`, observed on the real native stream, now permits an explicit skip attempt. Unknown states remain without controls; stale revision/attempt rejection is unchanged.
- Generic terminal status suppresses stale running/starting actions. Unresolved recovery/manual-reconciliation rows continue to keep the workspace busy until reconciled.
- The tracker retains a host-supplied `childSessionId`; it never derives a session identity from the opaque child ID. This makes the real identity available for future separate child-view observation without claiming that observation is implemented here.
- The UI explains workflow ownership and unresolved recovery. Command acceptance continues to mean admission only.

Direct result-ready follow-up and direct closed reopen remain conservative candidate controls under their documented contract; this change does **not** claim live direct-child acceptance. There is no supported host-supplied allowed-action list in this contract. A native rejection remains authoritative.

## Fresh native probes

The opt-in runner is `scripts/child-lifecycle-probe.mjs`, with modes `direct`, `workflow`, and `closed`. Each creates one owned native root session, uses the existing Muse login, has a 90-second absolute operation deadline, closes only its own host, and removes its verified temporary workspace. It does not attach to user sessions, edit profile settings, copy credentials, install providers, or synthesize lifecycle events. Each observed command is sent once with `maxAttempts:1`. Native session logs remain in Muse's normal history; existing data is not removed.

| Probe | Observation | Boundary |
| --- | --- | --- |
| Direct child | Native answer: `DIRECT_CHILD_UNAVAILABLE — available delegation tool: muse.workflow`. No child was created. | This host/model run did not expose a direct spawn path. It is not proof that every build or configuration lacks direct children. No direct follow-up was sent. |
| Workflow skip | Exact observed workflow run, child ID, and attempt 1 were supplied. Rejected with code `-32030`, `reason: invalid_target`, `retryable:false`. | No skip transition or new attempt was claimed. Child subsequently completed normally with `WORKFLOW_CHILD_READY`. |
| Workflow retry | Same observed child at terminal completed attempt 1. Rejected with code `-32030`, `reason: invalid_target`, `retryable:false`. | No new attempt was created. A stale-attempt native test could not be exercised without a real later attempt; no attempt number was invented. |
| Close then reopen | Real workflow-owned result-ready child accepted `subagent/close`. Its last parent projection remained revision 5, `status:inProgress`, `controlStatus:resultReady`. No closed projection appeared before the deadline. | Close admission was observed; closed settlement was not. Reopen was deliberately not dispatched without an observed closed child. This does not prove the close never settled elsewhere. |

All three owned host close calls completed and all three temporary workspaces were removed. Probe reports are local artifacts:

- `artifacts/child-lifecycle-direct-2026-10-26.json`
- `artifacts/child-lifecycle-workflow-2026-10-26.json`
- `artifacts/child-lifecycle-closed-2026-10-26.json`

Historical `native-children-followup-{live,retry}.json` separately record `subagent_state_ineligible` for workflow-owned result-ready children. Those older results motivated the ownership gate; they are not newly repeated direct-child acceptance tests.

## Verification and remaining limits

Ten child-specific tests pass (`node --test test/native-children.test.mjs`). Six new regressions were observed failing before implementation: result-ready resume, workflow-owned direct restart, native started skip, terminal/recovery semantics, missing child-session retention, and correlated ownership. The tests exercise actual tracker preparation and shared UI eligibility; they do not stand in for native lifecycle acceptance.

The full suite was also run while the broader remaining-features implementation was in progress: 805 passed / 818 tests, 13 failed. Log: `artifacts/child-lifecycle-full-tests.txt`. Failures were the runtime tests for native child uncertain admission, admission-only receipt, receipt eviction, overlapping turns, known child rejection, native restoration, resume-request buffering, restored identity validation, image input, malformed images, model selection, MCP grant; plus workspace tool discovery. The integration owner is addressing these concurrent runtime/tool changes and must rerun the full suite before completion. A TypeScript check exposed missing optional `workflowRunId` on the shared `NativeChild` type; that shared integration edit belongs to the integration owner.

Live paused/recoverable resume, direct follow-up, settled closed reopen, workflow retry/skip acceptance, and stale-attempt rejection remain **unproved**. No working-workaround claim should be made for them from schema availability or an accepted close command. No more model probes were launched after these bounded results.
