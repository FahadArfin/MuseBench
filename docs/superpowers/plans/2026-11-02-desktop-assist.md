# Muse Desktop Assist implementation plan

> **For agentic workers:** Use the parallel-work workflow for the independent native driver and permission UI, with root-owned policy and runtime integration. Keep the batch local.

**Goal:** Let native Muse sessions inspect and operate approved Windows applications on demand, using the name Muse Desktop Assist.

**Architecture:** A lazily started, fixed-purpose Windows helper supplies app/window inventory, UI Automation inspection, application-only screenshots and bounded mouse/keyboard actions. A host policy service owns app approvals, persistent allow entries, current chat/connection leases and Stop. A separate authenticated loopback/stdin MCP server supplies the tools to Muse; the shared renderer supplies approval cards, settings and status.

**Tech stack:** Existing Electron/Node/React/TypeScript and Windows .NET Framework compiler; no new package dependencies or paid model calls.

## Design and approaches

- Chosen default: application-scoped approval with Allow once, Always allow, Deny and revocation. This follows the supplied reference and limits accidental control of unrelated apps. The optional user preference question remains open; per-app approval is the conservative default after the reply opportunity.
- Whole-desktop session access exposes unrelated windows and is not the default.
- Existing internal-browser controls remain the first choice for project websites; browser-only automation does not satisfy native desktop use.
- Availability is Windows-first. Other platforms and the browser preview report unsupported rather than simulating real desktop control.
- The helper starts only for an actual tool call and exits after that call or a bounded timeout. There is no always-running desktop observer, screen recorder or background input service.
- App inventory may be listed before approval, but unapproved window contents/titles/screenshots are withheld. Approvals bind the actual executable identity, not a model-supplied app name.
- App access is separate from workspace Full access and cannot be granted by a tool call. Model app requests await an explicit renderer decision; disconnect, chat/root/connection changes, Stop and timeouts invalidate them.
- Desktop input uses the foreground Windows session. An action rechecks the exact window, process, executable, start identity and observation before dispatch. No arbitrary scripts, shell launch, terminal control, secure desktop, administrator elevation or control of MuseBench/ChatGPT/Codex.
- Target screenshots return real image blocks, are normalized through the existing image service, and appear in the chat work log. Screens and app text are untrusted data.

## Interfaces

Native adapter `createDesktopHelper({helperPath, parentId=process.pid, timeoutMs=4500, spawnProcess})` returns `{call(input),close()}`. Each call spawns a hidden helper with fixed `--parent PID`, sends one bounded JSON line and receives one JSON object; it must kill/reap a hung helper and mark uncertain input outcomes.

Native operations: `apps`, `windows`, `open`, `inspect`, `capture`, `click`, `type`, `key`, `scroll`, `drag`. Window descriptor: `{handle:string,pid:number,startedAt:string,executable:string,appName:string,title:string,rect:{x:number,y:number,width:number,height:number},elevated:boolean}`. Installed app: `{id:string,name:string,executable:string}`; launch uses only an enumerated executable without arbitrary arguments. An inspect result includes a window and bounded elements with opaque runtime IDs, names, roles, rectangles and protection flags. Input includes the exact prior window descriptor and an inspected runtime ID or normalized point. Capture returns PNG data plus dimensions. No clipboard extraction or password values.

Host `createDesktopAssist({dataDir,getState,helper,normalizeImage,onState,beginVisual,platform})` returns `{snapshot(),command(input),agentCommand(binding,input),close(),isBusy()}`. Binding is fixed by MCP: `{taskId,root,leaseId,isCurrent}`; model arguments never select the owner. Renderer command union and snapshot types live in `src/shared/desktop-assist-types.ts`. Renderer bridge: `desktopAssist(command)` and `onDesktopAssist(callback)`.

MCP tools: `desktop_status`, `desktop_apps`, `desktop_windows`, `desktop_open`, `desktop_inspect`, `desktop_capture`, `desktop_click`, `desktop_type`, `desktop_key`, `desktop_scroll`, `desktop_drag`, `desktop_release`. Native leases are registered only for an authorized non-plan session; permission waits have a bounded longer timeout than ordinary input calls. Screenshot evidence uses existing `beginVisual` without inventing a new model provider.

