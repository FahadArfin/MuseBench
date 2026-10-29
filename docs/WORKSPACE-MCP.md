# Workspace navigation MCP gateway

`src/runtime/workspace-mcp.mjs` is an app-owned, read-only MCP stdio server. It exposes exactly two tools:

- `workspace_tool_search({query})` searches the four navigation operation descriptions and returns their schemas.
- `workspace_tool_call({operation,path,line,column})` invokes `definition`, `references`, `implementation`, or `hover` through the isolated TypeScript semantic service.

This is a searchable gateway. Search results are ordinary tool content; they do not dynamically register native model functions or prove deferred-schema savings. The native host sees two fixed schemas.

## Workspace and process boundary

Start with a trusted Node runtime and an absolute script path:

```text
node <absolute-workspace-mcp.mjs> --root <absolute-workspace>
```

The root is validated and canonicalized at startup. A tool call cannot change it. Navigation uses one-based UTF-16 line/column positions and slash-separated relative source paths. Calls reject unknown fields, root overrides, parent traversals, absolute paths, command names and unsupported operation names. The semantic worker enforces file identity, source/byte/time bounds and project containment. No server method starts commands or network requests, loads project plugins or reads project compiler configuration.

The transport supports newline-delimited JSON, not HTTP or Content-Length framing. Input frames are capped at 64 KiB, navigation result text at 128 KiB, and pending work at eight requests including the running request. Requests execute sequentially. Oversized input or queue overflow closes the server and disposes its worker. The CLI explicitly owns its transport and destroys its pipes on hard shutdown, so an open parent stdin cannot keep the rejected server alive. Injected streams remain caller-owned unless `ownsTransport: true` is supplied. Output backpressure stops processing; EOF drains complete queued requests, ends output and disposes the worker. A partial final line closes without executing it. Errors use fixed messages and recognized semantic codes rather than native exception text. stdout carries JSON-RPC only.

## Trusted Muse session configuration

`electron/workspace-mcp-config.mjs` exports `createWorkspaceMcpConfig({appRoot, executable = process.execPath})`. The trusted main process supplies the app root and executable; the returned async function accepts only a workspace directory and returns one fixed server entry. It validates canonical absolute paths, rejects symbolic-link/junction aliases, verifies executable/script file types, and freezes the configuration. An Electron ASAR app root is accepted when Electron's filesystem layer can validate the fixed contained script.

The entry explicitly sets `ELECTRON_RUN_AS_NODE=1`, `NODE_OPTIONS=''` and `NODE_PATH=''`. This prevents launching another desktop and clears inherited Node startup hooks/search overrides. Runtime integration must retain its curated host environment rather than forwarding arbitrary environment variables. Configuring this entry still requires explicit project-bound tool consent.

The installed SDK 1.4.13 wire declarations support session MCP. Initialize the owned host with `capabilities.requestedCapabilities: ["sessionMcp"]`, then require `initializeResult.grantedCapabilities` to include `sessionMcp`. Existing compatibility, permission and process ownership checks must still pass.

After explicit workspace-bound review, the raw `session/start` command may carry this configuration:

```js
{
  workspaceRoot: canonicalWorkspace,
  config: {
    mcpServers: {
      musebench_workspace: {
        transport: 'stdio',
        command: trustedNodePath,
        args: [absoluteServerScript, '--root', canonicalWorkspace],
        env: { ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '', NODE_PATH: '' },
        framing: 'lineDelimitedJson',
        mode: 'required'
      }
    }
  }
}
```

These are MSP wire spellings. Do not paste them unchanged into user settings, which use different transport/framing spellings. Do not call `client.startSession({config: ...})`: the installed facade intentionally excludes and drops `config`. The existing owned raw connection can send `connection.command('session/start', params, {maxAttempts: 1})`, using its UUIDv7 command ID mechanism and normal admission reconciliation. Maintain event subscription before submission. The returned session must join the current session fold and shutdown owner without starting a second facade session. A missing grant or uncertain receipt is not permission to retry automatically.

The configuration creates a native process, so its executable, script, fixed workspace and effective configuration need review before activation. Names must avoid host/plugin server conflicts. Keep all existing project/managed configuration guards. MCP read-only annotations describe behavior; they do not establish OS sandbox containment.

Packaged Electron must resolve the packaged script and TypeScript dependency. The trusted factory sets Node mode explicitly. Both development Electron and the verified packaged ASAR have passed real child-process navigation tests, as recorded below. The factory does not modify user settings or silently configure other MCP servers.

## Verification

`node --test test/workspace-mcp.test.mjs` passed eight tests on 26 October 2026. They exercise initialization, tool discovery, argument rejection, split UTF-8 input, malformed JSON, notifications, frame/queue/output bounds, error redaction and invalid CLI flags. A real Node subprocess also resolves a definition through the semantic worker and exits cleanly on stdin EOF.

That subprocess is direct MCP protocol evidence, not a model tool-use receipt.

On 27 October, `node --test test/workspace-mcp-config.test.mjs` passed four additional tests: fixed configuration, invalid/canonical path rejection, script substitution via a junction, and actual Electron Node-mode child navigation plus clean EOF. `node scripts/workspace-mcp-probe.mjs --native` also passed with an isolated empty profile and zero model calls. The native runtime verified its `sessionMcp` grant, started an idle Ask me session with the required server configuration, and confirmed host shutdown. The temporary workspace was removed. No credentials were copied and no turn was submitted.

