# MuseBench feature gap audit — 26 October 2026

## Method and scope

Compared the current Electron application, controller, runtime, Work/Sites/Spaces documentation and tests with the installed official Muse 1.4.13-R6996.1 CLI help and the primary documentation below. This is a product and implementation audit, not a claim of complete parity with either commercial app. No account credentials were inspected.

The app already has native styled personal chat/Ideas/Goals, coding project chats, activity/subagent events, change review, sandboxed shell support, reasoning/approval controls, dictation, slash commands, notifications, settings, Work artifacts, shared Spaces, Sites, and Customize. Reimplementing those would not address the largest gaps.

## Recommended additions — all included in this implementation

| Priority | Addition | Evidence in current code | Intended result |
| --- | --- | --- | --- |
| 1 | Conversation continuity and context inspector | `sendMessage` sends memory/goal/current prompt only; native exec starts independently | Recent prior conversation, initial objective and outcomes accompany follow-ups. Show exact app-supplied context and omissions. |
| 2 | Project-specific instructions | Only global `state.memories` exists | Guidance belongs to its project, persists locally and applies to each request without granting workspace trust. |
| 3 | Explicit project file context | Code composer has project selection but no file attachments | Search source files, preview text and include bounded snapshots, with revision checks and removable chips. |
| 4 | Durable drafts and next-prompt queue | Single React draft; textarea disabled while running | Drafts survive navigation/restart. Queue up to five follow-ups; only verified success advances them. Errors, stop and restart pause the queue. |
| 5 | Branch from prompt and prepare retry | History restores journals but has no branch/rewind action | Create a separate conversation from an earlier prompt, restore that prompt as a draft, retain original history and leave source files unchanged. Retry also fills a draft rather than silently repeating side effects. |
| 6 | Pin/archive/restore and full-text chat search | Sidebar only lists recent titles | Organize chats reversibly and find text inside saved user/assistant messages, including archived chats. |
| 7 | Open non-Node projects | `scriptsFor` unconditionally reads package.json | Open Python, Rust, docs or empty folders. Existing npm checks/preview remain available where supported; Muse's sandboxed tools can handle other project commands. |

## Design decisions

Keep Electron/React/TypeScript and the official native exec route. Build on the existing controller and source snapshot protections. A bounded prompt envelope (64,000 characters maximum) carries a stable initial request, user-authored project guidance, global guidance, active objective, selected file snapshots and a suffix of user/assistant exchanges. Selected source snapshots stay with their historical prompt and are replayed within the same budget; failed/cancelled outcomes survive branching and activity-journal trimming. Prior incomplete turns are labeled; tool logs and system UI narration are not replayed as conversation. This is conversation replay, not native session resume, and cannot preserve hidden reasoning/tool state. A prompt file avoids Windows command-line limits and is removed after process cleanup.

Context file selection uses the existing source exclusions and rejects binaries, oversize selections, symlinks, credential paths and changed revisions. It sends only explicitly selected files, with a maximum of eight files and 24,000 characters combined. The file browser is available before the first prompt as well as in an existing chat.

Queue entries snapshot prompt, mode, selected files and run options. They are serialized per chat, not parallel runs or mid-turn steering. A failure leaves subsequent entries paused; no automatic failure retry. Restart restores a paused queue. Validation failures and explicit pauses retain a hold even when more entries are added. A synchronous closing guard prevents queue dispatch during application shutdown. Stop pauses it before disconnecting. Sending again is an explicit action. The UI remains responsive while a turn is running.

Branching is conversation-only: the new chat receives prior exchanges, a draft of the chosen prompt and a fresh baseline of the current project files. No file rollback, Git operation or remote publication is implied. Archive is reversible and does not delete chat records.

## Alternatives and prerequisites

Native session resume would preserve richer state, but installed `exec --help` exposes session IDs without a documented headless resume contract. Replacing the validated Windows transport with the currently problematic `serve` host would risk the working sandbox. Therefore bounded replay is the supported choice here.

Git worktree isolation is useful (Codex and Claude both document it), but requires repository lifecycle, branch/base selection, dependency setup, cleanup and recovery UX. File rewind needs race-safe conflict handling and complete binary snapshots; the current review baseline is deliberately not a backup. These are future prerequisite-dependent projects, not features promised in this batch.

Unattended schedules, remote computers and full native child-agent control similarly require ownership/approval and process contracts beyond the current exec route. Plugin marketplace browsing and per-capability approvals remain CLI-backed extension work; the existing local plugin/MCP setup is retained. Personal Muse/Meta account services remain official signed-in pages with native presentation; no unsupported private API or extra credential collection is introduced.

## Primary sources

- [Muse interaction and queue/fork/context workflows](https://dev.meta.ai/docs/muse-code/interactive): distinguishes current-turn steering, next-turn queueing and session branching.
- [Muse configuration and context](https://dev.meta.ai/docs/muse-code/configuration): project rules require trust; interactive/headless launch flags differ; headless supports prompt files.
- [Muse extensions and automation](https://dev.meta.ai/docs/muse-code/extending): skills/plugins/MCP are existing integration mechanisms, with separate access and startup behavior.
- [Claude session management](https://code.claude.com/docs/en/sessions): retained conversations, names, resume and branching are core task-continuity workflows.
- [Claude memory](https://code.claude.com/docs/en/memory): separates project guidance from personal and automatically retained memory.
- [Claude checkpointing](https://code.claude.com/docs/en/checkpointing): conversation and code restoration are distinct operations with explicit limits.
- [Claude common workflows](https://code.claude.com/docs/en/common-workflows): multi-session development and worktree prerequisites.
- [Codex App Server](https://learn.chatgpt.com/docs/app-server): thread list/search, metadata, archive, read and fork interfaces provide a useful organization reference.
- [Codex worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees): independent checkouts support parallel work but need lifecycle management.

Installed CLI help was checked directly; web documentation can advance independently of the pinned binary. Implementation is complete for the seven selected additions. See [validation and release evidence](FEATURE-GAP-VALIDATION.md) for exact results and remaining limits.
