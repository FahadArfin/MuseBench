# Responsive large chat navigation

Roadmap C08. Continue the user's authorized implementation queue after the verified 0.2.178 installation. The user wants typing, switching and scrolling to stay responsive as saved chats and context grow. This is a performance and ownership change to the existing shared React UI, not a new layout.

## Current behavior

`ChatSidebar` renders with every parent draft update, receives freshly created callbacks, sorts all tasks and filters that list separately for each project. Context menus, drag targets, keyboard reorder and disclosures live inside that component and must keep their identity. `ChatLibrary` and `CodeContext` suppress stale responses but start another read for each changed input, even while an earlier read is running.

## Approach

Use a memoized sidebar boundary with committed, current event delegates and a one-pass project grouping. Compare only the sidebar's primitive project/task fields and explicit order arrays; never inspect retained transcripts or project instruction bodies. Keep the existing mounted rows and local interaction state.

Use a small latest-read scheduler and a React adapter for search and context inspection. First load, owner changes and explicit refresh start without the typing delay. Other changes wait 150 ms. Each mounted reader admits at most one operation at a time and retains only the newest pending request. The running operation cannot be cancelled through the current IPC contract; its outcome is ignored when superseded. Unmount removes pending work and callbacks. No automatic retries or model requests.

These are implementation choices made for the already-authorized roadmap. Full list virtualization was considered, but it changes focus, drag and menu anchors and is unnecessary for isolating draft updates. Debounce alone would leave slow reads overlapping, so the queue also serializes admitted reads. No new dependency or provider capability is needed.

## Required behavior

- Draft changes with unchanged sidebar data perform no additional row renders. Equivalent cloned snapshots preserve the open menu and row identity; actual title/status/order/selection/busy changes remain visible.
- Action delegates always use the latest committed handlers, including when the sidebar itself did not render. Busy/inactive state still dismisses or disables actions as before.
- Grouping scans task project membership once, preserving manual order, recent order, pinned membership and archived filtering. Recents still shows eight rows before View all.
- Search retains its last result while a newer search is pending, marks that state as searching, and never lets an earlier query replace a newer result. Empty-result copy appears only after a completed empty search. Errors can recover on a new query or explicit revision.
- Context retains the previous observation only for the same project/chat owner. Changing owner hides old files, attachment previews and prompt metadata immediately. Project instruction editing and file callbacks remain bound to the current project. Loading context remains explicitly marked while an earlier same-owner observation is displayed.
- Closing a surface prevents any queued follow-up and state delivery to that unmounted surface. A previously admitted IPC read may finish; no claim of backend cancellation is made. A reopened surface has a new scheduler.
- Keyboard movement, drag/drop, context menu focus restoration, selected chat and unsent drafts remain intact. Dark/light and narrow layouts retain the existing controls.

## Evidence and boundaries

Use deterministic queue and grouping tests plus the real shared React components in isolated Chromium and Electron fixtures. Measure 1,000 saved chats with operation counters and observed rendering time; timing is descriptive, not a universal frame-rate promise. Verify delayed reads, owner switches, updated callbacks, errors, unmount and existing drag/chat organization regressions. No user profile, credentials, native model execution or paid allowance is used for these checks.

Preview and desktop consume the same source. Commit and push the completed feature, then verify CI and the exact published installer separately. Installed acceptance must not be inferred from fixtures.
