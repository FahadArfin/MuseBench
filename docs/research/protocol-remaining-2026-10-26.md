# Remaining MSP protocol capabilities — 26 October 2026

Research began read-only on 26 October. Authorized implementation and isolated native acceptance followed on 27 October; the final section separates those results from historical child-control evidence. No user app/profile settings were changed, and no unrelated native sessions were attached.

## Evidence and version boundary

- Installed package: `@muse-code/sdk` **1.4.13** (`package.json`, `node_modules/@muse-code/sdk/package.json`). Fresh discovered native executable reported **Muse Code 1.4.13 (1.4.13-R6996.1)**.
- Installed SDK stable fingerprint: `sha256:7fddaf646dbc317e5fcac0785e135eb04df14fbb0db1863089dfd6da21730e5b` (`dist/src/fingerprint.js`). Local exported stable manifest agrees.
- Local exported experimental manifest: `sha256:92770f6e8883d1479dd33acc1b3687c70057de316980e6f2cd9cef25ea8e30fd`. The current [1.4 documentation](https://meta-models.github.io/muse-code-sdk/1.4/) advertises that experimental fingerprint and build commit `39490bd065c800195489caec34473582f7650b54`. These are different **bundles**, not evidence of incompatible native versions. The existing `interactive-contract-probe.json` names that same native build and the stable fingerprint.
- `/next/` is a separate moving developer preview. Use installed stable declarations and the corresponding exported experimental schema, not an unqualified latest-docs assumption.
- Local authoritative inputs: `node_modules/@muse-code/sdk/dist/src/msp.d.ts`; `dist/src/facade/{client,session,host-death}.js`; `artifacts/muse-install/schema-{stable,experimental}/msp.schema.json`. The adapter's original `README.md` describes its initial fixture-only boundary and predates current runtime integrations.
- Pinned upstream source provenance: `reference/patchlight/adapter/evidence/provenance.json`, including [the originally downloaded schema](https://raw.githubusercontent.com/meta-models/muse-code-sdk/3dce908f556bd8b3dfc9cd7f28f442b0504d74a4/schema/msp/stable/msp.schema.json).

## Native session restoration

This is supported by MSP. Native restoration must not be represented by starting a new session and sending saved app history as another prompt. [Official restoration recipe](https://meta-models.github.io/muse-code-sdk/1.4/cookbook/resume-a-session/).

| Operation | Actual contract | Integration consequence |
| --- | --- | --- |
| `session/start` | Creates a new session; an optional `sessionId` chooses a new identity, never an existing session. A retained/reserved ID is rejected. | Never use it to reopen an existing chat. |
| `session/resume` | Command with `{sessionId, cursor?, excludeItems?, history?, permissionProfile?, recoveryMode?}`; loads a stored session, obtains its writer ownership and subscribes the connection. | The cold host/reconnect path. Keep app-owned native session ID and workspace binding. |
| `session/read` | Lease-free, no load or subscription. Default metadata only; `excludeItems:false` requests history. | Useful reconciliation/preflight. It never reissues pending request payloads. |
| `view/subscribe` | Request `{sessionId, after?}`. Replays `(after, head]` before live events. Never loads or takes a lease. | Reattach to an already loaded session on a suitable live host. It cannot resurrect the old stdio process. |
| `view/unsubscribe` | Removes delivery only; does not unload. | Do not describe it as stopping native work. |
| `session/leave` | Command `{sessionId, stop?}`. Admission result is separate from `session/leaveCompleted`. | Release requires matching completion with `outcome:released`; do not infer it from accepted. `stop:true` explicitly cancels unfinished work. |

The resume result has `session`, `history`, `pendingRequests`, `viewCursor`, and optional `lastTurn` / `blockedPrompt`. Validate exact native identity, canonical workspace, provider/model selection, effective permissions, and actual served history before enabling submission. Treat `sessionInUse` as ownership conflict; never kill another host or silently fall back to a fresh session.

The history envelope reports its **actual** mode: `inline`, `snapshot`, `anchoredSnapshot`, or `none`. Inline carries `items`; snapshot modes carry `snapshot.state`. The snapshot includes active turn, queued turns, pending approval/input pointers, item revisions, effective model, and other session projections. `noneReason` matters: excluded/oversize history can often be paged; `projectionUnavailable` cannot be repaired by repeated paging. `view/page` accepts a 1–1000 event limit, has explicit forward/backward direction, and returns nullable `nextCursor`. A newer snapshot schema requires an inline/paged fallback, not guessing its state.

Cursors are opaque. Persist only cursors the host actually served, and compare equality for duplicate detection rather than parsing or ordering strings. **An empty string is a valid cursor.** The old adapter's `str(result.viewCursor)` check rejects that valid before-genesis case and must not be copied into restoration. An old cursor can require snapshot recovery; an unknown cursor is refused; a pruned compaction boundary has its own refusal.

`pendingRequests` contains pointers, not a complete approval or question. The server reissues full requests immediately after the resume response. Register request handlers and an opening-state buffer **before** dispatch. Validate pointer kind and its corresponding ID; the flat schema alone does not enforce the discriminated shape. Reconcile independently by native `(sessionId, kind, requestId)` and approval requirement revision. Unknown future kinds stay visibly unresolved. Do not automatically reuse an old approval choice or resend an answer whose outcome is unknown.

Important SDK limitation: `MuseClient.resumeSession` creates a `Session`, retains the result in `session.opening`, and delivers buffered frames. In installed 1.4.13, the `Session` constructor does **not** seed all returned history into its live fold. An embedder must consume the opening envelope and reconstruct its UI; swapping to the facade alone is not a restoration implementation. The facade does provide valuable early approval-handler registration and delivery-gap machinery.

Durability comes from `initialize.sessionDurability`: absent means durable for backward compatibility; explicit `durable` is durable; `ephemeral` or an unrecognized value provides no survival guarantee. The historical interactive probe explicitly reported durable. For ephemeral host loss, retire in-flight work as unknown and do not reattach/replay. For durable host loss, reconcile the server-authored recovered terminal state rather than fabricate completion. See installed `readSessionDurability` / `survivesHostDeath` and [host-death recipe](https://meta-models.github.io/muse-code-sdk/1.4/cookbook/survive-the-host-dying/).

Command identity must survive any recovery policy. The connection can mint a UUIDv7 before dispatch and accepts `{commandId,maxAttempts:1}`. Persist an intent before sending if future reconciliation needs it. An exact same-ID/same-payload replay can deduplicate at protocol level; a new-ID retry can execute twice. Existing app policy intentionally avoids replay after unknown outcomes; retain it unless a complete replay reconciliation path is implemented and tested. [Official retry recipe](https://meta-models.github.io/muse-code-sdk/1.4/cookbook/retry-without-double-submitting/).

## Exec / MSP feature parity

| Feature | Supported surface | Safe implementation and remaining proof |
| --- | --- | --- |
| Model choice | Start `modelId` / `providerId`; `model/list`; `session/setModel({sessionId,model:{modelId,providerId?,profileId?,displayLabel?}})`. | Select an actual catalog row and preserve its routing. Do not silently substitute a billable provider. Observe `session/modelChanged` and read back before presenting it as applied. A running-turn selection applies at a later model-call boundary. [Recipe](https://meta-models.github.io/muse-code-sdk/1.4/cookbook/list-models-and-switch-mid-session/). |
| Reasoning | `turn/start.reasoningEffort` or `session/setReasoningEffort`. | Per-turn value is distinct from standing default. Use catalog-supported variants; acknowledge/read back selection. |
| Permissions | `session/start.permissionProfile`; resume launch pick; experimental `permissionProfile/list`, `session/setPermissionProfile`. | Select host-catalog IDs only. Validate `permissionState` axes, reviewer authority/attachment, approval mode, and host sandbox posture. An accepted profile name alone is insufficient. |
| Approval mode | Start `approvalMode`; `session/setApprovalMode`. | Next-action policy change; it does not settle an existing approval. Changing approval mode and changing sandbox/profile are different operations. |
| Images | `turn/start.input` permits `{type:'image',base64Data,mediaType,width?,height?}` along with text. | Reuse validated screenshot intake, add bounded encoding, account for base64 expansion and wire frame caps. Width and height appear together. Empty/invalid base64 is invalid params. Persist app attachment provenance; user-message view only echoes image metadata. A successful submission is not proof the selected model interpreted the image. |
| Execution budgets | No max-model-steps or wall-time field in installed stable or experimental start/turn schema. Fresh `serve --help` does not offer `--max-model-steps`; exec does. | Do not copy exec flags to serve or invent session config keys. A separately named app wall-time cutoff is possible, but native model-step/token budget parity remains unproved. No claim of a hard cost cap from delayed usage events. |
| Reviewed app hooks | Fresh serve help permits repeated `-c KEY=JSON`; installed app already uses `-c hooks={}` and `managed_hooks_path=null`. `hook/list` inspects installed handlers. | At host construction, inject only the existing reviewed project-bound hook map in place of the empty map; retain managed/global guards and trust rules. Verify handler inventory and actual execution in isolation. Hooks execute native shell commands and are not equivalent to sandbox-contained model tools. |

`SessionConfig` only recognizes `mcpServers`; **unknown keys are ignored**. Passing `config:{budget:...,hooks:...}` can succeed while doing nothing. The facade deliberately excludes `config` until it can implement the `sessionMcp` grant check. Low-level session MCP requires explicit capability negotiation, typed config validation and existing review/provenance; do not bypass those checks. Hook configuration is discovered at session startup, so changing a saved hook map does not establish that an already-running session reloaded it. [Official extension guide](https://dev.meta.ai/docs/muse-code/extending).

Fresh `serve --help` also states host sandbox posture and session durability are fixed at process construction. Wire approval selection is separate. Existing Full access operation is an explicit process posture, not proof a Windows sandbox has been repaired.

## Child lifecycle: distinct control families

The installed stable schema contains these methods; the extended schema carries them too. Do not infer experimental status merely because the generated online page cites its experimental bundle. Parameter descriptions below come from installed SDK types (`SubagentInputParams`, `SubagentTargetParams`, `SubagentOwnerReasonParams`, `WorkflowChildControlParams`) and both exported schemas.

| Method | Target / effect | Completion evidence |
| --- | --- | --- |
| `subagent/sendMessage` | Parent session + opaque durable `subagentId` + trimmed `body`. | Admission is not delivery/application. Observe child continuation or result. |
| `subagent/followupTask` | Same target/input shape; queues a child task. | Ack is admission-only; task settles on child's view stream. [Reference](https://meta-models.github.io/muse-code-sdk/1.4/generated/msp/methods/subagent-followuptask/). |
| `subagent/interrupt`, `stop`, `close` | Parent session + child ID + optional reason. | Cooperative runtime transition and parent/child projected result, not ack alone. |
| `subagent/resume` | Bare child target. | Resumes a **paused/recoverable** child as a durable later attempt. [Reference](https://meta-models.github.io/muse-code-sdk/1.4/generated/msp/methods/subagent-resume/). |
| `subagent/reopen` | Bare child target. | Reopens a **stopped/closed** child as a durable later attempt. [Reference](https://meta-models.github.io/muse-code-sdk/1.4/generated/msp/methods/subagent-reopen/). |
| `subagent/readResult` | Bare child target. | Returned durable result; this read does not start work. |
| `workflow/childControl` | `{sessionId,workflowRunId,childId,attempt,action:'retry'|'skip'}`. | Attempt-specific workflow transition; `stale_attempt` requires refresh/reselection, never an invented next attempt. [Reference](https://meta-models.github.io/muse-code-sdk/1.4/generated/msp/methods/workflow-childcontrol/). |

There is no generic `subagent/restart` method. A workflow retry is not a follow-up, and neither is a root turn containing instructions to imitate a child operation. Protocol acknowledgment is not live lifecycle acceptance.

The view's `SubagentControlStatus` vocabulary is open: known values are accepted, starting, running, resultReady, closing, closed, recoveryPending and manualReconciliation. Generic item status remains terminal authority. The schema does **not** provide a universal per-row allowed-action array or a complete admission-state matrix. Therefore `resultReady` does not prove follow-up eligibility, and `recoveryPending` does not prove it is safe to auto-resume; manual reconciliation must stay manual.

Concrete existing mismatch: `src/shared/child-actions.mjs` offers `resume` for `resultReady`. The native contract describes paused/recoverable resume, not resuming every completed result. Also, `native-children-followup-{live,retry}.json` record a workflow-owned child with `controlStatus:resultReady` and a completed workflow attempt rejecting follow-up as `subagent_state_ineligible`. Both succeeded at sendMessage first and confirmed shutdown. These reports establish **that target/lifecycle's rejection**, not that all native follow-ups are impossible. Correlate the subagent's `workflowRunId` with workflow children before offering restart actions. Direct-child success still needs a distinct eligible-child test.

Keep the current native-target ownership and row revision checks, one attempt per action, and unknown-outcome receipts. For follow-up completion, retain parent stream identity while observing the child session stream when its native session ID is actually supplied; do not invent a session ID from opaque child IDs. Record the new durable attempt/turn and terminal result separately from command admission.

## Smallest acceptance matrix

1. Session round trip without inference: isolated state/workspace, start with known model/profile, produce a nonempty view via configuration change, orderly close, second host resume, assert exact identity/workspace/model/permissions and cursor suffix. No model needed for this protocol check.
2. Genuine continuation: bounded native turn, orderly reconnect/resume, next native turn recalls prior state without app history injection. Keep inference evidence separate from the structural test.
3. Warm pending reattach: two independent requests, unsubscribe/resubscribe or supported transport reconnect, verify the same IDs and revised payloads, settle independently. Cold host loss separately asserts recovered terminals/pending state; it must not presume a still-running tool survived process death.
4. Unknown send: drop acknowledgment in a fixture after admission; restored transcript/snapshot associates exact command/turn; no fresh execution. Include empty cursor, missing anchor, snapshot downgrade, newer snapshot schema, projection unavailable, foreign lease, and ephemeral-host refusal.
5. Images: fixture byte/schema test plus one bounded real image question using an unmistakable generated or local test image. Native metadata and final visual answer are separate receipts.
6. Hooks: isolated marker hook with an explicitly reviewed command; verify one invocation per intended event, retained startup policy after resume, and no unreviewed hook source loaded. Do not test on the user's working project/profile.
7. Children: direct eligible child follow-up; paused/recoverable child resume; stopped/closed reopen; workflow skip/retry with stale-attempt rejection. Each needs admission, observed later attempt/turn, terminal result, and cleanup. Repeatedly prompting a workflow-generated completed child does not test all these states.

## Hard boundaries retained

- Native peer session messaging remains unavailable on Windows and headless launches according to the [current official scope](https://dev.meta.ai/docs/muse-code/session-messaging). Parent-to-child controls are a separate mechanism. No socket or peer workaround has been verified here.
- No supported per-turn MSP model-step/token budget was found in this installed contract. Host settings might expose additional configured limits, but this investigation did not validate one; do not claim general upstream impossibility or ship an ignored override.
- Arbitrary session MCP/global hooks and dynamic model-visible schema discovery are not delivered by an app tool-directory UI. `sessionMcp` supports reviewed construction-time server configuration, not blanket arbitrary tool injection or proof of live schema reload.
- No proof here establishes universal direct/workflow-child lifecycle eligibility, live resume of arbitrary interrupted tools, or survival of ephemeral sessions.

## Implementation and acceptance — 27 October 2026

The runtime and reference adapter now implement exact `connect({sessionId})` restoration, bounded inline/snapshot-v1 history, pending request reissue buffering, Meta model catalog selection/readback, and PNG/JPEG/WebP image input. Restored transcript is exposed separately as `restoredMessages`; current `messages` belongs to the active native turn. `restoration` includes native session/cursor/history mode, active and queued turn IDs, pending request pointers and turn count. `sessionSeeded:true` prevents controller history reinjection. Existing response/unknown-outcome receipts survive reconnect to the same session within the runtime instance; nothing is automatically replayed.

`workspaceTools:true` is optional and requires a trusted constructor factory plus granted `sessionMcp`; typed stdio configuration is supplied on start/resume. The native host launch reads only project-reviewed hooks and project trust through the existing extension review service, retaining `managed_hooks_path=null`. Fixture coverage verifies those construction paths. Actual hook execution and gateway startup acceptance are separate checks, not established by these fixtures.

Images are limited to four files and **7 MiB aggregate raw bytes**. This leaves base64 expansion and bounded text/JSON overhead below the verified SDK/server **10,485,760-byte default frame limit**. The earlier 8 MiB raw estimate is unsuitable once base64 and prompt overhead are counted. [Official framing limit](https://meta-models.github.io/muse-code-sdk/1.4/guides/msp-wire/framing-and-caps/).

Live acceptance used existing native authentication, fresh exclusively owned temporary workspaces/sessions, and the current native default Meta model `muse-spark-1.3-contributor` with low reasoning. Three inference turns completed; no alternate provider was used. Startup-only failures incurred no inference turns. Each successful probe host's shutdown was confirmed.

1. A first image turn retained a code in native conversation state. After confirmed host shutdown, a new host restored the exact native session ID, snapshot history and model. The next prompt recalled `MUSEBENCH_RESTORE_48319` without app-supplied conversation history. Restore returned idle, two retained messages, no pending requests and turn count one. Evidence: ignored local `artifacts/native-msp-restore-image-2026-10-27.json`.
2. That first 32×32 green PNG was accepted but the model answered `gray`. Its owned native session log records the correct image/png asset, 32×32 dimensions and SHA-256 `2f1a740ab9e37065212fcf4ed3c2ebd3aa40a47b2bb88529e891dfe90479c73f`. This is an image interpretation failure, not evidence that the attachment disappeared.
3. A separate 512×512 green PNG was accepted and correctly answered `green`, with completed terminal status and confirmed shutdown. PNG SHA-256: `25160a88d32bc1b6a0a199a2de3d411e6af8577a0022e74fb5ee712435910f57`. Evidence: ignored local `artifacts/native-msp-vision-2026-10-27.json`. This establishes one real visual interpretation, not arbitrary-image accuracy.

The live host exposed a startup ordering race: `session/approvalModeChanged` for the exact opening command can arrive on either side of its reply. The runtime now correlates and ignores only that opening projection, then independently verifies fresh `session/read` permission state before enabling any turn. Unrelated/later policy changes retain the disconnect gate. No permission default was changed to obtain acceptance. Live tests selected the explicitly authorized Full access posture and preserved Ask me approvals.

Remaining boundaries: larger/newer/gap history requires explicit future recovery support; missing pending payloads remain blocked; active tool survival after host death was not tested; model-step/token budgets are still unsupported in this schema; native child resume/reopen/follow-up acceptance remains separate. Startup acceptance used a 30-second bounded command timeout, while the production default remains unchanged.
