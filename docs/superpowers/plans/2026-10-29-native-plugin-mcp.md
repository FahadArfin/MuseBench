# Reviewed native plugin MCP activation

Approved scope: the user's extension-catalog design and standing remaining-harness implementation request. Implement inline using executing-plans, with one independent final review. Keep the live preview checkout and approved main release workflow. Do not request another design approval for this already authorized integration.

## Outcome and evidence

Installed plugins with MCP servers can be inspected and explicitly approved/revoked from their details in Customize. Installation alone does not activate native tools. The user sees each server's command or endpoint, native approval status and whether MuseBench has reviewed the exact configuration. Unknown capability kinds remain unavailable through this control.

Actual Muse 1.4.14 `plugins approve` writes `runtime_capabilities[stable_id] = {enabled, trusted_definition_hash}`. The existing guard rejects every nonempty runtime_capabilities value, even after the app's inventory review. An isolated approved stdio plugin was initialized and queried for tools during a verified local-echo turn; no model request or credential was used. Native logs and setup/inspection receipts are in `artifacts/native-plugin/`. This establishes loading/discovery, not model-issued tool execution.

## Design

Use the official CLI's bounded `plugins inspect --json` and per-capability approve/reject operations. Inspect the selected installed plugin on demand; never execute plugin-provided commands during review. Validate native identity, kind, stable ID, source/package definition hashes and the matching normalized MCP definition. Show only bounded plain text, with credentials filtered from display. A revision-bound confirmation is required before approval.

Keep native decisions and MuseBench's grant separate. A local grant binds the exact inventory/package identity and native capability record. Changed package bytes, definitions, native approval values, source selection or unrecognized runtime settings must fail closed. Other plugin capabilities, arbitrary managed sources and saved native trust are not authorized by this grant. Existing reviewed MCP and hook behavior stays supported.

An interactive host captures the reviewed execution configuration at startup. Before later positive operations, require its relevant MCP/plugin/hook configuration to match; an approved change still needs a reconnect because the native host retains its startup configuration. Stop, cancel and negative decisions remain usable. Exec launches read the current reviewed configuration for their new host.

Preview uses labeled deterministic state and the same React controls. No browser operation modifies the desktop. Native checks use only a generated local fixture and an isolated credential-free profile, verified echo identity, fixed deadlines and owned shutdown. Retain audit directories after the earlier cleanup policy rejection.

## Tasks

### Task 1: Exact grants and host revisions
Add failing configuration/grant regressions for native approved plugin MCP records, changed inventory/package/native approval, unrelated capability entries, bounded malformed metadata, revocation, and reconnect after reviewed execution-config changes. Implement exact grant/snapshot logic without weakening generic configuration rejection.
Verify: `node --test test/plugin-capabilities.test.mjs test/configuration-review.test.mjs test/runtime.test.mjs`. Expected: all pass.

### Task 2: Native capability service
Add on-demand service inspection plus per-MCP-capability approval/revocation. Bind the confirmation to the observed plugin/configuration revision, validate official CLI output, and check unchanged unrelated records before granting. Add stale/race/failure tests; no auto retries.
Verify: `node --test test/plugin-capabilities.test.mjs test/customize.test.mjs`. Expected: all pass.

### Task 3: Shared plugin details
Add compact per-server status and review controls within installed plugin details, using the shared UI and explicit preview simulation. Test read/approve/revoke, unknown capability/error states, keyboard/close behavior, narrow wrapping, stale selection and unchanged catalog browsing.
Verify: build plus plugin capability smoke in preview and desktop. Expected: all pass.

### Task 4: Native integration and review
Repeat the native approved fixture through the real MuseBench guard/runtime, verify startup/discovery, stale approval refusal, reconnect behavior and shutdown. Run focused/full tests, build, browser/desktop fixtures and parity. Complete one independent final review; fix Important/Critical findings by RED→GREEN and full suite.
Verify: full suite plus native fixture. Expected: all pass; no model calls.

### Task 5: Publish and install
Commit/push the completed feature, await validation and seven-target release, verify exact installer hashes, install/reopen preserving profile, and inspect installed UI through native control.
Expected: exact head verified in release, installed package and native UI.

## Review focus

Cross-plugin/stable-ID forgery, approval races and unrelated native settings changes; bypass through custom XDG stores or malformed inventory; package mutation and stale native hashes; revocation versus a still-running host; helper failures and unknown approval outcomes; secret-safe plain-text display and complete review details; source-bound grants across Code/Work/Sites; preserve current permission enforcement and no automatic model calls; fixture/echo/model proof distinctions.
