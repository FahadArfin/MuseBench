# Forks and side chats in Muse Code

Open a chat's options in the sidebar or the current chat header:

- **Fork chat** carries the conversation into a separate chat. Continue there without changing the original conversation. To choose an earlier point, use **Fork from here** on a reply.
- **New side chat** opens an empty conversation linked to the main chat. It has its own draft and context. Creating another side chat from it makes a sibling under the same main chat.

Creation does not send a model request. Write or review the new draft, then send when ready. `/side` can include an optional question that remains an unsent draft; `/fork` and `/branch` create a fork.

Side chats nest under their main chat in the project's list. Collapse that group or use **Back to main chat** to return. Forks remain separate chats and show **Forked from …**. Both can be pinned or found independently. Removing, archiving or moving a main chat does not delete its side chats; a child whose main chat is unavailable appears on its own.

## What context is shared

A fresh side chat uses the same project and ordinary project/global instructions. It does not inherit the main chat's conversation, attachments, context summary, queued prompts, usage totals or active goal. Later conversation in either chat stays separate.

For a supported interactive Muse session, a fork uses the native history through the chosen completed turn. MuseBench verifies the new session and releases its initial owner before allowing independent reconnection. If that operation fails or its outcome is uncertain, it reports the issue instead of silently copying a different context. An unresolved operation keeps its recovery information and requires inspection before another native fork is attempted.

For exec, manual or tutorial chats without supported native forking, the fork uses the available saved conversation. It is marked **Saved conversation**; it cannot recover omitted native history or hidden reasoning. Very old replies without a retained native turn mapping, and a first user prompt without a completed native turn, cannot serve as native cut points.

Both conversations use the same checkout unless you explicitly choose a worktree. Forking does not roll back files or grant extra tool permissions. Existing checkout occupancy and connection review rules still apply, including fresh admission for session-owned tools.

## Verification boundary

The browser preview and desktop share these controls. Preview data is simulated locally. Native contract checks use the pinned Muse host with scripted loopback responses and disposable profiles; they do not spend model allowance or prove behavior against a personal provider account. See [validation evidence](validation/2026-10-30-code-chat-relations.md) for exact checks and limits.
