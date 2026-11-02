# Runtime parity implementation plan

User authorizes researching and fixing the identified MuseBench runtime gaps, related findings, and publishing the complete batch. Publication ends at verified GitHub downloads; no installed-app update or profile changes.

## Design

Keep the official Muse native runtime as the model/session owner. Verify current Windows behavior using disposable profiles and offline provider fixtures before removing existing compatibility restrictions. Do not equate a successful mocked contract with native sandbox support. Prefer one verified interactive session for approvals, steering, questions, compaction and children, with the exec path retained for explicit compatibility use. If native enforcement is unavailable, provide a bounded app-owned implementation or retain an explicit fail-closed limitation, never silently remove sandboxing.

## Tasks

1. Recheck Muse 1.4.14 sandboxed PowerShell under normal user-profile workspaces and native MSP sandbox handshake/session permission state. Record bounded, read-only proof. Resolve the root cause or implement a verified safe command boundary.
2. Integrate verified interactive default selection, persisted session routing, approvals and input/steering/child/context controls. Preserve exact-turn identity and unknown-outcome behavior. Exercise with an offline native provider fixture and focused Electron flow.
3. Enforce read-only plan mode at the tool/permission boundary for exec and MSP, including existing Full access sessions. Test attempted file/shell writes, restoration and failure handling.
4. Add a bounded public webpage reader through app-owned read-only MCP, independent of native Windows fetch. Preserve native web search and source links; test DNS, redirects, limits and MCP lifecycle. Do not expose user browser sessions or private network addresses.
5. Use an appropriate explicit default work budget while preserving deliberate shorter/longer choices and saved options. Update capability and connection copy to reflect actual behavior.
6. Review related gaps exposed by native tests, verify each implemented change with targeted tests and one appropriate surface, then run final required checks. Preserve the existing local release-speed/search work in this batch.
7. Publish the exact candidate through GitHub CI; wait for all required jobs and installer/updater artifacts, verify source provenance and hashes, report the release link and stop. Do not install or restart the user's app.

## Independent ownership

Root: native Windows investigation, interactive integration, controller routing, final review and release. Planning worker: new planning-policy module/tests. Public-web worker: public reader/MCP modules/tests. Budget worker: run-options/default/UI budget/tests. Workers must not edit root-owned runtime files.

## Final implementation and qualified limits

- Ordinary Windows exec turns retain native web search and register the app-owned required public webpage reader. Native sandboxed web_fetch stays disabled. Real native 1.4.14, an offline provider fixture and live public Example Domain read completed with exit 0, correct Meta tool/model/output folding, and no real provider request.
- A narrow opt-in parser handles the captured native MCP startup projection omissions. Later missing records, wrong session/run/command/task identity and absent terminal/exit evidence still fail closed.
- Exec Plan now launches a fresh native read-only run with exact read_file/search tools, shell/write/web/delegation/hooks/extensions disabled, strict configuration checks and sandbox verification even from Full access. The controller supplies local context and preserves the existing durable coding session. MSP Plan refuses before admission and the composer disables that choice.
- New/implicit exec budgets are Extended (15 min / 32 model steps); explicit presets and legacy saved shapes survive. MSP budgets remain disabled and labelled unsupported, and the controller preserves saved exec choices without passing unsupported presets to MSP.
- Required public MCP registration is verified through an actual native MSP session/start and inventory in a disposable explicitly Full access fixture. No installed profile or real model request was involved. The native protocol requires lineDelimitedJson for MSP and line_delimited_json for CLI settings; CLI environment values use whole-value interpolation.
- Connection/capability/Plan/budget copy reflects the effective adapter. A focused Electron composer flow verified defaults, explicit budget changes, draft preservation and disabled MSP controls. Narrow capability UI fits without overflow.

Two requested native limitations cannot safely be removed in this batch. Fresh 1.4.14 probes still stall managed PowerShell in Windows profile/OneDrive folders, while the same sandbox runs commands outside the profile. Existing Create working copy and worktree flows supply that compatible location without moving saved projects or granting Full access. Native MSP still initializes sandboxAvailability:unavailable; workspace flags and SDK spawn settings do not repair it, and upstream issue #107 has no maintainer fix. Interactive approvals, steering, questions, compaction and child controls remain explicit Full access features; no permission expansion or automatic transport migration was introduced. Existing conversation identities and selected access settings stay intact. Native MSP search availability is conservatively unverified rather than inferred from exec or model prose; public webpage reading is independently verified.

Required release CI, exact source provenance and downloads remain the final publication gate. The user updates the installed app.

Final local checks: 186 focused tests passed; the full test sweep passed 2350 of 2351, with its only failure an old integration fixture missing the newly required sessionMcp grant. That fixture was corrected and all 135 runtime/integration checks passed. Build/typecheck and all six release-preflight checks passed freshly with evidenceStable:true. Final GitHub CI remains authoritative for the exact committed candidate. No production profile/app changes were performed.

First candidate 81e1507 passed GitHub unit, appearance, extensions, both chat shards and package launch checks. Navigation caught the browser-preview fixture's obsolete 12-row capability assertion after the reader added a thirteenth capability. The corrected check verifies the actual search/page labels and that every preview capability is explicitly simulated, avoiding another hard-coded feature count. Its complete browser navigation/isolation/settings/responsive smoke passes locally. Publication remains gated on the next exact candidate's full CI.
