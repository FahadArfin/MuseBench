# Native app control

MuseBench ships a local MCP server for Codex and other stdio MCP clients. It inspects and navigates the actual open desktop app without mouse coordinates, Windows automation or Electron remote debugging.

1. Open **Settings → App control → Turn on**.
2. Copy the displayed MCP configuration into your client's stdio-server settings. The desktop executable provides Node; a separate Node installation is not required.
3. For Codex, use `codex mcp add musebench --env ELECTRON_RUN_AS_NODE=1 --env NODE_OPTIONS= --env NODE_PATH= -- <command> <args...>` with the command and arguments displayed in MuseBench. Quote each path for your shell. Codex documents this configuration at https://learn.chatgpt.com/docs/extend/mcp?surface=cli.
4. Reload MCP servers in the client, or start a fresh client session. Call `app_status`, then `inspect_ui`.

The available tools are `app_status`, `inspect_ui`, `navigate`, `screenshot`, `diagnostics` and `read_chat`. `navigate` accepts named destinations and optional Settings/Customize sections; inspect its schema for the current list. Navigation reports the shell after its transition. Remote services may still be loading: `app_status` reports that separately. Screenshots show currently visible app content. Chat history is local Muse Code history, selected by ID, bounded to 30 messages per call and 3,000 characters per message.

Enabling persists over restarts. Access tokens are private to the OS user, rotate at each startup, and are removed on clean shutdown. The server listens only on IPv4 loopback, rejects browser-origin requests, and exposes a fixed action schema. No tokens appear in the copyable configuration. Turn App control off to revoke access immediately. Clients reconnect on each tool call; requests are never automatically replayed. If an installed executable is moved, copy its configuration again. AppImage mount paths can change; use the installed `.deb` for a persistent Linux MCP configuration.

The tools do not execute arbitrary JavaScript, run shell commands, send provider messages, change approvals, install extensions or handle purchases. Provider login pages, OS dialogs and embedded remote-page controls still need their supported integration or direct user interaction. Shell inspection excludes embedded pages and input values. Diagnostic events record failure types and times, not console messages or URLs.

Preview uses the same UI components but simulates the connection switch. Validate a real connection with `node scripts/native-control-smoke.mjs`. Release checks additionally run the packaged executable's stdio server and call it on Windows, Linux and macOS. These tests use isolated profiles and make no model requests.

Screenshots require an open, restored MuseBench window. Hidden or minimized windows return an actionable error without bringing the app to the foreground. Hiding, closing or reloading the app during capture discards the image; cancelled requests cannot return late pixels. Capture has a six-second deadline and only one native capture can be outstanding. Electron has no capture cancellation API, so an underlying capture that has not settled continues to block new captures after the client deadline. The native smoke check verifies actual image pixels, hidden/minimized rejection and recovery after restoring the window.

On Windows with Electron 45, an isolated reproduction captured the previous red frame after minimizing and changing the page to green; a second capture returned green. A fully hidden capture instead timed out. Visible and covered-window probes did not reproduce stale frames. These findings establish the visibility guard's scope, not a universal guarantee that every animation has finished. Use `inspect_ui` to check selected controls and loading state alongside screenshots.

Native cleanup retains its original WebContents references, so closing the window can remove listeners after Electron destroys the BrowserWindow. The smoke test closes the real window and requires normal process exit; calling `app.close()` alone does not test this shutdown order.
