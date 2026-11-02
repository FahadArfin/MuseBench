# Tray notification menu implementation plan

**Goal:** A persistent Windows tray icon opens an Unread/Recent chat menu with the actions shown in the supplied Codex screenshot.

**Architecture:** Use Electron's native Menu and the existing activity inbox/task summaries. The tray exists for the app lifetime; background opt-in controls closing behavior independently. A bounded acknowledged shell-command channel reopens the window and waits for the renderer before navigating. Reuse notification preferences and feedback UI.

**Approved preference:** Always show the tray icon while MuseBench is open. Background mode remains off until explicitly enabled.

- [x] Add focused tests for deduplicated unread/recent rows, bounded More menus, exact navigation/read acknowledgement, startup/reload delivery and busy refusal.
- [x] Implement native tray menu and app-lifetime tray ownership; keep existing background shutdown/quit guards and saved preference compatibility.
- [x] Wire safe open-chat, unsent New Chat, feedback and notification-settings actions into the shared renderer; sync background settings after tray changes.
- [x] Run targeted lifecycle/notification tests, build/typecheck and isolated Electron checks for real native Menu actions, reopen, draft preservation, read state and settings. Obtain focused review and fix material issues.

Unread entries use existing persisted activity events, grouped by chat. Opening the menu does not mark anything read. Only a successful chat navigation marks the activity IDs captured by that click read. Deleted/archived chats are omitted; overflow is bounded and does not scan full transcript content. Titles/project names are local metadata and are escaped for native menu mnemonics.

Keep this batch local. Do not restart or install the user's app, enable background mode, send feedback, or start model work during verification. Native menu styling is supplied by Windows; no extra renderer/browser process is created for the menu.

## Verification

- 33 targeted notification, inbox, tray, background lifecycle and close-admission tests passed (`artifacts/notification-tray-targeted.log`). Production build and typecheck passed (`artifacts/notification-tray-build.log`).
- Isolated Electron native Tray/Menu callbacks passed six flows, including interrupted navigation, exact chat/read acknowledgement, draft preservation, unsent New Chat, local feedback/settings, closed-window reopening and guarded Exit (`artifacts/notification-tray/desktop-JoVFaZ/report.json`). No renderer errors or provider requests. The fixture captures the real native Menu object; it does not inspect Windows popup pixels.
- Existing isolated background lifecycle checks passed all seven flows (`artifacts/background-engine/desktop-Ads9cX/report.json`); preview background settings check passed (`artifacts/background-engine/preview-bAu8Hu/report.json`). Those checks remain valid because subsequent edits only affected tray command navigation.
- Focused review found two races: stale navigation marking unread events read, and a pre-reload follow-up running after a newer click. Both reproduced before their fixes and passed regression checks afterward; bounded re-review found neither issue remaining.
- Installed app/profile untouched; no publication performed for this batch.
