# Muse Code harness capabilities and implementation roadmap

Research date: 26 October 2026. Application baseline: `43a05c8`. Installed Muse Code: `1.4.13-R6996.1`; SDK: `1.4.13`.

MuseBench can expose substantially more of Muse Code. The largest opportunity is durable sessions and independent background runs, followed by worktree management, agent controls, and discoverable skills. Adding controls before the underlying runtime supports them would repeat the current gap between a chat interface and an independent native run.

This is an implementation assessment. The proposed features below are not enabled by this document. Existing code, installed CLI help, official documentation, and bounded local probes inform the recommendations; the probes made no model calls.

## Current support and the missing pieces

| Area | What MuseBench already does | Useful addition | Feasibility |
| --- | --- | --- | --- |
| Conversation continuity | Replays bounded messages, project guidance, objectives and selected files | Resume the actual native session, with durable IDs and recovery | Investigate durable exec first; persistent MSP is another route |
| Messaging while working | Saves and reorders queued prompts | Deliver corrections to the running turn, with delivery status | Requires a validated live runtime connection |
| Background chats | Code controller owns one active runtime and blocks navigation during a run | Keep several chats running while browsing other chats | Requires a task runtime registry and ownership controls |
| Worktrees | Can open an existing worktree as a folder; slash command is informational | Create an isolated branch per task, show its changes, retain or recover it | App-owned Git integration is feasible on Windows |
| Agents | Displays supported native activity; folds bounded workflow handoffs | Inspect children, send follow-ups, stop a child, see worktree and usage | Needs negotiated native event and command support |
| Workflows | Recognizes correlated workflow handoffs and reporting continuation | Saved workflow library and phase/child control panel | Library is feasible; execution/control support is gated |
| Skills | Lists skills, supports activation, local installation and creation | Curated shortcuts, source/trust diagnostics and reliable invocation | Mostly feasible in the existing Customize architecture |
| Visual prompts | Includes selected text files | Paste, drop or attach screenshots to Code chats | Native exec exposes image input; implement and validate transport |
| Long tasks | Defaults to eight model steps and a three-minute run limit | User-visible task budgets and longer profiles | Feasible, with cancellation and process cleanup preserved |
| Questions and approvals | Windows exec disables request-user-input; approval requests stop execution | Answer questions and approve a specific pending operation in the app | Requires an interactive runtime and correlated request handling |

The application uses `createExecRuntime` on Windows in [electron/main.mjs](../electron/main.mjs). [src/runtime/exec.mjs](../src/runtime/exec.mjs) starts a new process for every request, passes `--no-session-log`, and disables web tools, reminders, request-user-input and hooks. Shell commands are allowed only through the supported managed route. Configuration limits permit at most 16 model steps and still cap runtime at three minutes; the application defaults to eight steps.

[src/shared/chat-context.mjs](../src/shared/chat-context.mjs) supplies at most 64,000 characters of context, including up to eight selected text files with 24,000 characters combined. This is useful conversation replay, but it does not restore native tool/session state. [src/controller/index.mjs](../src/controller/index.mjs) owns the foreground Code run and navigation gate. The existing queue is sequential, not mid-turn steering.

## Durable sessions and true live steering

