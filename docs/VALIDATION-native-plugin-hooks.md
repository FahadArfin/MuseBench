# Native plugin hook controls

Verified against Muse CLI/SDK 1.4.14 on 29 October 2026. This extends [individual plugin MCP controls](VALIDATION-native-plugin-mcp.md).

Installed plugin details now include **Tools & hooks**, with a separate decision for each executable capability. Hook rows show the event, timeout, foreground/background behavior and any tool alias. Confirmation explains automatic execution and host-account access; permission hooks additionally explain that they can approve or deny tool requests. No polling or additional catalog panels were added. The shared preview simulates the same controls without executing programs.

Approval uses the official exact capability ID and verifies its native response, installed package, complete settings identity and stored definition hash before saving the app grant. MCP and hook IDs with the same name remain independent. Package edits, changed definitions, moved settings and revocation invalidate grants. Existing positive-operation checks require reconnecting after a changed execution configuration; cancellation and negative decisions remain available.

## Review coverage and limits

The native inspection projection omits some manifest fields. MuseBench therefore reads the bounded installed `.muse-plugin/plugin.json` as well, compares command/event/timeout/async/matching fields, and includes the complete source definition in the review identity. Commands use the existing argument-preserving credential formatter and contained source-path checks.

The app accepts known native events, argv commands and timeouts up to ten minutes. Imported hook formats, shell/matcher projections, additional skill-selection output, unknown fields and custom XDG plugin data stores remain explicitly unavailable for app approval. Those need a separate reviewed integration; they are not silently converted or enabled. Project hook presets retain their existing narrower event/timeout rules. Managed configuration is unchanged.

## Native acceptance

An owned temporary profile and two generated recorder hooks were used, with no account credentials or model requests. The direct native contract probe confirmed zero events before approval, two completed events after approval and zero after revocation.

The production Customize service then reviewed the inventory, approved/revoked exact hook IDs and verified app grants. Real runtime connections exercised the normal configuration guard and permission handshake. Before each direct SDK turn, the actual session provider was checked to be `echo`:

| State | Recorder events | Completed native hook receipts |
| --- | ---: | ---: |
| Neither hook approved | 0 | 0 |
| Prompt hook only | 1 | 1 |
| Both hooks approved | 2 | 2 |
| Both revoked, after reconnect | 0 | 0 |

Events matched the real session/workspace and owned recorder processes exited. All runtime-owned hosts closed with confirmed cleanup. Native enabled state without its app grant prevented a host from starting. Revocation changed the real execution revision.

The direct SDK turn deliberately bypasses MuseBench's Meta-only model selector. Its chat adapter rejects that externally initiated turn as `unexpected-turn`; therefore this fixture proves hook execution on runtime-owned connections, not ordinary chat submission or the live stale-connection refusal path. The latter has separate runtime regression coverage. An attempted compact check correctly refused the externally initiated turn before reaching the configuration gate; no compaction or model request was sent. Actual model acceptance remains a separate usage-authorized check.

Local reports: ignored `artifacts/native-plugin-hooks/contract-report.json` and `service-report.json`. UI screenshots/reports: `artifacts/plugin-tools-ui/`. Audit folders are retained.

## Validation

All 1,328 tests passed, as did the production build, catalog preview/desktop suites, shared renderer parity and ten plugin-control checks on each renderer. Backend regressions cover separate same-name capabilities, missing/revoked/stale grants, package/settings/native-response races, complete source comparison, unsupported semantics, default/background/alias metadata and disabled records. Browser and Electron checks cover explicit consent, independent decisions, stable idle details, failures, late responses, shared installed rows, keyboard access and narrow layouts. Exact release and installed acceptance are recorded separately after publication.

## Primary references

- [Native manifest fields](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/manifest/)
- [Hook events and payloads](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/reference/hook-events/)
- [Hooks in plugins](https://meta-models.github.io/muse-code-sdk/next/guides/plugins/concepts/hooks/)

Documentation examples describe an earlier version; execution claims above come from the pinned installed host.
