# Cross-chat work activity

Roadmap C05 / OC01. Add a compact Code toolbar activity button and anchored list of live chat work and checks. It names the chat/project, distinguishes work from questions, approvals and cleanup problems, and provides Open and supported Stop actions.

- Controller-owned activity is ephemeral; only live retained contexts and the actual check process create rows. Saved historical running flags do not imply live work after restart.
- Reuse the same fresh primitive runtime observations as sidebar summaries. Do not clone full inactive transcripts or poll providers. Cached identity fields come from existing runtime notifications; the final stop checks a fresh snapshot.
- Each stop binds its chat, live context and observed operation. Stale controls cannot stop a newer turn. Stopping an inactive chat keeps selection, drafts and other runtimes unchanged; pause its goal and queue first.
- Question and approval actions route to the owning chat rather than answering from the menu. Unknown cleanup remains visible; no automatic replay, reconnection or inference.
- Rows retain stable identity/order across stream refreshes. The menu stays open while actions settle, reports errors, fits small screens, supports Escape/focus return and uses existing reduced-motion preferences.
- Preview shares the component and reports only simulated actions. Desktop behavior is tested with isolated injected runtimes and bounded local check fixtures, not paid model requests.
