# Open-source harness research for MuseBench

Research date: 26 October 2026, America/New_York. MuseBench baseline: `998efe3e74e219c8f62d6a0066ec23d5ef4a1717`.

## Recommendation

The best next investment is **durable, retrievable evidence plus verified workflow execution**. Preserve what happened, retrieve the relevant parts, run real checks, and make continuation and recovery dependable. These foundations can improve long tasks without replacing Muse or pretending the desktop wrapper controls its internal model loop.

Implement in this order:

1. Establish a small paired evaluation suite, then durable transcript search and recoverable output artifacts.
2. Connect workflow phases to revision-bound validation receipts; add actionable diagnostics and bounded repair attempts.
3. Add context provenance, reviewed project lessons, and selected-file checkpoint restore with redo.
4. Strengthen run recovery and event delivery, then add bounded goal continuation and specialized review roles.
5. Evaluate semantic code tools and alternative runtime adapters only where they solve measured remaining problems.

This is a research assessment and proposed sequence, **not an implementation completion report**. Source and documentation were inspected; the four harnesses were not installed, benchmarked, or tested on this Windows machine. Benefit and effort assessments are engineering judgments. No new model calls or paid benchmark runs were made for this research.

## Sources and version boundaries

| Harness | Inspected source snapshot | Particularly useful mechanisms |
| --- | --- | --- |
| Pi | [`earendil-works/pi`, `6c384aa`](https://github.com/earendil-works/pi/commit/6c384aa30f619d7b28963f2bab24d8dacbe73cb6), main | Branch-aware durable sessions, context projections, precise queue lifecycle, output recovery, controlled evaluations |
| OpenCode | [`anomalyco/opencode`, `0b050ac`](https://github.com/anomalyco/opencode/commit/0b050ac5cdd995ba8165e0699d4150b3409cfe51), dev | File snapshots, recoverable execution, event synchronization, bounded UI caches, role policies |
| Hermes Agent | [`NousResearch/hermes-agent`, `c714c42`](https://github.com/NousResearch/hermes-agent/commit/c714c42431e518fcd1c8870eff5c667d5de33b57) | Evidence-backed recall, reviewed learning, output spill files, durable scheduled-run receipts |
| DeepSeek Harness | [`deepseek-ai/deepseek-harness`, `22ddee3`](https://github.com/deepseek-ai/deepseek-harness/commit/22ddee3792402c3e70ec5f86a63c3e3e895a2f60), master | Event-log authority, context accounting, semantic code tools, bounded goal driving, explicit capability contracts |

Pi's former `badlogic/pi-mono` URL redirects to the canonical repository above. OpenCode's inspected commit is dated 27 October UTC, still 26 October Eastern; it is a **development snapshot, not a stable-release recommendation**. DeepSeek Harness describes itself as a developer preview. These distinctions matter when evaluating migration risk.

Two documentation discrepancies were checked against implementation:

- OpenCode V2 preserves `lsp` configuration but **does not run language servers, expose LSP tools, or produce LSP diagnostics**. Older public documentation describes V1 behavior. The V2 migration guide recommends lint/typecheck/compiler commands. [Pinned migration guide](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/services/www/src/docs/content/migrate-v1.mdx#L446-L452).
- Hermes' session-search implementation explicitly makes **no LLM calls**, despite older README wording about summarization. Direct session reads also cap individual message content at 2,000 characters. “Retrieved original evidence” therefore does not mean “unbounded complete output.” [Search implementation](https://github.com/NousResearch/hermes-agent/blob/c714c42431e518fcd1c8870eff5c667d5de33b57/tools/session_search_tool.py#L1-L56).

## What MuseBench already has

The existing foundation includes screenshots, persistent native sessions, skill discovery/import provenance, worktree creation/setup/archive/recovery, queued prompts, four concurrent background runtimes, time/step budgets, handoffs, workflow templates, native usage reporting, model selection, reviewed project instructions and app-owned hooks. These are not missing features to rebuild. See the [previous delivery report](HARNESS-ROADMAP-DELIVERY-2026-10-26.md).

Fresh source inspection identifies more specific gaps:

| Area | Current behavior | Useful next increment |
| --- | --- | --- |
| History | App messages are capped at 150; each message is capped at 16,000 characters. Search scans that retained text. Native sessions are stored separately. | Durable app history and supported native-history indexing, independent of UI rendering limits |
| Workflows | Completion checks are prompt instructions. Separate accepted-checkpoint logic already requires a current passing check and preview revision. | Reuse that validation machinery to enforce workflow phase completion |
| Output | Check/preview logs retain bounded tails; persisted shell receipts cap output. | Searchable captured-output files with explicit completeness and retention |
| Context | App context builder reports omissions and estimates characters/4; native usage is separately reported. | Source-linked input receipts, stable instruction revisions, accurate boundaries between app estimates and native observations |
| Goals | Saved objective and active/paused status become prompt metadata. | A bounded continuation controller with verified completion criteria |
| Checkpoints | Accepted checkpoints already save captured file content and revision. UI lists records. | Selected-file restore, conflict detection, redo and linked conversation lineage |
| Runtime events | Controller persists state and publishes snapshots from event updates. | Profile write/render overhead, then separate durable events from batched UI projections where justified |

Relevant baseline source: [controller](../src/controller/index.mjs), [context construction](../src/shared/chat-context.mjs), [workflows](../src/shared/workflows.mjs), [usage semantics](../src/shared/native-usage.mjs), [runtime capabilities](../src/shared/runtime-capabilities.mjs), [exec adapter](../src/runtime/exec.mjs), [checkpoint UI](../src/ui/WorkspacePanels.tsx).

Native live steering, interactive questions, native compaction and child-agent controls remain capability-gated. The prior delivery report records the Windows interactive-host blocker; it was **not re-probed in this research**. An upstream harness feature does not establish that Muse's current exec adapter can provide it.

## Prioritized improvements

Effort is relative: **M** means a contained cross-layer feature; **L** means persistence, recovery or multiple integration surfaces. These are not delivery estimates. “App-owned” means MuseBench can implement it around the existing runtime; it does not imply complete visibility into native internals.

### 1. Durable session history and evidence-backed recall

**Priority: highest. Effort: L. App-owned, with native import gated by supported formats/APIs.**

Pi exposes session entries with stable cursors and a separate active leaf. Its RPC rejects unknown cursors rather than silently returning an incomplete continuation. Hermes retrieves actual messages, groups continuation lineages, and demotes repetitive scheduled conversations below interactive history. DeepSeek Harness treats SQLite full-text search as a derived index over session evidence. [Pi retrieval](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L636-L651), [Hermes recall](https://github.com/NousResearch/hermes-agent/blob/c714c42431e518fcd1c8870eff5c667d5de33b57/tools/session_search_tool.py#L354-L431), [DeepSeek query contract](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/subsystems/session-query.md).

For MuseBench, stop using the UI-sized message collection as the searchable historical authority. Append durable records with task, source session, event/message identity, timestamps and lineage; build a rebuildable FTS index. Page older messages into the existing conversation UI. Search should open the exact excerpt in context and offer **Include in next prompt**.

Keep project/date/source filters, distinguish interactive work from repetitive automation, and report index coverage. Deleted/private material must not remain discoverable through stale indexes. Preserve native IDs only when actually supplied; versioned log offsets and hashes are a different identity type. Older data already discarded by the app cannot be reconstructed unless a supported native source retains it.

**Acceptance:** find a known decision beyond 150 messages; reopen its source; deduplicate continued/forked history; survive partial records, restart and index rebuild; verify deletion propagation and project boundaries. Start with lexical search before adding embeddings or another service.

### 2. Validation profiles and workflow gates

**Priority: highest. Effort: M–L. App-owned between native runs.**

The important optimization is a reliable feedback loop: execute an appropriate check, associate it with the exact revision, then send a focused failure to the agent. Current OpenCode V2 recommends replacing its removed LSP workflows with project lint/typecheck/compiler commands. Pi's deterministic harness tests and paired eval machinery provide a useful testing discipline. [OpenCode migration guidance](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/services/www/src/docs/content/migrate-v1.mdx#L446-L452), [Pi deterministic suite](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/test/suite/README.md).

Extend MuseBench's existing trusted checks into project validation profiles: command, working directory, timeout, expected artifacts, source revision, exit code and file/line diagnostics. Workflow phases should distinguish **agent finished**, **checks passed**, **checks stale**, **manual review required**, and **blocked**.

A failing check can produce a proposed repair prompt containing the relevant diagnostic and evidence link. Optional automatic repairs need a small attempt limit, an overall budget, repeated-failure detection and priority for new user instructions. They should stop on unavailable checks rather than letting a model assert they passed. UI parity checks remain a distinct requirement for UI changes.

**Acceptance:** a model's “done” cannot advance a failed phase; edits invalidate old results; hanging checks time out and clean up; a repeated identical error stops the repair loop. This extends existing accepted-checkpoint validation rather than replacing it.

### 3. Recoverable output artifacts

**Priority: high. Effort: M. App-owned output first.**

Pi stores truncated shell output in a retrievable file; OpenCode has bounded previews and retained tool-output files; Hermes uses a head/tail collector with a capped spill file. DeepSeek's spill contract separates storage from the preview policy and preserves inline content if saving fails. [Pi shell output](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/src/core/tools/bash.ts#L333-L395), [OpenCode output store](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/core/src/tool-output.ts), [Hermes collector](https://github.com/NousResearch/hermes-agent/blob/c714c42431e518fcd1c8870eff5c667d5de33b57/tools/environments/base_output.py), [DeepSeek spill contract](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/subsystems/spill.md).

Save app-owned command/check output separately from renderer state. Display a short head/tail or diagnostic excerpt with **Search captured output**, source run, exit status, bytes captured, hash and retention status. Prompts can reference a focused excerpt and retrievable artifact instead of copying large logs.

Do not label a file “full output” when capture hit a cap or native Muse already truncated it. The existing native `--max-tool-output-bytes` boundary cannot be undone by the frontend. UI truncation alone also does not reduce native model tokens. Use bounded storage, explicit expiry and restricted access for sensitive logs.

**Acceptance:** an error in the middle of a large app-owned log remains retrievable; disk failure and cap exhaustion are visible; Unicode survives boundaries; expired artifacts are clearly unavailable. Measure reruns avoided and time to find evidence, not only preview size.

### 4. Context provenance and cache-aware input assembly

**Priority: high. Effort: M for app inputs; native features separately gated.**

Pi preserves source entries while deriving model context; DeepSeek separates durable history, model-visible projections and token measurements. OpenCode's cache policy is protocol-specific, while Hermes can freeze memory at a session boundary to stabilize prefixes. [Pi projection](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/src/core/session-manager.ts#L468-L572), [DeepSeek token meter](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/subsystems/token-meter.md), [OpenCode cache policy](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/ai/src/cache-policy.ts), [Hermes memory model](https://github.com/NousResearch/hermes-agent/blob/c714c42431e518fcd1c8870eff5c667d5de33b57/website/docs/user-guide/features/memory.md).

Add an inspector showing **what MuseBench submitted**: instruction revisions, selected files, source turns, handoff summary, omissions, duplicate attachments and size estimates. Give handoffs structured fields for constraints, decisions, unresolved questions, verified artifacts and next steps, with links back to original evidence.

Make app-owned prompt serialization deterministic. Avoid reattaching unchanged large artifacts only when the active runtime confirms retention or exposes a supported retrieval path. Use genuine native input/cache usage when available, with documented denominator semantics. Keep “app estimate,” “reported native usage” and “current native context unknown” distinct. Cache-read counts may overlap input counts; cumulative usage is not current context occupancy.

Do not add speculative paid cache warming, change invisible provider cache markers, or market local trimming as native compaction. Full compaction should preserve originals and be evaluated for lost constraints once the native interface works.

**Acceptance:** exact submitted input can be inspected; omission is explicit; edited source files change the receipt; repeated stable inputs serialize consistently; missing usage is unknown rather than zero. Evaluate fact retention after handoff before claiming a token-saving win.

### 5. Selected-file restore, redo and conversation lineage

**Priority: high. Effort: L. App-owned at run boundaries.**

OpenCode captures worktree snapshots and supports path-scoped restore with staged revert/redo. Pi distinguishes tree navigation, branching and cloning. These are separate concepts: changing conversation ancestry does not restore files. [OpenCode snapshots](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/core/src/snapshot.ts), [revert](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/core/src/session/revert.ts), [Pi sessions](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/docs/sessions.md).

Extend MuseBench's existing captured checkpoints with a diff, selected-file restore and a pre-restore redo capture. Check current file hashes and require an idle writer before restoring. Preserve unrelated edits and Git staging state; make missing, oversized or uncaptured files explicit. Add source-turn links to existing branches/handoffs so alternatives can be compared without replaying every branch into context.

**Acceptance:** restoration detects concurrent edits, handles added/deleted/renamed files deliberately, survives interruption and supports redo. Filesystem restoration cannot reverse emails, package publication, database writes or other external effects. App run-boundary checkpoints are not native per-tool snapshots.

### 6. Reviewed lessons and project knowledge

**Priority: high. Effort: M. App-owned review; native activation must be evidenced.**

Hermes can stage knowledge writes for approval; unattended memory patch/remove proposals are always staged. Staged mutations pin the original entry so approval cannot mutate a newer version by accident. Its learning UI also separates genuinely taught/used skills from merely mounted external skills. [Review restrictions](https://github.com/NousResearch/hermes-agent/blob/c714c42431e518fcd1c8870eff5c667d5de33b57/agent/background_review.py#L1092-L1132), [memory mutation guard](https://github.com/NousResearch/hermes-agent/blob/c714c42431e518fcd1c8870eff5c667d5de33b57/tools/memory_tool.py#L64-L194), [learning provenance](https://github.com/NousResearch/hermes-agent/blob/c714c42431e518fcd1c8870eff5c667d5de33b57/agent/learning_graph.py#L207-L243).

Add **Save project lesson** after a useful fix: propose a concise rule, evidence link, applicability, validation command and destination. Show a diff and require explicit acceptance; reject stale content hashes. A repeated, validated procedure can become a skill through the existing reviewed import path.

Muse already documents private and shared native memory, including `.agents/memory/`. Build around supported native memory and the existing saved-instructions/skill surfaces instead of creating another automatic memory system. Show saved/imported/observed-loaded states separately; a load receipt does not prove the agent followed the advice. [Muse configuration](https://dev.meta.ai/docs/muse-code/configuration).

A searchable Knowledge view with origin, scope, last validation, expiry/revocation and conflicts is more useful initially than an animated learning graph. Background lesson generation is an additional model call and should be opt-in and budgeted.

**Acceptance:** wrong/stale lessons can be rejected and revoked; user-authored instructions remain intact; accepted lessons retain source links; duplicate or contradictory proposals are surfaced. Test whether lessons help held-out tasks before presenting “learning” as improved competence.

### 7. Durable execution and delivery receipts

**Priority: high for reliability. Effort: L. App-owned with explicit native uncertainty.**

Hermes distinguishes scheduled occurrence, execution result and delivery result, with an explicit unknown state for ambiguous crashes. OpenCode persists execution claims and recovers orphaned attempts. Pi distinguishes prompt acceptance, low-level run end and eventual settlement. [Hermes execution ledger](https://github.com/NousResearch/hermes-agent/blob/c714c42431e518fcd1c8870eff5c667d5de33b57/cron/executions.py), [OpenCode execution](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/core/src/session/execution.ts), [restart recovery](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/core/src/session/execution/restart.ts), [Pi RPC lifecycle](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/docs/rpc.md#L58-L89).

Persist intent before dispatch, then record app request ID, process identity, native session/run identity when available, executable version, observed progress, terminal result and notification delivery. Recover from those receipts instead of inferring completion from process disappearance. Retrying a failed notification must not rerun a completed task.

For app-owned schedules, define overlap, missed occurrences, sleep/resume and DST behavior. Do not imply these mechanisms manage Meta's embedded scheduled jobs unless a supported API exists. When native tool outcome is ambiguous, retain **unknown** and reconcile; don't automatically repeat a possible external side effect.

**Acceptance:** inject crashes before dispatch, after dispatch, after result and before delivery; verify no silent loss or automatic duplicate side effect. A durable queue can support at-least-once delivery, but it cannot guarantee exactly-once external operations.

### 8. Bounded goal continuation

**Priority: medium-high after validation and receipts. Effort: L. App-owned between runs.**

DeepSeek's goal driver uses durable goal revisions, waits for idle work, yields to human input, caps rounds, and disarms continuation after restart until explicit resume. Its model still judges completion; that is not an independent correctness oracle. [Goal contract](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/subsystems/goal.md), [round driver](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/goal/goal-round-driver/README.md).

Turn MuseBench's goal metadata into an opt-in controller that schedules the next bounded run only when the previous run and cleanup are settled. Track remaining checks, total budget, attempts, repeated failures and user corrections. Require evidence for machine-checkable completion; reserve manual approval for genuinely subjective criteria.

**Acceptance:** no simultaneous duplicate continuation; cancellation is authoritative; user prompts take priority; stale goal revisions cannot restart work; restart requires deliberate resume; unknown outcome, authentication failure or repeated unchanged failure stops the loop. This is useful autonomy without claiming unavailable native live steering.

### 9. Specialized review roles and explicit execution contracts

**Priority: medium. Effort: M–L. App-owned orchestration first.**

OpenCode defines focused primary/child roles with permission and step policies. Hermes derives delegation budgets, refuses unsupported explicit routes, and treats Git worktrees as optional collision isolation. [OpenCode roles](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/core/src/plugin/agent.ts), [agent policies](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/services/www/src/docs/content/agents.mdx), [Hermes delegation](https://github.com/NousResearch/hermes-agent/blob/c714c42431e518fcd1c8870eff5c667d5de33b57/tools/delegate_tool.py#L592-L620), [Hermes isolation boundary](https://github.com/NousResearch/hermes-agent/blob/c714c42431e518fcd1c8870eff5c667d5de33b57/SECURITY.md#L32-L119).

Start with one focused investigator or independent reviewer using existing background runtimes/worktrees. Give it a concrete question, budget, input revision and required evidence. Return structured findings, changed artifacts and unresolved questions; require explicit integration of its result. A separate reviewer is distinct from the current workflow's self-review.

Expose host, workspace, native sandbox status and supported controls. A prompt saying “read only” is not filesystem enforcement; a worktree is not a security sandbox. Reviewed MCP processes, plugins and hooks may execute outside a terminal sandbox. Fail clearly when a required capability is unavailable.

**Acceptance:** reviewer cannot silently consume stale code as current; budgets aggregate; parent/child failure is distinguishable; unsupported native child messaging is not shown as operational. Compare one reviewer against no reviewer before introducing an agent swarm.

### 10. Semantic code tools and progressive tool discovery

**Priority: medium; validate against task needs. Effort: L. Native tool exposure requires a supported extension path.**

DeepSeek documents four narrow LSP operations: definition, references, implementation and hover, with bounded results and workspace-aware identities. Pi can search tool schemas and defer loading selected tools until a later request. Both patterns can reduce irrelevant information, but add lifecycle and correctness concerns. [DeepSeek LSP](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/subsystems/lsp.md), [Pi MCP exposure](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/docs/mcp.md#L190-L234).

Begin with compiler/linter diagnostics from item 2. If evaluations show grep-based navigation misses cross-file semantics, add one language-server integration with explicit server startup, version, workspace trust, timeouts and memory limits. A reviewed MCP integration is a candidate because Muse documents that extension surface; it still needs a working native proof. [Muse extension guide](https://meta-models.github.io/muse-code-sdk/next/guides/extend/).

For a large tool catalog, display relevant tools/skills by task and inspect their schemas without automatically attaching every schema to every request. Actual dynamic model-tool exposure is runtime work, not a frontend filter. Keep authorization at dispatch even when tool descriptions are cached.

**Acceptance:** correct results across renamed files and worktrees; stale server state is invalidated; oversized results are bounded and retrievable; unsupported routes are visible. Do not automatically install arbitrary language servers to match a feature count.

### 11. Event delivery and frontend performance

**Priority: medium, profile first. Effort: M–L. App-owned.**

OpenCode separates event delivery from UI state, uses bounded feeds with explicit overflow, reconnect invalidation, batching and bounded timeline caches. DeepSeek makes the append-only session log authoritative while streaming incomplete chunks separately. [OpenCode feed](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/server/src/event-feed.ts), [client synchronization](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/client/src/solid/connection.ts), [timeline cache](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/app/src/session/timeline/cache.ts), [reconnect synchronization](https://github.com/anomalyco/opencode/blob/0b050ac5cdd995ba8165e0699d4150b3409cfe51/packages/app/src/runtime/server/server-sync/connection.ts), [DeepSeek architecture](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/architecture.md).

Measure MuseBench with long histories, large logs and four active tasks. If persistence and full-state updates dominate, append durable lifecycle events separately, coalesce disposable text-progress updates, virtualize timelines and publish only relevant task projections. Preserve terminal, cancellation and pending-input transitions immediately. On overflow/reconnect, request an authoritative state refresh rather than silently missing events.

**Acceptance:** bounded renderer memory, stable typing/scrolling under load, measured event-to-paint latency, no lost terminal states and deterministic reconnect. Current performance concern is a source-derived hypothesis, not a measured lag diagnosis. Keep the shared React components; there is no evidence supporting a SolidJS/Effect rewrite.

### 12. Runtime capability contract, not a wholesale replacement

**Priority: enabling architecture; alternative backend is exploratory. Effort: L.**

Pi offers a subprocess RPC interface and an SDK with explicit session ownership. DeepSeek separates reusable capabilities and shared runtime profiles. Borrow their clear boundaries: prompt acceptance, event stream, cancellation, history retrieval, usage provenance and optional steering/compaction/child controls. [Pi SDK](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/docs/sdk.md), [Pi RPC](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/docs/rpc.md), [DeepSeek architecture](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/architecture.md).

Keep Muse as the default. Strengthen adapter conformance tests and expose only capabilities validated for that adapter/host. An experimental Pi adapter could test features unavailable in Muse's current host, but it would have independent authentication, provider terms, session formats, tool permissions and Windows requirements. It cannot be assumed to reuse the user's Muse subscription or preserve native Muse sessions.

Do not turn every feature into a plugin, hot-load model-written executable extensions, or replace the runtime merely because another README has more features. Typed result envelopes and explicit optional capabilities provide most of the architectural value incrementally.

## How to prove an improvement

A recent component-ablation paper reports that harness effects depend on model and task: structured tools and task-specific agents can help, while compression or generic subagents can hurt repository-generation tasks. Those are results for its tested models/harnesses, not a projected MuseBench gain. [Beyond the Model](https://arxiv.org/abs/2609.32459).

A separate paired study on a private 80-task suite did not establish an overall resolved-rate advantage and warns that inconsistent/missing usage accounting undermines cost comparisons. It reinforces the need to measure our own workloads. [Harness or Model?](https://arxiv.org/abs/2609.11987).

Extend the existing deterministic tests and live smoke runner rather than replacing them:

| Evaluation | Suggested cases | Evidence and decision rule |
| --- | --- | --- |
| History/recall | Old decision, repeated cron noise, forked attempt, exact error/path | Exact source retrieval, coverage, wrong-project leakage, time to evidence |
| Coding quality | Small bug, multi-file refactor, broken build, unfamiliar repository | Held-out tests, unintended diff, independently verified completion |
| Long tasks | Handoff after many turns, changed requirement, stale context | Constraint retention, source fidelity, repeated work, completion rate |
| Recovery | Crash after dispatch, output cap, lost notification, restart | Duplicate effects, lost prompts, truthful unknown states, recoverability |
| Usability | Large transcript, four runs, review/restore, diagnostics | Input/event latency, peak renderer memory, task success in the shared UI |

Start with approximately 12–20 representative tasks and at least three repetitions per behavioral condition. Hold model/version, effort, repository snapshot, permissions, budgets and instructions constant except for the feature under test. Alternate run order and report warm/cold conditions. Use separate disposable execution environments for model-driven changes; a Git worktree alone is not containment.

Report completion quality, latency, tool/model calls, reported tokens, known costs and failures together. Keep missing usage and ambiguous outcomes visible; do not discard failed arms. Pi's eval reporter explicitly withholds headline lift for an evaluation set when paired arms are missing, duplicated or unscored—a useful standard to adopt. [Pi eval methodology](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/evals/README.md), [paired-result validation](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/evals/src/report.ts#L249-L400).

Pass deterministic regression tests before paid comparisons. Set an explicit experiment budget before running real model arms. No claim of “20% smarter,” token savings or speedup is justified by these source inspections alone.

## Delivery sequence and preview parity

**Foundation:** evaluation fixtures, durable history/FTS, captured-output artifacts, execution identity schema. This addresses the strongest verified local gaps.

**Useful daily workflows:** validation profiles and phase gates, context receipts, reviewed lessons, checkpoint restore/redo. Reuse the existing controller, documented native-memory workflows, skill imports and file-review UI.

**Long-running reliability:** recovery ledger, bounded goal driver, focused reviewer roles, measured UI/event improvements. Build on the earlier receipts and validation results.

**Experiments:** semantic code tools, deferred tool exposure and an optional runtime adapter. Native compaction/live steering remain separate capability milestones requiring real runtime tests.

Each feature should have a focused commit, relevant automated checks and its own GitHub push when implemented. Shared frontend components and bridge contracts must cover desktop and preview. Add preview fixtures for success, stale, failed, unknown, truncated and empty states. Extend parity scenes for the new controls; then separately prove native behavior. A visual match does not prove execution, and embedded website snapshots remain read-only captures that may age.

The four inspected roots use MIT licensing; preserve copyright/permission notices if copying substantial source. Dependency, asset, skill and provider terms are separate. Prefer adapting the mechanisms to MuseBench's architecture over transplanting whole frameworks.

**Immediate recommendation:** begin with durable evidence/search and validation gates, supported by an evaluation baseline. They address confirmed gaps and make relevant evidence easier to retrieve, verify and include in app-submitted handoffs. They remain useful regardless of which native runtime becomes available later.
