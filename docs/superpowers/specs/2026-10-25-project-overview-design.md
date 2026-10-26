# Muse Code project overview

The user wants a project destination like Claude Code, with separate chats nested beneath each project and no review pane occupying the chat by default.

- Selecting a project opens a full-width overview with its local folder, existing chats ordered by recent activity, and a primary New chat action.
- Each project has a sidebar New chat shortcut. A new chat opens a blank composer scoped to that project; submitting creates a distinct persisted task using the existing controller. It never reuses another conversation.
- Chat rows reopen their actual saved conversation. The project breadcrumb returns to the overview. Selecting the current project does not reload its task or discard an unsaved review plan.
- Review is closed by default on startup, new chats and task navigation. Its toolbar button and explicit plan/review links still open it. Review gates, connection controls and sandbox enforcement are unchanged.
- Overview presents real existing data only. Package scripts are optional read-only details. No new database, model calls or Meta AI account operations are required.
- Keep the existing chat and review mounted while showing the overview to retain drafts. Preserve the composer when choosing a project folder from a new chat.

Acceptance: isolated Electron tests demonstrate project-scoped chat creation, history and restart, overview navigation, explicit review and draft retention, plan gates, dark/light and narrow layout. Package and validate the exact Windows artifact, preserve the existing profile, and reopen MuseBench.
