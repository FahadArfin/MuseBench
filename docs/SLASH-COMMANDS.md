# Muse Code slash commands

Type `/` on its own line in the composer. The picker follows the supplied Codex references: a rounded panel above the input, compact icon rows, descriptions, a highlighted selection, submenus, scrolling and installed skills with their source labels. Type to filter; use Up/Down, Home/End, Enter or Tab, Right/Left for submenus, and Escape to go back or dismiss.

Commands act locally. Selecting a skill or prompt-writing action fills an editable draft; press Send when it is ready. Text before the active slash line is preserved. Unknown commands show guidance rather than being sent to Muse. URLs and file paths containing slashes do not open the menu.

## Useful commands

| Command | Behavior |
| --- | --- |
| `/reasoning` or `/effort low` | Choose the real Muse effort setting, from None through Ultra. |
| `/permissions` or `/approval ask` | Choose Ask for approval, Auto-review, or sandboxed No prompts (`ask`, `auto`, `never`). |
| `/plan`, `/plan on`, `/plan off` | Toggle optional planning. `/plan <request>` enables Plan and fills a draft. Planning is guidance, not a read-only security boundary. |
| `/fast`, `/fast on`, `/fast off` | Toggle a low-reasoning preset. This does not enable a premium provider service tier or guarantee a particular speed. Off returns to High. |
| `/goal` | Edit a saved objective for the current chat. Active objectives accompany each request you send. `/goal pause`, `/goal resume` and `/goal clear` act directly. No autonomous background work is started. |
| `/memories` | Edit explicit app-wide instructions, included with subsequent Muse Code requests. Clear the field to stop including them. |
| `/skills` | Browse enabled skills reported by the installed Muse CLI; select one to draft a skill request. Project/plugin skill execution still depends on the existing validated connection policy. |
| `/new`, `/resume`, `/rename` | Start a draft, search saved chats, or rename the current chat. |
| `/side`, `/btw`, `/fork` | Draft another chat with a bounded copy of recent context. It is not a parallel or temporary agent. |
| `/review`, `/diff`, `/preview`, `/checks`, `/checkpoints` | Open the existing project review tools. Selecting a command does not execute a check or accept changes. |
| `/copy`, `/export` | Copy the last reply, or choose where to save the visible chat as Markdown. |
| `/compact` or `/recap` | Draft a request to summarize recent chat context. This does not compact or resume a native session. |
| `/init` | Draft a request for project instructions in AGENTS.md. |
| `/context`, `/files`, `/instructions` | Inspect project file snapshots, edit project guidance and see the bounded context sent with the next request. |
| `/status`, `/usage` | Inspect actual chat/connection state or ask the official CLI for allowance counters. Missing counters and lookup failures are explicit. |
| `/model` | Inspect the actual model identity when known. The validated connection uses the Muse provider default; switching to Codex/Claude models is not offered. |
| `/theme`, `/settings`, `/voice`, `/mention` | Change appearance, open settings, start existing on-device dictation, or choose a file path to mention. |
| `/help` | Browse the full catalog. |

## Compatibility limits

The catalog includes 43 commands and 43 aliases, plus the installed Muse skills. Nine entries are explicitly marked **Info**: MCP, Pet, Sketch, Plugins, Agents, Sign out, Rewind, Worktree, and Approve denial. They explain capabilities or safe alternatives; they do not pretend to implement another provider's service. In particular, arbitrary external MCP/plugin execution, Codex pets, image transport, background/remote agents, automatic rollback, and interactive approval responses are not connected to the validated Windows runtime.

`/connect` opens Muse's existing connection/setup dialog. `/logout` explains the official CLI sign-out route without changing website sign-in. `/stop` and `/disconnect` use existing cancellation; during a running request, the composer's Stop button remains the available cancellation control. No command disables the sandbox or changes the personal browser session.

Skills and usage use fixed, bounded read-only CLI calls without a shell. Skill names/descriptions are displayed as data. Model requests still pass through the existing native process supervision and permission verification. Goal/memory text is bounded and stored in the existing local application database.

On the validation machine, skills discovery succeeded and an actual model reply included both saved goal and memory markers. The separate `muse usage --json` lookup failed credential validation; the UI reports that failure and offers Meta billing. The live model request succeeded with the existing login, so the failed allowance lookup is not treated as a reason to reset credentials.

## References

The menu appearance follows the two screenshots supplied on 26 October 2026. Command semantics were compared with the official [Codex command reference](https://developers.openai.com/codex/cli/slash-commands), [Claude Code commands](https://code.claude.com/docs/en/commands), and [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode). Muse capabilities were checked against installed official CLI `1.4.13-R6996.1` help, `exec --help`, `skills list --enabled-only --json`, and `usage --json`. This is a Muse adaptation, not a claim that every provider-specific command has an identical implementation.

Validation reports and package evidence are listed in [VALIDATION.md](VALIDATION.md).
