# Integration run settings

Open **Customize → MCP servers** or **Connectors**, choose an installed integration and expand **Run settings**. The same controls are available in desktop and preview; preview saves are simulations.

- **Required for replies:** blocks new replies if the integration cannot start. Optional is the default.
- **Connection timeout:** seconds allowed to initialize the connection, default 30.
- **Tool timeout:** seconds allowed for each tool request, default 300.

Timeouts accept values from 1 to 3600 seconds, including fractions. Edit a draft, choose **Review changes**, check the confirmation and apply. Discard restores the last inspected values. Saving does not reconnect Muse or run tools; reconnect Muse before using the new settings.

The integration must already have an explicit review grant. The reviewed source, selected project/chat and idle state must remain current until the write finishes. Changed files, revoked grants, expired reviews and duplicate applies are rejected. A failed grant after persistence is reported as saved settings that still need review. Unknown or conflicting legacy settings are read-only.

The host renders a versioned, finite field contract. It only edits the required flag and two timeouts. Commands, endpoints, credentials, environment, other integration fields and unrelated settings are preserved; the existing backup and atomic-write guards apply. These panels do not load third-party HTML or scripts, implement MCP Apps, or promise OpenCode GUI plugin compatibility.

The [Muse configuration reference](https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/) describes the native fields and defaults. Local configuration and UI checks are separate from acceptance by a live provider session.
