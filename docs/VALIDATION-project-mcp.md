# Reviewed project MCP configuration

Validated 29 October 2026. This delivers the project MCP part of remaining-solutions step 5; it does not enable arbitrary managed configuration or complete the full roadmap.

## Behavior

Customize → MCP servers (or Connectors) → **Project servers** shows the effective configuration for the active workspace. The compact directory remains the default. The review shows source paths and hashes, executable arguments or remote endpoints, environment/header names with values hidden, startup/tool timeouts, and the project instructions covered by trust. A separate checkbox approves that exact revision. Revocation is available in the same panel.

The fingerprint includes personal settings, project layers, the selected workspace and Git boundary, merged definitions, inherited/referenced environment values, and instruction contents. Only the fingerprint is persisted. A new or changed source, instruction or environment binding invalidates it. Both runtime implementations check the actual child environment before work. Interactive submission, steering, child follow-up/reopen/retry/messages, answers, positive approvals and compaction share that check; an interactive host also requires reconnecting after a configuration revision changes, even if the new revision was approved. Stop/cancel/deny remain available after revocation. Approval never writes native `trust.json`.

Canonical personal `mcpServers` now works alongside legacy `mcp_servers`. Personal management preserves the original format and unrelated settings. Ambiguous pairs remain rejected. Project files require canonical names. Symlinks, oversized/invalid/null configurations and unsupported fields fail review; native hooks, managed capabilities, saved trust and plugin configuration retain separate checks. Project sources outside the native project boundary remain blocked by the existing guard.

Windows environment bindings use case-insensitive names and reject conflicting duplicates. A project server cannot reference MuseBench's `META_API_KEY` billing credential; configure separate server credentials. Non-Git projects with ancestor instructions remain blocked because their broader native trust scope has not been qualified. The Skills instruction inspector compares its observation to the combined grant and links to the same Project servers review.

## Contract and native evidence

The [official MCP configuration guide](https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/) documents personal-to-project merge order, repository-root-to-working-directory scope, worktree isolation and one-run workspace trust. Objects merge by key; arrays replace. Project settings are not written back to personal settings. The guide's examples use an older host, so the implementation was also exercised on the pinned Muse 1.4.14 binary.

`node scripts/project-mcp-native-smoke.mjs --native-echo` passed three cases using the real MuseBench interactive runtime startup and real review/guard:

| Case | Observed result |
| --- | --- |
| Repository root | Approved local server started, initialized and supplied its tools. Unreviewed and subsequently edited sources were rejected by MuseBench. |
| Nested project | Personal settings plus repository and child `.mcp.json` layers produced the expected child argument array and environment override. Parent instructions were included in review. |
| Separate Git worktree | Its own configuration loaded; the main checkout's deliberately invalid server did not load. |

All three native turns reported `providerId: echo` before submission and completed. Zero model requests and no account credentials were used. All owned hosts confirmed shutdown, the temporary workspace was removed, and a process inspection found no remaining fixture children. Raw evidence: `artifacts/project-mcp/native-report.json` (ignored).

`mcpServer/list` still returned an empty inventory for these real project/settings servers. Their actual process markers and `initialize`/`tools/list` requests establish loading; inventory omission is not interpreted as absence. Echo cannot select a model tool: model-issued `tools/call`, remote OAuth/connectivity, arbitrary executable behavior and execution on other operating systems are not claimed by this probe.

## Verification

- 153 focused runtime/configuration tests passed, including 21 new review regressions. The four independent-review findings were reproduced before their fixes.
- 1,252 full-suite tests passed, none skipped.
- Shared preview review/approval/revocation flow passed.
- Source desktop used the real IPC/service against an isolated project and profile: stale approval was rejected, refreshed sources could be approved and revoked, secret values were absent from the renderer and stored grant, and returning restored the compact directory. The Skills instruction inspector reported the same grant and opened the combined review. This test caught and then verified a missing panel-navigation state change.
- Production TypeScript/Vite build passed. The existing bundle-size warning remains.
- Catalog scrolling/search/refresh retention and Installed parity passed; preview/desktop shared controls matched within one pixel. The new approval flow also runs in both catalog CI suites.
- One independent final review found four important issues: exec environment mismatch, continuing-work controls missing a fresh grant check, unqualified non-Git ancestor scope, and Windows environment casing. All were addressed with failing-then-passing regression tests. No model allowance was consumed.
- The exact release/installation evidence is retained under `artifacts/release-<version>/` after CI publication; source checks alone are not an installed-release claim.
