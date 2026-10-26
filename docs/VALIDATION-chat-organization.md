# Chat organization — 2026-10-26

Pin and Archive moved from the top bar to sidebar chat context menus. Pinned chats are shortcuts to the original session, remain in their project, and show blue pins only when pinned. Projects default to Active and can switch to Archived. Archived chat menus offer Restore and confirmed permanent deletion.

Local retention starts at archive time and expires after 30 days. Cleanup runs at startup and hourly while the controller is idle; it resumes on a later check if a Muse turn is running. Legacy archives without a timestamp receive a fresh retention window. Permanent deletion removes local task history, saved baseline, draft, and checkpoints from SQLite. It does not delete project files or provider-side history.

Validation:

- Production build passed: `artifacts/chat-organization-build.txt`.
- 63 controller/history/retention/IPC tests passed: `artifacts/chat-organization-tests.txt`.
- Source and packaged UI tests passed pinning, keyboard context menus, archive/restore, delete cancellation and confirmation, persistence, and narrow-window menu bounds: `artifacts/chat-organization-smoke.txt`, `artifacts/chat-organization-packaged.txt`.
- Browser preview navigation, isolation, settings, and responsive checks passed: `artifacts/chat-organization-browser.txt`.
- 61 packaged source/build files and both native helpers matched: `artifacts/chat-organization-parity.txt`.
- Preview image: `artifacts/chat-organization-preview.png`. Packaged screenshots and report: `artifacts/chat-organization/packaged-X060E9/`.

Tests used isolated profiles and fixture projects. The normal desktop profile was reopened after packaging.
