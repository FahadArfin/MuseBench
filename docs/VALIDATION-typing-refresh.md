# Typing interrupted by background workspace refresh

## Diagnosis

The shared Code UI dispatches `refresh` every five seconds while a chat is open
and the document is visible, and on window focus. The controller previously
published `busy: true` for that read, disabling the composer textarea and many
other controls. Disabling a focused textarea drops keyboard focus. Larger source
scans make this global disabled state more noticeable. Refresh following a
completed model turn also went through the UI's local pending flag.

The controller regression reproduced the undesired busy publication before the
fix. This is a confirmed app-side interruption mechanism, not evidence that the
user's renderer actually reloaded. Native app control was unavailable during
this investigation, so no claim is made about the open instance's crash history.

## Change

Refresh runs as a deduplicated, cancellable inspection outside the controller's
mutation queue. A send, stop, navigation or shutdown preempts the inspection;
stale results cannot overwrite a newer task, project, baseline or source
generation. Refresh still publishes updated file/runtime state on completion,
without setting a global busy state. Explicit mutations and source evidence
validation retain their existing guards. The shared UI also treats refresh as
nonblocking rather than setting local pending. Draft ownership remains intact.

## Local verification

- `node --test test/background-refresh.test.mjs test/renderer-state-publisher.test.mjs`: seven tests passed.
- Four targeted controller tests passed covering source-wide busy authority,
  source refresh/evidence invalidation, size failure behavior, and accept rehash.
- TypeScript check and Vite build passed.
- `node scripts/typing-refresh-smoke.mjs`: real source Electron, isolated profile,
  manual chat, external DNS disabled. Continuously types across the actual
  five-second poll with a deliberately delayed fictional package-file open.
  Asserts every character, retained textarea focus and DOM node, zero disabled
  transitions, no global busy state, unchanged document time origin, and no
  renderer errors. No provider/model requests or user-app restarts.

This fix is local and pending release alongside the login persistence change.
