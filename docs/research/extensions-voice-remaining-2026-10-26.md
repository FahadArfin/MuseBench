# Remaining voice, extensions, discovery, and alternate-host research

**29 October settings compatibility correction:** a fresh, isolated Muse 1.4.14 host rejects `settings.json` without `schema_version`. Customize now defaults this to `1` at its reviewed atomic-write boundary, including older app-created files with the marker absent. Existing explicit markers, unrelated settings, backups and concurrent-write checks are preserved; discovery does not migrate files. `node scripts/customize-settings-probe.mjs` reproduces the native failure before the correction and verifies pinned-host initialization after it, without credentials or model requests. This proves settings acceptance, not MCP tool execution.

The same day's disposable project experiment recognized both user MCP spellings through the native CLI's stdio/OAuth rejection, but idle `mcpServer/list` calls returned empty sets for those user settings and trusted project `.mcp.json` fixtures. No server process started before a turn. Consequently, that observation establishes neither project tool loading nor its absence during a model turn. Project/ancestor/managed guards remain in place pending execution evidence; no native project support was enabled from this probe.

**27 October implementation update:** the session-scoped semantic MCP gateway is implemented; see [configuration and acceptance](../WORKSPACE-MCP.md). Reusable app-owned hook presets are also implemented in Customize > Hooks > Reusable presets. Templates are local, limited to 20 entries, and use the existing six-hook/event/timeout validator. Loading a preset edits a draft and clears its review checkbox. Only an explicit project review/save grants those commands; preset edits/deletion do not change any project's grant. Revision hashes, atomic writes and exclusive save locks reject stale/concurrent writes. Six storage/service/preview tests and shared renderer parity cover these boundaries. These changes do not enable arbitrary native project/global/managed configuration.

Read-only investigation on 26 October 2026. Only this research note was written. No native model runs, provider configuration, credentials, settings mutations, or desktop interaction were performed. Findings distinguish published contracts, installed SDK evidence, and implementation proposals; none establishes a live feature pass.

## Recommended order

1. Probe session-scoped MCP on the pinned Muse host with an inert local fixture; this can add reviewed tools without changing global configuration.
2. Evaluate a bounded MCP `list_changed` fixture before claiming dynamic model-schema discovery.
3. Extend reviewed configuration only after confirming each source's native parsing and precedence. Global defaults must never silently widen an existing project grant.
4. Keep read aloud labeled local system speech. No supported Muse synthesis API was found.
5. Treat Pi and Linux as separately qualified runtimes, not fallback branches that inherit Muse credentials or permission claims.

## Source and implementation baseline

`package.json` pins `@muse-code/sdk` 1.4.13. `src/runtime/exec.mjs:54` checks configuration; project `.mcp.json`, project hooks, saved native trust, unreviewed plugin inventory and managed configuration remain excluded. User MCP grants bind entry hashes in `src/runtime/extension-review.mjs`. Both exec and MSP launches replace user hooks with `hooks={}` and clear `managed_hooks_path`; exec substitutes reviewed app-owned hooks. `src/shared/native-hooks.mjs` allows only `UserPromptSubmit` and `Stop`, six entries, one-line commands, and 1–30 second timeouts. `src/runtime/index.mjs` curates the child environment rather than forwarding arbitrary credentials.

### A supported session-scoped MCP route, with a facade gap

Installed `node_modules/@muse-code/sdk/dist/src/msp.d.ts:2119` defines `SessionConfig.mcpServers`; line 2301 defines its server union. Its wire spelling is `transport: "stdio"` or `"streamableHttp"`, with optional `mode: "required" | "optional"`; stdio framing is `auto`, `contentLength`, or `lineDelimitedJson`. These are wire types, not settings-file spellings.

The official SDK guide documents requesting `sessionMcp` during initialization and supplying `config.mcpServers` on `session/start`. Names cannot collide with host or plugin servers; conflicts reject session creation. [SDK session MCP contract](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/plugins-in-sdk-sessions/).

Crucially, installed `dist/src/facade/client.d.ts:44` explicitly excludes `config` from start/resume options pending capability-check support. `client.js` omits it from `START_FORWARDED` and `RESUME_FORWARDED`. Passing an invented `mcpServers` option to `client.startSession()` therefore cannot implement this feature.