## Tasks

- [x] Native driver + adapter/build: framework helper, bounded schema, process/window/foreground checks, UI Automation, input and target-window PNG capture, lazy lifetime. Fresh read-only fixture rejects stale/foreign/protected targets. Full input verification has the foreground limitation recorded below.
- [x] Host policy + MCP: strict tool arguments, current owner/app identity, atomic saved approvals, cancellation/revocation and Stop/Resume, normalized visual evidence; regression tests cover asynchronous approval and operation revocation races.
- [x] Shared UI: settings category, Allow once/Always allow/Deny, active Stop, saved app revoke, unsupported preview, keyboard/narrow layout. No renderer API can invoke raw desktop input.
- [x] Runtime integration: separate exec/interactive MCP leases, stop/disconnect cleanup, readonly plan exclusion, helper packaging and package-verifier registration.
- [x] Verification: targeted host/native/transport/runtime/settings tests, build/typecheck, real isolated Windows/Electron/MCP round trip, shared UI and full-app settings flow, independent reviews. No paid provider call or installed-profile action.

## Review focus

- Pending approval must not grant access after owner/connection changes or cancellation.
- A reused PID/window handle or replaced executable must not inherit an old approval or stale observation.
- Focus changes, overlays, protected controls and secure/elevated desktops fail before input; uncertain actions are not replayed.
- Stop revokes current control and blocks silent reentry until the user resumes.
- A crashed/hung helper must be reaped, leave no held keys, and never keep an updater or app shutdown blocked indefinitely.

## Progress

- Baseline: clean source `fecf92093aaede3719c6a0fed59ab5182b6dc772`, released v0.2.328. Working branch `codex/desktop-assist`; existing dependency installation reused. No installed app/profile changes.
- Research: official Computer Use documentation and Microsoft UI Automation/UIPI/window APIs inspected. This is an independent Muse implementation; it does not embed OpenAI's proprietary tools or change the Muse provider.

## Verification evidence and limits

- `npm.cmd run build`: passed; native compile, TypeScript, renderer build and native-control bundle. Existing Vite large-chunk notice remains.
- Targeted host, adapter/native guard, MCP transport, settings search and CI-suite contract tests: passed. Runtime exec/interactive registration and planning exclusion tests passed independently; unchanged passing runtime evidence reused.
- `node scripts/desktop-native-smoke.mjs --read-only`: passed with actual Windows UIA, PNG pixels, stale window/process identity, password controls and foreign refs in a disposable WinForms fixture.
- `node scripts/desktop-assist-smoke.mjs`: passed real native helper, Electron policy/PNG normalization, actual stdio MCP, shared-renderer approval, Stop/Resume, saved access and revocation. Clean receipt: `artifacts/desktop-assist/fixture-tvTz7e/report.json`.
- `node scripts/desktop-assist-ui-smoke.mjs`: 8 focused flows passed, including 390px dark/light screenshots, stale status delivery, expiry and Stop during pending decisions. Receipt: `artifacts/desktop-assist-ui/fixture-qXx7Mq/report.json`.
- `node scripts/settings-smoke.mjs`: passed in the real source app with its own profile, including actual settings IPC, forbidden raw input and persistence across fixture-app restart. Receipt: `artifacts/settings-ui/source-FGsCSV/report.json`.
- Two independent reviewers found races in approval/operation epochs, same-window target occlusion, and snapshot bounds. All findings fixed; regression tests ran red before the fixes and green afterward where injectable. Reviewers confirmed no remaining findings in their scopes.
- Fresh full native input smoke stopped at `focus_changed`: Windows refused foreground transfer. This is an explicit failure before keyboard/mouse input, not a successful interaction. The complete click/type/key/overlay/drag/scroll path still needs the disposable fixture foregrounded by the user; manual-focus mode is provided. No claim of fully verified native input or a paid Muse end-to-end turn.
- No publication, install, installed-app restart, account switch or installed-profile repair was performed.
