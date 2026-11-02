# Native planning boundary

This batch adds `src/runtime/planning-policy.mjs`, integrates it at the final exec dispatch boundary, and adds focused tests. Its policy uses actual native tool selection and permission flags. It does not infer enforcement from instructions, an approval setting, or a Git worktree.

## Observed native contract

The directly invoked installed executable was `muse-bin-1.4.14-R7309.1.exe`; the launcher was not invoked. Local `exec --help` documents `--disable-write` as disabling non-shell workspace writes and `--disable-shell` as disabling workspace shell execution. Those flags alone leave other built-in tools available. The installed host also accepts the per-run setting `run.toolset=["read_file","search"]`. An isolated offline provider captured exactly those two model tool declarations, and a scripted `read_file` call returned the real disposable source contents.

The final policy combines:

- `--permission-profile :read-only`, `--disable-write`, and `--disable-shell`.
- An exact `run.toolset=["read_file","search"]`; workflow, delegation, monitoring, work controls, todos, web tools, and arbitrary extension tools are not offered.
- `hooks={}` and `managed_hooks_path=null`, no project trust, no retained native session, no contributor mode, no reminders or interactive input.
- Removal of `--disable-sandbox` inherited from a Full access connection. Planning runs keep the sandbox posture enabled.
- A separate strict configuration check without application extension-review grants. MCP configuration, plugin inventories, saved native trust, and project hooks fail closed, including previously reviewed sources. Ordinary user settings hooks are overridden by the empty native hook map.

Native `:read-only` cannot be combined with `--approval-judge`; the parser rejects that combination. The policy removes incoming approval overrides and emits the profile alone. `tools.read_file.enabled=true` is not a supported setting and was rejected before any fixture request; `run.toolset` is the verified read-tool mechanism.

## Evidence and scope

`node --test test/planning-policy.test.mjs test/configuration-review.test.mjs` passed **16/16** checks. They cover Full access narrowing, immutable and idempotent argv transformation, exclusion of shell/write/workflow sources, rejection of retained sessions and unknown overrides, prompt/flag separation, prompt files, MSP refusal before admission, strict exclusion of extension grants, and settings preservation.

Ignored, local evidence under `artifacts/` contains the disposable native harness `native-planning-probe.mjs` and these accepted reports:

| Report | Actual native result |
| --- | --- |
| `native-planning-policy-write_file.json` | Exactly `read_file`/`search` offered; forged `write_file` refused as unavailable; sentinel unchanged; exit 0. |
| `native-planning-policy-powershell.json` | Exactly `read_file`/`search` offered; forged `powershell` refused as unavailable; sentinel unchanged; exit 0. |
| `native-planning-policy-read_file.json` | Actual file contents returned through `read_file`; sentinel unchanged; exit 0. |
| `native-planning-policyfull-write_file.json` | Incoming Full access flag removed; user prompt and managed stop hook markers absent; forged write refused; sentinel unchanged; exit 0. |

These reports were recorded at 2026-11-02 02:16-02:17 UTC (2026-11-01 evening America/New_York). Each used a fresh disposable workspace/profile, a fake credential sent only to a loopback Responses-compatible fixture, bounded output/runtime, and a scripted malicious provider tool call. No real model request, paid provider operation, installed app/profile mutation, install, restart, or publication occurred. The final tests exercised the actual `applyPlanningArgs` function. The disposable directories were removed after their native process exited. Exploratory reports are retained separately; startup errors in those reports are not acceptance evidence.

This establishes native registration/refusal and real source reading for the tested installed Windows 1.4.14 host. It is not a proof against native implementation vulnerabilities, concurrent outside edits to configuration between checking and launch, other host versions/platforms, or installed application/renderer integration. Native runtime metadata and the app's temporary prompt preparation are outside the claim of preventing model-requested workspace writes and shell execution.

## Exec integration

The exec runtime now checks strict configuration before model discovery and immediately before final launch, retains managed-plane checks, and requires fresh sandbox readiness even when the connection selected Full access. Planning skips project trust/reviewed hooks, clears durable native session/resume inputs, and applies the pure argv policy after prompt-file/image preparation. Normal chat restores its original runtime tools and permission profile on the next request.

