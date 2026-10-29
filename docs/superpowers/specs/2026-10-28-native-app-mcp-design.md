# Native MuseBench MCP

User request: connect Codex directly to the real MuseBench desktop to inspect, navigate and validate it without routine Windows computer use. Implementation and Codex registration are explicitly authorized.

Use an MCP stdio server shipped inside the desktop package. It discovers an opt-in, authenticated loopback bridge owned by the current MuseBench profile. The installed executable runs the relay with ELECTRON_RUN_AS_NODE; the executable and ASAR path remain stable across updates. The relay reconnects on each tool call after a desktop restart. Codex registration contains no access token.

Alternatives considered: exposing Electron debugging would grant arbitrary execution; a remote HTTP MCP service would add unnecessary network exposure and authentication infrastructure. The chosen local stdio relay uses the official MCP SDK and the existing isolated Electron controller.

Tools: app status, shell inspection (visible headings/controls and layout), app screenshot, diagnostics, bounded Code history, and typed navigation to personal destinations, Code, Work, Settings categories and Customize tabs. Navigation returns the resulting shell snapshot. No arbitrary JavaScript, selectors, shell commands, credential access, message sending, purchases, approval changes or remote-page control. Third-party page content is not part of the shell inspection. Screenshots explicitly capture visible app content.

Settings → App control enables/disables the connection and shows a copyable Codex command. Off by default for new profiles; enabling persists over updates. Tokens rotate on every start, are stored only in a private directory (user-only ACL on Windows / mode 0700 on Unix), and disappear on shutdown. Browser-origin requests, wrong hosts/tokens, extra fields and oversized requests fail closed. Requests have finite time/output/concurrency limits; navigation is idempotent and never retried automatically. UI replies are correlated and accepted only from the main app frame.

Desktop and preview use the same shell inspection/navigation implementation. Preview exposes an explicitly simulated App control setting and does not open a listener. Actual acceptance uses an isolated real Electron profile, an MCP SDK client over stdio, then the installed release and Codex's configured MCP connection. Source/package/installed-version and live tool proof are reported separately.