The combined gateway and factory suites passed 14 tests after the shutdown fix. Real Node and Electron child regressions send 65,537 bytes without a newline, or flood the request queue, while deliberately keeping parent stdin open. Both runtimes exit within the bounded test deadline. Separate checks preserve caller-owned streams and prove orderly EOF still delivers queued replies.

At **2026-10-27 04:29:03 UTC**, the external probe ran under `release/win-unpacked/MuseBench.exe` with explicit Node mode, `--app-root` set to its `resources/app.asar`, the packaged executable selected for the gateway child, and `--native`. Results:

- `packagedApp: true`; both `workspace_tool_search` and `workspace_tool_call` listed.
- Actual ASAR-backed semantic worker returned the fixture definition in `lib.ts` using TypeScript 5.9.3.
- Child exit code 0, zero stderr bytes, and removed temporary workspace.
- Isolated native session reached idle with workspace tools enabled and Ask me permissions verified; host cleanup was confirmed.
- Zero model calls; no existing app profile or credential files changed.

This followed the clean package byte-comparison receipt at `artifacts/personal-package-verification.json` dated **04:28:06 UTC**. An earlier package returned incorrect source bytes from its archive and was not accepted. The rebuilt artifact passed the ASAR probe without an unpacking workaround.

The original probe did not query the experimental MCP inventory. On 29 October the installed Muse 1.4.14 binary exported and served `mcpServer/list`: an isolated profile returned no global servers, then the configured session returned `musebench_workspace`, source `session`, transport `stdio`, OAuth `notSupported`. The runtime probe now verifies this row with zero model calls and confirmed shutdown. The experimental schema fingerprint was `sha256:159e01dd32c37f5ad711225aa1840dbca653e346fd83bed7f3b2b9ea49b40aa7`.

In the shared **Session → Session MCP servers** disclosure, users can read or refresh these configuration and authorization facts on demand. Closing and reopening the disclosure reuses its snapshot. The controller and runtime bind each read to the current chat, session and connection; late results cannot appear on another chat. Reads do not submit turns, change settings, publish lifecycle events, or block Stop. Names are plain text, extra fields are discarded, and the view is capped at 200 rows with omissions disclosed. Unsupported or failed reads are explicit. Preview is labeled simulated.

The API reports configuration/auth facts only. It does not enumerate model-visible tool schemas or test server/tool health. `serverInventoryVerified: true` is therefore distinct from `toolInventoryVerified: false`. Actual model search/call receipts, negative native startup cases and dynamic schema reload remain separate acceptance checks. The official [experimental inventory contract](https://meta-models.github.io/muse-code-sdk/next/generated/msp/methods/mcpserver-list/) documents the session-scoped set.

### Request metadata compatibility, 29 October

The [Muse 1.4.9 release notes](https://dev.meta.ai/docs/muse-code/changelog) document `_meta.callId` on every MCP tool call, with an idempotency key when present. MCP also permits a request metadata object on discovery. The gateway previously rejected those envelopes as unknown request fields, so a successful metadata-free direct probe did not exercise the native client's call shape.

`tools/list` and `tools/call` now accept the optional `_meta` object. It is ignored, never echoed or merged into tool arguments, and confers no permission. Non-object metadata, other unsupported request fields, invalid tool arguments and requests exceeding the existing frame bound remain rejected. Metadata is not deduplicated: these read-only queries may run again and report the current bounded disk snapshot. The server does not advertise task-augmented execution or progress notifications.

The new discovery/search/navigation regression and real Node/Electron subprocess checks reproduced `-32602` before the fix; all 17 gateway/factory tests then passed. At **2026-10-29 11:55 UTC**, the updated probe resolved `lib.ts` with native-style metadata, zero stderr and clean child exit. The isolated Muse 1.4.14 session still admitted and listed the session gateway, verified Ask me, and confirmed host shutdown and workspace removal, with **zero model calls**. Its `requestMetadataVerified: true` field describes direct protocol evidence; `toolInventoryVerified: false` remains explicit. Model-issued tool use has not been established by these checks.

## Probe commands

Run the direct Electron/gateway/TypeScript test without a native host:

```text
node scripts/workspace-mcp-probe.mjs
```

Add `--native` to create and close a separate native host/session with no model turn. It uses Full access for host eligibility on this Windows machine, keeps Ask me permission verification, and sends no execution requests. The report is JSON on stdout and deliberately excludes raw native diagnostics and credential values.

After packaging, run the same external probe script under the packaged executable in explicit Node mode, passing absolute `--app-root <resources/app.asar>` and `--executable <MuseBench.exe>` arguments. The probe process itself must run under Electron for ASAR filesystem resolution. Set `ELECTRON_RUN_AS_NODE=1` and clear `NODE_OPTIONS`/`NODE_PATH` only in that owned child environment; do not change machine-wide environment variables or open the running desktop. Require `packagedApp: true`, a `lib.ts` definition receipt, zero stderr, child exit code 0 and removed temporary workspace. The optional native registration check can then use the exact same packaged configuration.
