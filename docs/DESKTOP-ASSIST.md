# Muse Desktop Assist

Desktop Assist lets Muse Code inspect and operate approved Windows applications
when a task needs desktop interaction. It uses the existing native Muse session
and local Windows helper, with no extra model provider or desktop recording service.

Open **Settings → Desktop Assist** to enable or disable it. When Muse requests an
app, choose **Allow once**, **Always allow**, or **Deny**. Always allow saves that
executable's identity on this computer; revoke it from the same settings page.
An updated or replaced app needs fresh permission. Workspace Full access does
not approve desktop access.

The chat displays the app being controlled and **Stop immediately**. Stop cancels
pending work and blocks further desktop actions until you explicitly resume.
While a request or control session is active, **Ctrl+Alt+Esc** also stops it if
Windows grants MuseBench that global shortcut. The on-screen Stop remains the
primary control. Temporary access ends when its owning native connection ends,
the selected chat/project changes, or Muse releases it.

Muse can discover eligible apps, open registered apps or focus existing windows,
inspect accessible controls, capture an approved window, click, type, press keys,
scroll and drag. Window screenshots are returned as actual image content and
recorded in the chat's existing visual work log. Browser and project tools remain
preferable when they already handle the task.

Desktop input uses the active Windows desktop. You may need to click the target
window if Windows refuses automatic focus transfer. Changing focus, moving or
resizing a window, covering a target, or holding modifier keys can interrupt an
action. Muse must inspect again rather than repeat input with an unknown result.
Custom-drawn controls may need screenshot coordinates; apps that cannot provide
window-only screenshots return an explicit capture failure.

Desktop Assist does not operate terminals, MuseBench/Codex/ChatGPT, administrator
or security prompts, credential controls, or clipboard shortcuts. It cannot grant
permissions to itself. App content and screenshots are untrusted reference data.
The browser preview and other operating systems report this feature unavailable.

The helper starts only for a tool call, has a bounded lifetime, and exits after
each response. There is no idle desktop observer. This feature is an independent
implementation inspired by the supplied [Computer use reference](https://learn.chatgpt.com/docs/computer-use),
not the proprietary Codex computer-use implementation.

Developer checks: `npm.cmd run test:desktop-assist` exercises native read-only
inspection, shared UI and the real Windows/Electron/MCP round trip in isolated
profiles. `node scripts/desktop-native-smoke.mjs --manual-focus` additionally
checks native input in a disposable fixture after the user focuses it. Neither
check uses a paid model request or changes the installed profile.

## Hosted CI sessions

The native driver refuses elevated, locked and non-interactive sessions. GitHub-hosted Windows runners can fall into this category. In that environment the read-only native smoke asserts that all ten desktop operations return the specific session refusal, with no desktop data or uncertain input outcome. It explicitly reports no successful UI Automation/screenshot/input coverage. The same smoke still runs the real isolated UIA, target screenshot and identity/protected-control checks on an eligible local session; unexpected local refusals fail. Host/renderer behavior and native lifecycle/key guard tests remain required in CI. The product guard is unchanged.
