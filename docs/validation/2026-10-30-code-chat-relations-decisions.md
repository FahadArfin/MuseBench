# Code chat relationship decisions

These decisions implement the user's request for forks plus **fresh context, linked to the main chat**. They preserve the existing Muse backend and permission model.

1. **Fresh sides use independent sessions with an app-owned parent link.** The pinned native `session/sideChat` command inherits parent context and returns no project root. Using it would violate the selected behavior. Cost: these fresh sides do not have the native provider's inherited-side-chat identity; MuseBench owns their navigation relationship.
2. **Exec, manual and tutorial forks retain an explicitly labeled saved-conversation fallback.** No native fork contract was verified for exec. Cost: that copy contains only the available conversation, not missing history or hidden native state. Native fork errors never silently choose this fallback.
3. **Preserve worktrees and all investigation evidence.** This follows the standing preservation instruction instead of automatic skill cleanup. Cost: retained local fixture profiles, reports and backups use disk space. Private connection configuration and full fixture profiles are not committed.
4. **Uncertain native fork/release outcomes require inspection before another fork.** Persist the exact command and any acquired child session; do not speculate about ownership or automatically retry. Known rejections remain distinct and do not permanently block another deliberate attempt. Cost: an interrupted fork may need manual native inspection. Fresh sides and ordinary idle parent use remain available within the existing admission rules.

Independent review found and corrected traversal through a fork's unavailable original source. A fork is an independent main chat: its sides remain grouped under it even if the source of the fork is deleted, archived or moved. Tests cover that boundary, rather than treating the fix as a new behavior exception.

See [design](../superpowers/specs/2026-10-30-code-chat-relations-design.md), [usage guide](../CODE-CHAT-RELATIONS.md) and [validation](2026-10-30-code-chat-relations.md).
