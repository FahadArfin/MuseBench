# Compact native integration panels

OC05 continues the authorized OpenCode-inspired roadmap. Implementation proceeds under the user's standing request to finish unblocked features without another approval round. The choices below are implementation judgments, not a new user-specified format.

## Intent and placement

Installed MCP servers and connectors gain a compact **Run settings** disclosure inside their existing details. It contains Required for this chat, Connection timeout and Tool timeout. Required explains that an unavailable required server blocks model turns. The default remains optional. Existing plugin details retain their exact-source Tools & hooks review controls; arbitrary third-party plugin UI is not loaded.

Editing a form changes a local draft only. Review changes shows the exact differences, then an explicit confirmation applies the prepared revision. Saved status says to reconnect Muse before using the new settings. Neither Save nor opening a panel starts a server or requests inference. A source edit, lost approval, changed project, active work, expired review or duplicate apply is rejected; the draft can be refreshed and reviewed again.

## Approaches and constraints

OpenCode's GUI API loads its own executable GUI/main-process plugins. MCP Apps provide sandboxed HTML plus mediated calls. Those are broader admission contracts than a small settings panel. Use host-rendered, versioned declarative fields instead: boolean and bounded numeric fields, plain text labels and no HTML, scripts, network content or executable callbacks. This matches the already-approved placement design and existing Muse configuration support.

Version 1 changes only canonical `required`, `startup_timeout_sec` and `tool_timeout_sec`, preserving a legacy `mode` spelling when present. Endpoints, commands, arguments, credentials, other fields and unrelated settings are preserved, never rendered into the panel or accepted as form fields. Existing approval is required before preparing/applying changes; no panel can approve an unreviewed endpoint or program indirectly. Timeouts may be fractional seconds in the bounded interval 1–3600. Unsupported or ambiguous existing values produce a clear read-only panel rather than silently normalizing the configuration.

A server-owned revision binds the exact configuration and the review token binds the entire source text, active workspace, field changes and expiration. Atomic writes retain the existing backup and source-race checks, with an activity/ownership check immediately before the write. If approval cannot complete after a saved edit, report that review is still needed rather than claiming success. Panel state never equates saved/reviewed with online or applied to an existing native session.

The shared React component uses the same finite panel contract in preview and desktop. Preview is explicitly simulated. Main process validates independently of the renderer. Personal settings and account permissions are untouched during development; all mutation checks use isolated fixtures.

## Research and acceptance

- [Muse MCP configuration](https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/) documents required/optional behavior and 30s connection / 300s call defaults, canonical/legacy ambiguity, and a warning that older CLI rewrites may drop optional fields. Preserve source spelling and use a fresh source-bound review; do not promise live reload.
- [OpenCode GUI plugins](https://opencode.ai/v2/docs/build/plugins/gui) expose an experimental executable API. MuseBench does not claim compatibility.
- [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) require sandboxed resources and mediated host actions. Version 1 uses native controls and does not claim that protocol.

Verify read-only inspection, exact changed fields, untouched private configuration, stale source/owner rejection, expiry/replay, busy transitions, failed writes/approval, narrow UI, keyboard review/cancel, simulated preview and real isolated Electron persistence. A real provider tool call is outside the available authorization; source/schema and local configuration proof must be labeled accordingly.
