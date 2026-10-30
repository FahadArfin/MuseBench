# Background activity

In **Settings → General**, enable **Keep running when the window closes** to keep MuseBench's engine running. This is off by default. A tray icon appears with **Open MuseBench** and **Quit MuseBench**.

Closing the window releases the shell and its embedded browser pages. Existing Code, Work and Sites owners remain in the same process, along with schedules and any mobile/native connections you already enabled. Reopening from the tray, app shortcut or a notification attaches a fresh window to those owners. It does not send or replay a request.

Quit and updates wait for active work, queued work and uncertain cleanup. Finish or stop those tasks from MuseBench first. Open sign-in windows and dictation must finish before the main window closes, including in background mode. A close requested during initial loading or a short app operation waits for that operation before closing. Disabling background mode restores normal close-to-quit behavior. A failed tray or preference write leaves the prior setting intact. If update shutdown or installer launch fails, the updater retains a visible recovery message.

This is not a system service. It does not launch at login, keep a sleeping PC awake or survive system shutdown. Existing saved-session recovery remains in charge after a restart. Enabling background mode does not enable mobile pairing, native MCP, a model connection or any additional permission. Existing mobile startup behavior is unchanged: turn on the desktop connection when needed after a full restart; closing/reopening only the window preserves a running connection.

Native MCP may read app status and saved Code history without an open window. UI inspection, screenshots and navigation ask you to reopen the window. The preview uses the same setting UI but clearly labels it as simulated.

Windows x64 is the release/acceptance target. Other desktop packages remain manually built and have no new platform acceptance claim.