The documented MSP interface supports starting a turn with an explicit busy disposition and steering a specific active turn. Use an expected turn ID and a unique command ID so a correction cannot accidentally land in a newer turn. Accepted input and completed processing are different states; the UI should show that distinction. [Queue and steer cookbook](https://meta-models.github.io/muse-code-sdk/next/cookbook/queue-steer-and-reclaim-turns/), [turn steer contract](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/turn-steer/).

The current Windows limitation is confirmed locally: native Windows sandbox readiness passed, but the same installed binary's MSP initialization reported sandbox unavailable. No session was created. An open upstream report describes a similar Windows mismatch; it does not establish the root cause of this machine's result. Bypassing the sandbox is not an acceptable fix. [Upstream issue 107](https://github.com/meta-models/muse-code-sdk/issues/107).

A smaller migration may be possible first. Two isolated `exec --provider echo --json --session-id <same UUID>` runs completed successfully without `--no-session-log`. Their retained native session log contains both test prompts. This demonstrates repeated execution and log retention under the same session identity. It does **not** demonstrate model context recovery, restored tool state, or live steering. Installed help exposes `--session-id`; do not implement an assumed `--resume` interface merely because older changelog entries mention it. [Official changelog](https://dev.meta.ai/docs/muse-code/changelog).

Proposed sequence:

1. Add a runtime capability contract: durable sessions, live steering, queue delivery, questions, approvals, child controls, images and workspace isolation. Show the actual supported state and reason.
2. Validate durable exec using a disposable project and an explicitly authorized model test. Persist the native session ID and binding to its workspace. Test process restart, crash recovery, failed turns, cancellation and history compaction.
3. When resuming a native session, stop replaying the full synthetic history into every turn. Keep old conversations readable and migrate them explicitly so context is not duplicated.
4. Replace single foreground ownership with a registry of task runtimes. Switching chats must not cancel work or redirect events into the newly selected chat. Serialize writes to a shared checkout, or use separate worktrees.
5. Add MSP steering only after host readiness, permissions and event correlation pass. Handle queued, admitted, rejected, reclaimed and completed states explicitly.

The documented host model supports multiple sessions with per-session writer ownership. That makes background chats architecturally plausible, but does not remove the Windows readiness problem. A Linux/WSL adapter is an alternative investigation, not a ready fallback on this machine: only the Docker Desktop distribution was listed during the read-only WSL inventory. [Host operations](https://meta-models.github.io/muse-code-sdk/next/guides/host-operations/).

## Session messaging and agent messaging are different

Native session messaging connects separate live sessions owned by the same user on the same machine. Official support is macOS/Linux; Windows and headless/no-session-log sessions are excluded. Delivery can steer, queue or notify, and recipient admission matters. A received message cannot grant tool approval or consent. [Session messaging](https://dev.meta.ai/docs/muse-code/session-messaging).

We can still build an app-owned **Send context to another chat** action on Windows. It should identify the sender, show the exact text and file references, and queue the handoff for that chat's next run. Label it as a context handoff, not native live messaging. Peer text must remain attributed data rather than silently becoming a new human authorization.

Parent-to-child agent messaging is a separate interface. Experimental MSP subagent messaging acknowledges admission, while subsequent stream events establish execution. Feature detection and exact target IDs are required. A chat row alone is not evidence of a running child. [Subagent messaging contract](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/subagent-sendmessage/).

Useful agent UI would show the task, actual state, latest output, elapsed time, usage, working directory and parent. Actions should distinguish **Stop this agent**, **Stop its descendants**, and **Stop the whole task**. Cancellation is cooperative; keep a stopping state until native termination and process cleanup are confirmed.

## Worktrees and workflows

Worktree management is one of the best additions that does not depend on solving MSP. Offer **Use current folder** and **Create isolated worktree** when starting a Code task. Show branch/base selection, setup commands, the worktree location and whether the starting point includes uncommitted work. Never silently carry dirty changes or assume the current branch equals the remote default.

Implement this as a Git service with task ownership and persisted metadata. Keep commit/review separate from merge. Retain finished worktrees until the user archives or removes them; preserve a recoverable snapshot and verify the exact target before cleanup. Handle locked worktrees, detached HEADs, missing branches, submodules, failed setup and application restart. A worktree needs its own dependencies; creating it does not make it runnable.

Native subagents share a checkout unless isolation is requested. The CLI's `--subagent-worktree-isolation` compatibility flag does not itself force every child into isolation. We must verify the actual requested child working directory and isolation result. [Extending Muse Code](https://dev.meta.ai/docs/muse-code/extending).

Workflow support is already partly implemented. [src/runtime/exec-conversation-events.mjs](../src/runtime/exec-conversation-events.mjs) validates correlated background handoffs, waits for their terminal outcomes and supports bounded reporting continuation. It limits handoffs to four and only one outstanding continuation. It does not provide arbitrary concurrent child streams or a full control panel.

Official workflows add reusable orchestration, saved JavaScript workflows, phases and child management. Project workflows live under `.agents/workflows`; trust and discovery at launch affect availability. Ephemeral execution limits recovery. [Workflow documentation](https://dev.meta.ai/docs/muse-code/workflows).

The installed CLI exposes workflow list/save operations, but its run/recover help marks that execution lane as QA-only. Do not ship it as a stable public execution API. Build a library first and gate launch/control actions on validated capabilities. Experimental child controls target both child ID and attempt, avoiding accidental actions against restarted children. [Workflow child control](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/workflow-childcontrol/).

Suggested workflow templates, once execution is validated:

- **Implement and verify:** plan, implement in an isolated checkout, run checks, independently review, present changes.
- **Investigate a bug:** reproduce, inspect likely causes in parallel, synthesize evidence, implement one justified fix.
- **Review a change:** parallel correctness, security and test-coverage reviews with one consolidated result.
- **UI parity review:** compare desktop and browser preview at matching sizes and exercise shared interactions.

Templates must declare budgets, writable paths and completion checks. Independent reviewers should not race to edit the same files. Saved workflow code is executable configuration that should be visible and versioned.

## Default skills and discoverability

The installed CLI reported 25 bundled skills, all activated as `on`, with no catalog diagnostics:

| Purpose | Installed skill IDs |
| --- | --- |
| Plan and challenge requirements | `plan`, `grill`, `requirements-clarification` |
| Build and refine interfaces | `browser-app-delivery`, `visual-coding`, `taste`, `table-fit` |
| Games and 3D | `browser-game`, `blender`, `game-3d-visuals`, `web3d` |
| Project and development support | `greenfield-project-scaffolding`, `git`, `python-env`, `durable-test-collateral`, `doctor` |
| Configure and extend Muse | `create-plugin`, `create-skill`, `manage-settings`, `workflow-authoring` |
| Import and continue context | `import`, `migrate`, `read-session`, `resume-claude`, `resume-codex` |

These groups are proposed navigation, not official categories. Prefer the installed catalog over a hardcoded list; public documentation and future releases may differ. Official skill discovery includes scope, trust and activation rules. [Skills guide](https://meta-models.github.io/muse-code-sdk/next/guides/extend/skills/).

MuseBench already has substantial management in [electron/customize.mjs](../electron/customize.mjs), [CustomizeDialog.tsx](../src/ui/CustomizeDialog.tsx), and [docs/CUSTOMIZE.md](CUSTOMIZE.md): local skill installation/creation, activation, reviewed plugin installation and reviewed MCP configuration. Rebuilding these would waste effort.

Improve this existing surface with:

- A small favorites list above the full catalog: Plan, Challenge requirements, Build frontend, Review with Git, Create skill and Author workflow, mapped to their actual installed IDs.
- Skill details showing source, scope, activation, diagnostics and whether the current runtime can load it. Separate skill selection from app slash commands such as `/plan`.
- A verified invocation path. Current [skillPrompt](../src/shared/slash-commands.mjs) only adds an instruction to use the named skill; it does not prove the loader used it. Show an invocation receipt only when native evidence exists.
- Catalog/runtime parity. The exec adapter excludes foreign personal context, while the catalog query does not apply the same filter. Workspace trust can also differ. Avoid advertising a skill as available merely because a listing command found it.
- Import preview and provenance for user-selected external skills, rather than installing or copying all skills automatically.

Project trust deserves specific work: the current exec configuration check rejects saved trust and project MCP files, while allowing reviewed user-level MCP entries and reviewed plugin inventory. This can prevent project extensions from being usable even when Customize can describe them. Any expansion must validate the trust model and supported configuration together rather than merely remove the rejection.

A later MuseBench-specific skill pack could contain `review-change`, `fix-failing-check`, `release-check`, `ui-parity-review` and `repository-onboarding`. These are proposed additions, not installed skills. Start with a few that use real app capabilities and prove their value before adding more.

## Other high value improvements

**Screenshot attachments:** the installed exec help supports `--image <PATH>`. Add clipboard/drop input, persisted attachment identity, size/type limits, removable thumbnails and transport tests. This directly supports the visual feedback used to build MuseBench. Browser preview should represent the same attachment state without pretending it executed a native model request.

**Task budgets:** expose the current limits and offer bounded longer profiles. Separate wall time, model steps and token budget. Preserve explicit stop, descendant cleanup, output limits and failure handling; simply raising every cap is not sufficient.

**Questions and approvals:** model pending requests individually by session, turn and request ID. Support several pending questions across agents without overwriting one another. Approval must refer to the exact operation displayed. The Windows exec route cannot provide this merely through a new modal.

**Context and usage:** show omitted history/files, native context usage when available, and the effect of compaction. Current `/compact`, `/goal`, `/side` and `/plan` behavior should not be presented as equivalent to native compaction, autonomous goal loops, live side conversations or enforced read-only planning. The official interactive CLI has richer controls. Native rewind affects conversation history; file restoration needs a separate, conflict-aware mechanism. [Interactive CLI](https://dev.meta.ai/docs/muse-code/interactive).

**Web, hooks and model selection:** these are secondary to session reliability. Web tools and hooks are currently disabled deliberately. Add explicit capabilities and reviewed configuration before enabling them. A native model picker is feasible where the selected runtime supports it; do not assume every provider/model accepts every reasoning level. [Configuration](https://dev.meta.ai/docs/muse-code/configuration).

## Recommended implementation order and acceptance checks

| Phase | Deliverable | Required proof |
| --- | --- | --- |
| 1 | Runtime capability display, skill catalog parity, screenshot inputs and explicit run limits | Installed runtime agrees with UI; unavailable skills have a reason; image reaches native input; timeout/stop cleanup still passes |
| 2 | Durable exec experiment and task session binding | Real model retains prior context across processes; no duplicate replay; restart/cancel/failure recovery; old chats remain readable |
| 3 | App-owned worktree lifecycle and background task registry | Concurrent isolated tasks cannot cross-write or misroute events; branch/base/dirty state explicit; restart and archive recovery tested |
| 4 | Validated live MSP adapter, steering and interactive requests | Sandbox ready; exact-turn steering; idempotent retries; stale target rejection; multiple approvals/questions remain correlated |
| 5 | Agent control panel and reusable workflows | Real child events, attempt-specific controls, budget accounting, cancellation and recovery; no QA-only command shipped as stable |
| 6 | Native peer messaging where supported, or clearly labeled app context handoffs | Recipient admission, sender attribution, duplicate handling and unsupported-platform behavior |

For implementation, reuse the shared UI between desktop and browser preview. Preview fixtures should identify simulated runtime events; embedded website snapshots remain read-only as already chosen. Verify desktop behavior independently of preview appearance. Preserve existing completion provenance, review baselines, sandbox checks and process cleanup throughout the migration.

## Verification evidence

The local host probe reported native sandbox readiness but MSP sandbox unavailability on Muse `1.4.13-R6996.1`. It made no model call and created no session. Separate echo-provider probes ran under isolated temporary configuration/data roots and a disposable workspace; both completed and their shared native log retained both prompts. No user credentials were inspected or changed.

Local ignored evidence is retained under `artifacts/muse-research/`, `artifacts/muse-research-host.txt` and `artifacts/muse-install/verification.json`. These are machine diagnostics, not portable acceptance tests. The echo experiment requires a real-model follow-up before persistent context can be called supported.

SDK documentation under `/next` describes experimental interfaces as well as stable ones. Each implementation must check the installed schema and runtime readiness instead of treating a documentation page or accepted command as proof that the whole feature works.
