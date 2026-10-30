# Optional background engine

OC04 keeps the existing Electron main process as the single owner of Code, Work, Sites, scheduled work and paired mobile sessions. Closing a window may detach the UI; it must not create another controller or replay a model request when reopened.

## Authorization and approach

The user authorized continuous implementation of the roadmap, shared preview/desktop controls and verified updates. Design decisions here are implementation choices under that authorization. No new model requests, permissions, billing changes or automatic background opt-in are authorized.

Three approaches were considered: hiding a live window (simple but retains all renderers), a separate daemon (additional process/auth/update ownership), and keeping the existing main-process engine with disposable windows. Choose the third: it reuses the existing single-instance lock, native authenticated control listener and paired mobile transport, while actually releasing the UI. This is not an OS service and does not start at login or survive system shutdown.

## Behavior

- A saved **Keep running when the window closes** setting in General is off by default. Desktop persistence belongs to the main process; preview is clearly simulated.
- Enabling creates a tray icon first. Failure leaves the preference off. The tray offers Open MuseBench and Quit MuseBench. Reopening through tray, notifications or a second launch attaches exactly one fresh window to the existing engine.
- Closing in background mode destroys the shell and its personal/browser/billing surfaces; cookies and local profile remain. Code, Work, Sites, mobile and native-control owners remain. No launch animation on reattachment and no implicit request/session replay.
- Window close waits for UI-bound work (dialogs, sign-in, dictation, IPC/config changes) to finish. Quit and update use authoritative busy/queued/uncertain cleanup guards, including background sessions. A blocked quit gives an actionable reason and keeps the engine alive.
- Idle quit disposes every owner once, flushes browser sessions and destroys the tray. Explicit quit does not silently turn off the saved preference. An update shuts the engine down through the existing verified preparation path; relaunch restores the preference and shows the window.
- No additional unauthenticated server or permission is added. Existing enabled native MCP can read status and local chat history with no window; UI inspection/navigation/screenshots return a clear reopen instruction. Paired mobile keeps existing permissions and ownership.
- Recreating a window replaces renderer IPC/listeners and UI services. Engine subscriptions are registered once. Captured references never target a later window accidentally.

## Verification and limits

Use unit tests for persistence, tray failures, lifecycle races, close/quit guards and native-control background projections. Exercise real Electron with a disposable profile, closing/reopening repeatedly and checking renderer disposal, controller identity, single ownership, saved state and no provider calls. Shared settings run in browser and Electron. Full tests/build, one independent branch review and exact release verification precede personal installation. Do not enable the feature on the user's personal profile as part of testing.

Official references checked 2026-10-30: [Electron app lifecycle](https://www.electronjs.org/docs/latest/api/app) and [Tray](https://www.electronjs.org/docs/latest/api/tray). Windows system shutdown can bypass before-quit; existing durable session recovery remains authoritative and no automatic replay is introduced.