**Proposed implementation:** use the existing owned MSP connection and supported raw `connection.command("session/start", ...)`, after checking the actual `sessionMcp` grant. Keep a separate reviewed, workspace-bound server snapshot, application-prefixed names, bounded arguments and output, and exact shutdown ownership. Do not forward a source file wholesale. Maintain the normal session event fold and command reconciliation; a raw start must not create a second conflicting facade-owned session. Resume needs the same review and host contract verification, not an assumed replay of startup settings.

**Acceptance probe:** no-token fixture server exposes one deterministic read-only tool; prove negotiation and one actual tool receipt, denial when capability is absent, collision rejection, changed configuration invalidating approval, server startup failure, and owned child shutdown. Only then test a real workspace tool. Server acceptance alone is not proof that the model saw or used its schema.

## Project MCP and global hooks

The detailed MCP guide is explicitly based on Muse 1.3.0. It describes canonical settings `mcpServers`/`type`/`required`, canonical project `.mcp.json`, merged configuration, and environment expansion. It also says configuration is read once per process and warns that settings-writing commands can drop some fields. MCP programs run outside the agent shell sandbox. [Detailed MCP guide](https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/).

The current user manual instead uses `mcp_servers`/`transport`/`mode` and describes required startup as the default. The detailed guide says optional is the default in 1.3.0. MuseBench currently writes and reviews the former spelling. This is a real documentation/version disagreement: pin the runtime and probe syntax, explicit startup mode, precedence and persistence rather than mass-migrating settings. [Current extension manual](https://dev.meta.ai/docs/muse-code/extending).

**Project MCP proposal:** preview bounded source bytes and the effective merged server entry, including workspace, source paths, launch program, arguments, environment variable names and remote origin. Hash the source and normalized effective configuration; invalidate the grant on either change. Never show resolved secrets. Existing ancestor-file guards should remain until ancestor precedence is deliberately supported. An import into app-owned session MCP is narrower than allowing native project discovery, but does not by itself justify ignoring a `.mcp.json` that the host can still read.

**Global-hook proposal:** add app-owned reusable hook presets and explicitly opt projects into a reviewed snapshot. Reuse current `validateHooks()` and native serialization. Keep all existing event/timeout limits initially. A preset change must require renewed project review. This supplies reusable hooks without enabling arbitrary user or managed hook files. Importing unsupported events should produce a visible rejection, never a silent truncation.

Native hooks can originate in project, user, and managed configuration; user and managed hooks lack a separate project trust gate, and startup reload matters. There is no documented `muse hooks approve` family to delegate review to. [Hook sources and lifecycle](https://dev.meta.ai/docs/muse-code/extending), [detailed hook reference](https://meta-models.github.io/muse-code-sdk/next/guides/extend/hooks/).

**Still required for arbitrary native files:** verify actual source precedence, exact Windows command interpretation, timeout and process-tree cleanup, output effects, revoked grants, symlink/ancestor substitutions, and checks immediately before startup. Managed policy requires an explicit policy model; treating its presence as harmless because a reviewed user entry exists is incorrect. Preserve managed configuration guards meanwhile.

## Dynamic schemas: three different capabilities

1. **MCP list mutation:** the MCP specification provides `tools/list`, `tools/call`, and `notifications/tools/list_changed` when the server advertises `tools.listChanged`. This is a protocol mechanism, not proof that Muse forwards fresh definitions into the next model request. [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
2. **Native host proof still missing:** installed MSP declarations contain session MCP configuration, but the inspected declarations did not expose a model-tool registration/search method. A tool directory in the app, or a tool name in a transcript, cannot establish schema deferral. First use a fixture that adds tool B and removes tool A between turns; require native receipts for B and rejection of A, then test schema revision and grant revocation.
3. **Actual Meta API deferral exists:** the Responses API documents a `tool_search` tool alongside functions marked `defer_loading: true`, including hosted and client-executed search. This is a valid API-backed alternative, not an option proven on Muse Code's MSP transport. It needs separate provider authorization, API credentials, a bounded experiment budget and an app-owned tool loop. Do not extract Muse login tokens or substitute this for the existing subscription route. [Meta tool search](https://dev.meta.ai/docs/tool-search).

**Fallback proposal if the native fixture fails:** a reviewed local MCP server can expose a fixed search tool plus a bounded dispatcher, returning only schemas for approved tools. Every dispatch must revalidate tool identity, arguments, workspace and permissions. Label this application-level tool routing, not native schema deferral; schema text returned as ordinary tool output does not register a new model function. Never allow an arbitrary command string as the dispatch target.

## Voice: synthesis remains unavailable in the researched contract

The published catalog identifies Muse Voice Transcribe as audio-to-text, and the API overview explicitly excludes synthesis and speech-to-speech. Its ASR endpoints accept audio and return transcripts; they cannot read an assistant message aloud. No supported Muse TTS endpoint, voice-selection contract or synthesis SDK was found in the inspected primary sources. [Model catalog](https://dev.meta.ai/docs/models), [API overview](https://dev.meta.ai/docs/overview), [speech-to-text guide](https://dev.meta.ai/docs/speech-to-text).

`src/ui/ResponseActions.tsx:18` already uses browser speech synthesis, filtering voices to `localService`. That is an appropriate local fallback, not Muse-native voice. Future playback polish can remain local; do not configure a paid alternate speech provider or repurpose the ASR token flow. Native synthesis completion requires a published synthesis contract, authorized access, voice/format handling and real start/stop/error playback verification. Windows dictation availability is irrelevant to this missing output capability.

## Peer messaging and Linux

Official native messaging remains limited to eligible retained interactive sessions under one user on the same macOS/Linux host. Windows and headless surfaces are excluded. Admission, delivery receipts, deduplication and the distinction between agent data and user authorization matter. [Current native messaging scope](https://dev.meta.ai/docs/muse-code/session-messaging).

**Implementable Windows alternative:** retain app-owned context handoffs, or build an explicitly labeled local inbox with source/target identity, revision, user-controlled admission, durable receipts, byte caps and no automatic replay after an uncertain delivery. Do not inject another agent's message as if the human typed it. This is an adapter feature and does not complete native peer messaging.

**Linux option:** use an independently owned Linux runtime and authentication context. Native Linux shell containment depends on functioning bubblewrap; absence is a host failure, not a reason to silently disable sandboxing. [Muse permissions](https://dev.meta.ai/docs/muse-code/permissions). A WSL/SSH launcher alone does not make headless or `serve` sessions eligible peers. Qualify two retained interactive sessions first, then prove any proposed desktop bridge. Host readiness, paths, process ownership, session storage, auth, and cancellation all require fresh evidence; this investigation did not inspect or modify WSL.

## Pi is a genuine alternate integration, with a newer upstream surface

The former `badlogic/pi-mono` repository currently redirects to `earendil-works/pi`; upstream docs now use `@earendil-works/pi-coding-agent`. Pin a chosen revision/package before implementation rather than assuming older package identities or APIs still match.

Current SDK docs provide `createAgentSession`, explicit resource/model/tool configuration, steering, follow-up, abort and persistent session management. They distinguish `agent_settled` from an intermediate `agent_end`, and SDK sessions do not automatically install the CLI's MCP/tool-search extensions. [Pi SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md).

The checked upstream example adds `createToolSearchExtension()` and `createMcpExtension()` to a `DefaultResourceLoader`, reloads it, creates a session and calls `session.bindExtensions({})`. Codemode is separately optional for this task. [SDK example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/14-codemode-mcp.ts). Pi's MCP docs describe `deferred` exposure, list-change handling and permission hooks, so this is an actual alternative for dynamic tools, not a fabricated SDK capability. [Pi MCP](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md).

For an owned subprocess, Pi also documents a JSONL RPC mode and typed `RpcClient`; acceptance of a prompt is not completion. [Pi CLI integration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli-integration.md).

**Minimum adapter acceptance:** separate identity and storage; explicit provider setup without harvesting native credentials; reviewed resources instead of ambient extension discovery; workspace-bound tools; independently enforced approvals/containment; command correlation; cancellation/process cleanup; resume and duplicate-message behavior; fixture and live model receipts. Do not expose Pi as a silent fallback after native connection failure, and do not claim Muse permission profiles automatically apply to it.

## Research limitations

Official developer-preview pages and moving Pi `main` were inspected as of this date; they are leads for pinned-version probes. Public documentation and generated schema availability do not establish installed-host execution. No model quality, token saving, sandbox repair, paid access, peer transport, or synthesized-audio success is claimed here.
