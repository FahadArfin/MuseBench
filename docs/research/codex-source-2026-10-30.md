# Public Codex source: selected MuseBench improvements

Analyzed 30 October 2026 against [OpenAI Codex a795f961](https://github.com/openai/codex/tree/a795f961be68383738e56ac396742b3e8451696a). MuseBench baseline: `103df231cb1367b405376291650578fa40f30dac`, installed release 0.2.259. The public repository includes the native agent, CLI/TUI, app-server and reusable protocol/tool machinery. It is not a grant of access to OpenAI-hosted accounts, models or proprietary desktop/cloud services.

The comparison read actual pinned source, current MuseBench source and the existing roadmap. Three independent focused reviews covered context/skills, runtime/UI transport, and extensions/permissions; the parent reviewed composer, output capture, current state and delivery boundaries. Baseline unit verification: 1,977 passed, one existing skip, zero failures (56.284 seconds). No upstream code was executed, model request made, personal configuration changed or performance gain inferred from source alone.

## Selected for implementation

| ID | What users gain | Upstream pattern | Confirmed MuseBench gap |
| --- | --- | --- | --- |
| CS01 | Edited or cleared saved instructions explicitly supersede older app settings on the next request | [Instruction replacement/removal](https://github.com/openai/codex/blob/a795f961be68383738e56ac396742b3e8451696a/codex-rs/core/src/context/world_state/agents_md.rs#L48) | Empty settings currently disappear from the next prompt without retiring their earlier native-session text. |
| CS02 | Useful text remains when a connector returns an oversized result | [Bounded output previews](https://github.com/openai/codex/blob/a795f961be68383738e56ac396742b3e8451696a/codex-rs/utils/output-truncation/src/lib.rs#L71) | Above 128 KiB, the gateway currently returns only an outcome/omission receipt. |
| CS03 | Native automation distinguishes a changed screen from unfinished animation | [Request lifetime and delivery acknowledgement](https://github.com/openai/codex/blob/a795f961be68383738e56ac396742b3e8451696a/codex-rs/app-server/src/outgoing_message.rs#L907) | Navigation waits on every finite document animation and has no semantic destination receipt; the main reply path lacks an independent deadline check. |
| CS04 | A busy or reloading desktop cannot build an unbounded queue of old screen updates | [Slow-consumer handling](https://github.com/openai/codex/blob/a795f961be68383738e56ac396742b3e8451696a/codex-rs/app-server/src/transport.rs#L141) | Producer updates are coalesced, but Electron delivery has no consumption acknowledgement or in-flight bound. |
| CS05 | Tool approval cards identify the selected source and actual requested tool | [Source-specific approval parameters](https://github.com/openai/codex/blob/a795f961be68383738e56ac396742b3e8451696a/codex-rs/core/src/mcp_tool_call.rs#L1711) | The generic wrapper/raw argument view obscures these identities inside JSON. |
| CS06 | Project MCP review explains which file supplies each effective setting | [Layered configuration origins](https://github.com/openai/codex/blob/a795f961be68383738e56ac396742b3e8451696a/codex-rs/config/src/config_layer_source.rs#L4) | Current effective values and file inventory are separate; field-to-source associations are absent. |

These are independent MuseBench adaptations, not direct Rust ports. [Design](../superpowers/specs/2026-10-30-codex-source-adaptations-design.md) and [implementation plan](../superpowers/plans/2026-10-30-codex-source-adaptations.md) define exact bounds and evidence gates. Source inspection supports the gaps; tests and later installed receipts determine delivered status.

## Important decisions

CS01 uses a complete bounded snapshot rather than a transition database. Full current text remains included after compaction; an app digest cannot prove that Muse still retains instructions. Removal notices do not erase history or certify obedience. CS03 separates semantic navigation from optional visual settling without claiming the cause of an intermittent personal-app timeout. CS04 bounds presentation only and does not stop or reconnect model work. CS05 adds no approval authority. CS06 does not change native configuration precedence.

## Already present

MuseBench already has persistent native sessions, fresh linked side chats and forks, worktrees, explicit queues/steering, checkpoints and run-linked review, imports, local schedules, activity notifications/inbox, background ownership, cached chat navigation, transcript windowing, source/context receipts, native compaction/occupancy, reviewed recent excerpts, instruction hierarchy inspection, lazy skill visibility, curated/community extension catalogs, digest-bound MCP/plugin/hook review, on-demand tool discovery and app-owned hosted OAuth. These are not claimed again as new Codex-inspired deliveries.

## Not selected / concrete prerequisites

- **Installed-extension update comparison:** a valuable future maintenance flow, but Apply needs a qualified reversible official CLI replacement/recovery contract and a trustworthy installed baseline. Existing explicit staging/review/install remains. This pass does not promise auto-update or silently preserve old capability grants.
- **Earlier runtime snapshot-copy optimization:** plausible source-level extra work exists before the existing 40 ms coalescer; measure its contribution after bounded renderer delivery before adding another subscription architecture.
- **Native deferred schemas, context-retention tuning, native summary replacement, individual process stdin/kill handles and additional hook events:** need a supported, observed Muse contract. Codex's implementation cannot establish one.
- **Hidden memory mining, cache prewarming or scheduled evaluation:** consume model allowance or alter retained user context; require a separate design/authorization. No such request is made here.
- **OpenAI-specific auth, cloud tasks, model cache keys and hosted connector entitlements:** not transferable to Muse by copying source.

## Detailed comparisons

- [Context, skills and output boundaries](codex-context-2026-10-30.md)
- [Runtime, transport and native UI lifecycle](codex-runtime-2026-10-30.md)
- [Extensions, approvals and configuration](codex-extensions-2026-10-30.md)

Official documentation cross-checks: [App server](https://learn.chatgpt.com/docs/app-server), [Skills](https://learn.chatgpt.com/docs/build-skills), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md). The source commit is the authority for the specific implementation patterns above; current product documentation may evolve independently.