Snapshot `fullAccess` and `shellEnabled` remain the selected connection capabilities for existing controller comparisons. The per-request fields `planning`, `effectiveFullAccess`, `effectiveShellEnabled`, `planReadOnlyEnforced`, `webSearchEnabled`, `webFetchEnabled`, `permissionProfile`, `permissionArguments`, and `permissionDescription` describe the actual planning boundary. A plan sets effective Full access/shell/web flags false and `permissionProfile` to `:read-only`; disconnect clears those flags. Callers should use effective flags for active-request permission displays.

Three exec regressions passed: incoming Full access narrowed with no extension callbacks and normal-chat restoration; durable session/resume ignored without export; configured MCP rejected before model dispatch even when an injected ordinary checker would allow it. The combined policy/config/exec run passed 65 of 66 checks; the existing timeout fixture failed because a separate in-progress default-budget change supplies `budget:extended`, overriding its injected 15 ms timeout. This is recorded for budget integration rather than hidden as a planning pass. The module/configuration checks themselves passed 16/16.

## Required integration

The caller must use the policy at the final process boundary. Merely importing it or setting `planReadOnlyEnforced=true` does not enforce anything.

1. For exec planning, run the usual pinned-version/owned-process checks and native managed-configuration absence check. Immediately before launch, call `verifyPlanningConfiguration({environment:modelEnvironment,platform,workspaceRoot:workspace})`. Do not pass `extensionReview` to this check. Run this on every planning request, including a Full access connection.
2. Build the ordinary exec argv, omitting `--trust-workspace`, reviewed hook injection, and a durable `--session-id`. Call `applyPlanningArgs(finalArgs)` after constructing the prompt-file/image arguments and before `begin`/spawn. The pure transformer rejects a retained session, project trust, worktree creation, unknown options, and unsupported configuration keys instead of broadening the boundary. Use local transcript context as ordinary prompt text when continuity is needed.
3. Plan-specific instructions should accurately state that only native file reading and search are available. Do not include command-running, web access, reviewed-hook, or permission-escalation guidance. Use the transformed argv and a plan-specific permission description for the snapshot. Set enforced status only for a request whose checked final launch actually uses this policy; clear it on disconnect or a subsequent ordinary turn. Preserve `inputAdmission:'not-sent'` for refusals and existing unknown-outcome handling once spawn occurs.
4. Keep ordinary chat settings intact. Planning strips Full access only from its own native run; it does not change the user's saved connection choice.

## MSP limitation and route

The installed SDK's `TurnStartParams` has no tools/permission narrowing field. Native `serve --help` states that the host's sandbox posture is fixed at construction and applies to every loaded session. Existing prompt-only planning in a normal MSP session cannot become read-only through `turn/start`, approval changes, or a model instruction.

`assertPlanningTransport({mode:'plan',transport:'msp'})` therefore rejects before admission with `PLAN_BOUNDARY_UNAVAILABLE` and `inputAdmission:'not-sent'`. A functional route is a separately owned, strictly checked exec planning run using this module, then return its answer to the owning app chat with existing transcript provenance. Do not resume that chat's write-capable native session in the planner or mutate its connected MSP host. A separate read-only MSP host could be qualified later with launch-time `--disable-write --disable-shell` and exact `run.toolset`, but this module and these probes do not qualify that alternative.

The existing app-owned workspace analysis MCP server is a possible future bounded source-analysis addition. Its read-only annotations alone do not authorize it: that route needs its exact server code/configuration pinned and admitted separately, startup/cleanup proof, source/root binding, and arbitrary user/project/plugin MCP exclusion. Native file reads/search already provide a practical planning path without that additional integration.

Official primary references: [permissions and safety](https://dev.meta.ai/docs/muse-code/permissions) describes the built-in read-only profile and inherited workflow boundaries; [configuration](https://dev.meta.ai/docs/muse-code/configuration) distinguishes run flags/configuration; [extension execution](https://meta-models.github.io/muse-code-sdk/next/guides/extend/) explains that hooks/MCP run with user privileges outside the shell sandbox. The exact `run.toolset` and hostile-tool results above are fresh local host evidence, not an inference from those pages.
