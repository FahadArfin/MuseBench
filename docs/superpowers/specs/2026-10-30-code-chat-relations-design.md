# Forks and fresh side chats in Muse Code

## Intent and authorization

The user requested Code chat forks and side chats with their own context, then explicitly selected **Fresh context, linked to the main chat** for side chats. Their standing implementation, shared preview/desktop, per-feature push and verified-update instructions apply. The interaction choices below are implementation decisions within that request.

## Existing behavior and evidence

MuseBench's response action currently copies a retained message prefix into a new chat. `/side` only opens a new draft containing recent parent messages; it does not persist a parent relationship. The pinned Muse SDK 1.4.14 exposes `session/fork` and `session/sideChat`. An isolated real-host probe on 2026-10-30 proved that forks carry native history at a completed-turn cut and that the new fork can be released and resumed on an independent host. The same probe proved native `session/sideChat` inherits parent context and has no project root, so it does not implement the user's chosen fresh Code chat behavior.

## Approaches

Use a new, independent Code chat for **New side chat**, with a persistent app-owned parent link. Use a native fork for an eligible saved interactive Muse session and retain an explicitly identified saved-conversation copy for exec/manual/tutorial chats, whose transport has no verified native fork command. Both create drafts without inference. This combines the user's fresh-context choice with native history where available.

Using native `session/sideChat` would inherit context against the user's choice. Using a plain unlinked new draft repeats the current navigation problem. Neither is selected. Native fork errors must never silently fall back to a conversation copy.

## User experience

- Add **Fork chat** and **New side chat** to the Code chat options menu and a compact current-chat control. Keep the response-level action for forking at a selected reply; label it **Fork from here**.
- A fork is a separate top-level chat. It carries history through its selected completed turn, or through the current end for the chat-level action, then proceeds independently. A compact **Forked from …** link returns to its source.
- A side chat starts with an empty conversation and its own draft/session/usage. Nest it under its main chat in the project list, with a smooth accessible disclosure. From a side chat, another side chat is a sibling under the same main chat. Offer **Back to main chat**. Archived, deleted, moved or malformed parents must never hide surviving side chats.
- `/side` creates this same linked fresh chat, with optional text held as its unsent draft. `/fork` and `/branch` open a fork rather than aliasing `/side`.
- Creation sends no model request and does not change project files. Chats share the current project checkout and ordinary project/global instructions, not each other's future conversation. Existing checkout occupancy rules still prevent conflicting simultaneous writes. No automatic worktree creation.
- Keep controls compact, use the existing icons, blue accent, motion tokens and reduced-motion behavior. No new setup wizard or explanatory banner; short descriptions belong in the menu or relationship row.

## State and lifecycle

Persist `chatRelation: {kind:'side'|'fork', parentTaskId:string, parentTitle:string, context:'fresh'|'native'|'retained', createdAt:string, messageId?:string}` on the child and in chat summaries. Preserve existing `forkedFrom` for compatibility. A side link targets its main chat; a fork link targets the actual source. Validate stored relations, avoid self/cyclic nesting, and expose children as top-level if their parent is unavailable or in another project. Deleting or archiving a parent is never a cascading deletion.

Both actions identify their source explicitly; late callbacks cannot operate on a different selected chat. Preserve parent drafts, queued prompts, native session identity, run receipts and history. New children do not inherit running/queued work, goal continuation, usage totals, compaction state, review ownership, or native request/activity receipts. A fresh side also does not inherit parent messages, summaries, selected files/images or recent-context capsules. Ordinary requested model/effort settings may be copied; permissions and tools must still pass normal connection admission.

Native fork: source must be idle, owned and verified, with a known completed native turn for a selected-reply cut. Validate returned distinct session ID, exact `forkedFrom` provenance, root, model/provider, inactive work and permission state. Send each command once. `session/leave` acknowledgment is not release: wait for matching `session/leaveCompleted` with `outcome:'released'` before another runtime can resume the fork. An unknown result/release retains an explicit recovery receipt and must not auto-repeat a fork or submit work. Never transplant an active runtime or lease to the child. Rebuild workspace/on-demand tools under the child's ordinary admission/review path; do not copy access leases or provider secrets. Native copied history is not injected again as app text.

Retained-history fork: preserve the current bounded replay behavior and outcome/truncation metadata, and identify it as **Saved conversation** context. This is not a native clone or a file rollback. Older saved chats remain readable. Source messages beyond the chosen point and later parent changes do not appear in the new chat.

## Verification and delivery

Use meaningful failing regression tests followed by implementation. Verify context isolation, exact-source actions, persistence/restart, missing parents, independent queues/goals/usage, native completed-turn cuts and separate-host handoff, rejection/unknown outcomes, no inference on creation, and keyboard/narrow/reduced-motion controls in browser and Electron. Check actual product components, not copied test implementations. Native contract fixtures use only disposable profiles and scripted loopback responses, with bounded requests/time and confirmed cleanup; no paid/provider model calls or personal credentials. Finish independent review, focused/full tests, build, push and required release checks; install only the latest verified artifact after an idle preflight and profile backup.
