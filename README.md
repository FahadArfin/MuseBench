# MuseBench

For visual feedback in Codex, run `npm.cmd run preview:ui` and open
[the browser preview](http://127.0.0.1:4319/preview.html). Use **Annotate** in the browser
toolbar to select elements and leave comments. The preview and desktop use one shared
UI. Native screens use sample data; embedded websites use timestamped, read-only
desktop snapshots captured locally. The preview cannot execute shell commands or
change your account. See [browser preview](docs/BROWSER-PREVIEW.md) and the
[parity contract](docs/PREVIEW-PARITY.md).

A local Windows workspace for Muse: code with Muse CLI, keep your personal chats nearby, and create dashboards, animated explainers, reports and presentations in Work.

MuseBench is an independent application. It is not affiliated with or endorsed by Meta. The supplied Patchlight handoff and source archive are preserved; their extracted contents live in `reference/patchlight`.

## Open the app

Double-click **Launch-MuseBench.cmd** in this folder. After packaging, it opens `release/win-unpacked/MuseBench.exe`. Keep the entire `win-unpacked` folder together; the executable uses the files beside it. This local build is unsigned.

From source, with Node 22.14 or later:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

For development: `npm.cmd run dev`. To produce a Windows application directory: `npm.cmd run package`.

## Coding workspace

The interface follows the supplied Codex and Claude desktop references: project overviews, nested saved chats, a conversation with Markdown/code blocks, a bottom composer, and an optional resizable Review panel. The research and evidence behind the design are in [FRONTEND-RESEARCH.md](docs/FRONTEND-RESEARCH.md).

Click a project to see its overview and saved chats. Choose **New chat** there, or the **+** beside a project in the sidebar, to open a blank composer for that project. Submitting the first request creates a separate saved conversation beneath the project. Click its row to resume it, or the project name above the conversation to return to the overview.

Long conversations have a slim **prompt timeline** along the left edge. Hover a tick to preview its prompt and reply, then click to jump back. Keyboard focus shows the same preview; use arrows, Home/End and Enter. The timeline works in Muse Code, Muse AI bot chats and regular Meta AI Chat. It shows messages currently loaded by the service, and appears after two prompts.

Chats open at full width with Review closed. Type a request and press Send: MuseBench creates the chat, verifies the Muse connection and submits it. No local plan approval is required to chat. Planning is optional; your selected action approval mode and the Muse sandbox still apply. If connection fails, the draft remains available to retry. The sidebar restores each chat's messages, command evidence and original file baseline. Reopening a chat refreshes source evidence, stops its old preview and disconnects an old runtime session. Each Windows request uses native exec with bounded replay of your recent conversation, attached source snapshots, initial objective and project guidance. This preserves conversational continuity without claiming native session resume or retaining hidden tool/reasoning state.

Use **Ctrl+K** to search project/chat names and saved message contents, **Ctrl+N** for a new chat, **Ctrl+B** to toggle the sidebar, and **Ctrl+,** for settings. **Ctrl+Enter** sends; optional Enter-to-send is available in settings. Dark/light/system theme, transcript font, text size and motion preferences persist locally. The **profile button at the bottom of the sidebar** opens Settings, Usage & billing, Muse connection, Prompt starters, and Help & commands. When the sidebar is collapsed, use the profile icon at the bottom of the rail. **Review** contains the existing plan, diff, preview, checks and checkpoint controls; in a narrow window, toggle it to return to chat.

Use the composer’s **Muse / effort** button to choose reasoning from None through Ultra. Use the shield button for **Ask for approval**, **Auto-review**, or **No prompts**. Choices are saved per chat and applied to the next Windows Muse request. Every choice keeps the sandbox enabled; new chats default to High and Ask for approval. The **+** menu holds project files and instructions, project selection, chat/plan mode, and the Muse connection.

Click the **microphone** to dictate with Windows speech recognition on this device, then Stop, edit and Send. It appends text to your draft without sending automatically or saving audio. Changing chats, opening overlays, switching products or leaving the window stops recording. Windows needs an installed speech language and a working default microphone.

Type **/** on a new composer line for the command menu. It includes reasoning/access submenus, optional Plan, saved goals and memory instructions, chat/history tools, copy/export, appearance, voice and installed Muse skills. Use arrows, Enter/Tab and Escape, or hover/click. Skills fill an editable request. Provider-specific features that are not connected are labeled **Info**. See the [command reference](docs/SLASH-COMMANDS.md) for aliases and exact behavior.

Native Muse commands run through the existing sandbox and the selected approval setting. Plan mode is guidance, not an enforced read-only boundary. Preview and independent check actions retain their existing local execution behavior and revision gates.

Existing data is preserved. Legacy tasks with a known current-project association are migrated; unrelated older records without a reliable project association remain stored and are not guessed into another project's chat list.

## Context, drafts and chat organization

Open any source folder, including Python, Rust, documentation or an empty project; `package.json` is optional. npm checks and previews appear only when supported by the project.

Choose **Project context** above the composer, **Files & project context** from **+**, or `/context`. Search and preview source files, select up to eight (24,000 combined characters), and save project-specific instructions. **What Muse receives** shows the exact app-supplied context, estimated text size and omitted/shortened history. The total envelope is capped at 64,000 characters. Selected file contents remain with their historical prompt for follow-ups within that budget; later changes do not rewrite those snapshots. Re-select a file to provide a newer revision. Credential paths, binary files and symbolic links are excluded. Changed selections require a fresh review before sending.

Draft text, selected files and conversation mode are saved per project/chat. While Muse works, keep typing and choose **Queue** to add up to five follow-ups. Each entry retains its selected reasoning/approval settings. Verified successful completion advances the queue; failure, uncertain cleanup, Stop, navigation or app restart pauses remaining prompts. A paused queue stays paused when more prompts are added; press the send arrow with an empty composer to resume. Drag a queued prompt by its grip to change the order, or focus its grip and use Alt+Up/Down. You can edit or remove an entry before it runs. Alt+Enter (or the queue icon) also queues a prompt from an idle chat; the send arrow starts it when the composer is empty. Reordering is saved and does not resume a paused queue.

Use **Edit & resend** on an earlier prompt to prepare an editable draft in the current conversation, or **Branch from here** to start a separate conversation with earlier context and the chosen prompt as a draft. Neither action sends automatically or rolls back files. Pin important chats from the chat header or search. Archive hides a chat without deleting it; enable **Include archived chats** in search to find and restore it.

See the [feature gap research](docs/FEATURE-GAP-RESEARCH.md) for the seven additions, primary sources and deferred prerequisites.

The [open-source harness comparison](docs/OPEN-SOURCE-HARNESS-COMPARISON-2026-10-26.md) evaluates Pi, OpenCode, Hermes and DeepSeek Harness against MuseBench's current implementation, with twelve proposed improvements, pinned sources, runtime boundaries and an evaluation plan.

## Meta AI and your personal Muse

### Chat / Work

Choose **Meta AI** in the product selector, then **Work** in the header. Chat keeps your existing official Muse and Meta AI conversations; Work is a native local library powered by your installed Muse CLI and its existing sign-in. Code projects and personal browser sessions remain separate.

Work includes 24 editable templates across Finance, Operations, Marketing, Sales, Analytics and Engineering. Choose **Dashboard**, **Motion**, **Document**, or **Slides**, then attach your sources and send the brief. Selecting a template or a clearly labeled sample makes no model request. Attach up to eight UTF-8 CSV, JSON, Markdown or TXT files, 2 MB each. They are copied into that work item's local workspace and become available to Muse when you explicitly send.

Refine the artifact in chat, inspect its native activity, or use **Edit data** for direct changes. Unsaved editor drafts remain with their item while switching work during the app session. Valid output updates the preview; malformed output keeps the last valid result and displays an error. Stop cancels a connecting or running request. A blocked connection offers **Reset Muse connection** when native cleanup permits recovery. The Muse sandbox is always enabled.

Dashboards include metric details, calculation/source notes, charts and searchable tables. Motion plays editable animated text, shapes and charts. Slides have presentation navigation; documents have structured sections. Exports include standalone interactive HTML, JSON, Markdown, table CSV and PDF; Motion also exports 1280×720 H.264 MP4 when FFmpeg is installed. Slides export as HTML/PDF, not PowerPoint. Artifact previews execute only the application's fixed renderer, never model-generated scripts.

Private Work uses local source snapshots rather than live database/CRM connections. Refresh reads the latest generated artifact; updated input data must be attached explicitly. Motion does not generate footage or voiceover. Research, verification and the initial native timeout investigation are recorded in [Work validation](docs/VALIDATION-work.md).

### Sites

Open **Muse AI → Work → All sites** to create a landing page, portfolio or blank website, import built static files, or copy a Work artifact. Each site has its own native Muse chat, desktop/mobile preview, source editor, saved versions and hosting settings. Muse generates and edits files using the existing Windows sandbox.

Save a version, then open **Share** or **Publish** to prepare a local sharing setup. Planned access, a custom domain, discovery preferences and the selected version persist per site. The launch checklist shows local readiness. Public publishing, URLs, domain registration and visitor access enforcement are deferred; **Publish to web** stays disabled. No Netlify connection is needed, and credential setup/automatic hosting polling are not exposed. Existing provider adapters and saved hosting data remain for later backend integration. See [Sites setup and sharing](docs/SITES.md).

### Shared Spaces

Open **Meta AI → Work → All spaces** to create or join a space. Each space groups Markdown pages and published copies of dashboards, documents, slides, and motion artifacts. Members can read the shared content, leave comments, and revise pages according to their role. Display names are self-declared; an invitation grants access to its holder.

**Create local space** runs on this computer while MuseBench is open. Its invitations work on this computer only. To collaborate across computers, run the standalone server behind HTTPS and join using an invitation or one-use owner setup link. No cloud service is deployed automatically. See [server setup](docs/SPACES-SERVER.md).

Owners create single-use invitations with viewer, commenter, or editor access. Invitations expire after 48 hours. Owners can revoke invitations or remove members; server-side checks reject subsequent requests. Removing access cannot erase content a collaborator already copied. The latest 30 page revisions are retained; restore makes a new revision. Concurrent edits require the exact prior revision, so a stale save keeps your local draft and offers explicit reload or saving as a new page. Spaces refreshes every five seconds while active; this is page revision collaboration, not simultaneous character-by-character editing.

Use **Publish work** to share a saved artifact, then **Update from Work** to publish later edits explicitly. Members receive artifact content and its source annotations. Private Work chats, input file bytes, CLI credentials and browser sessions are not included. **Copy to Work** creates an independent private workspace for Muse revisions without starting a model request. Membership credentials are encrypted through Electron safeStorage; server credentials are hashed. The Muse sandbox and personal login sessions are unchanged.

Verification and remaining hosting limits: [Shared Spaces validation](docs/VALIDATION-spaces.md).

### Personal services

Use the two icon buttons on the right of the sidebar heading to switch directly between **Muse Code** (terminal) and **Muse AI** (chat bubbles). The selected name stays visible in blue; no dropdown is needed. Muse AI contains the existing Meta AI and personal Muse services. The Meta AI sidebar lists your rendered **Muse chats**, **Ideas**, and **Goals** as native rows. Search their titles locally with **Ctrl+K**, expand or collapse groups, and open an item directly. **New Muse chat** or **Ctrl+N** opens an unsent official Muse draft. Chat switches retain each opened conversation and its draft for this app session. The separate **Meta AI Chat** entry opens regular Meta AI, and **Muse AI bot** returns to the personal agent's main conversation.

Sign in inside MuseBench through the official pages. CLI sign-in and sign-in in another browser remain separate. Sidebar titles stay in memory; each group includes up to 100 items exposed by Muse's rendered collection UI. Refresh re-reads those lists. Loading, unavailable, and empty groups are shown explicitly; this is not an exhaustive account export. The conversation composer, idea previews, and goal actions remain Meta's official client.

Switching products keeps coding drafts and review state intact. Muse and Meta AI share the existing sandboxed browser sign-in session, while browser origin rules keep their page storage separate. They have no bridge to your project files or CLI credentials. Meta can reuse its login cookies but may still ask for service-specific access confirmation. CLI sign-in stays separate. Meta AI’s System appearance follows MuseBench’s theme. See [personal Muse integration](docs/PERSONAL-MUSE.md) for service mapping and browser limitations.

Muse's integrated layout removes its duplicate navigation dock. Use the native Search, Feed, Library, and **Accounts** controls; restore the full website layout with the header toggle. **Accounts → Connect WhatsApp** opens Muse's official Messaging channels settings, where pairing is completed with your phone. Official Meta account popups stay in the same service session. Each section retains its page when you switch away.

Muse messages and composer now match MuseBench: plain assistant replies, rounded user messages, readable code blocks, and a roomier composer. Theme, response font, transcript size, and reduced-motion settings carry across. These styles keep Muse's original input, attachment, send, and approval controls; changing appearance or restoring the original layout does not reload your conversation or clear its draft.

Ideas and Goals use the same native appearance, with grouped idea cards, matching previews, goal categories, and setup dialogs. They remain live Muse pages using your existing login. Account updates flow into the native sidebar; no separate collection copy is stored. Opening a preview or setup dialog does not start an idea or create a goal until you use Muse's action button.

## Try the complete review workflow

Choose **Try sample project**. MuseBench copies a small tea shop into its working-project directory. On Windows, new projects live in `C:\MuseBenchWorkspaces\<profile-id>` (on the application-data drive) to avoid Muse's profile-directory shell launch issue. Existing saved projects keep their locations. Typing in the sample starts a real Muse chat in that project. For the optional guided tutorial, choose **Explore the guided sample**, approve the sample plan and apply the demo edit, inspect the actual file changes, start its local preview, test the filter, mark the preview inspected, and run the test script. Then accept the reviewed revision.

The sample plan and edit are deterministic demo content. The files, content hashes, test command, command output, preview process and saved checkpoint are real. A demo does not send anything to Muse or require an account.

For an existing project, choose **Open a folder**. This release supports projects with `package.json`, package-script checks, and direct `vite` development previews. Built `vite preview` output is deliberately refused until its build can be linked to the reviewed source. Other servers report an unsupported recipe. Commands can execute project code, so select a project you trust and inspect the displayed script before running it. Only the selected script runs; implicit npm pre/post scripts are disabled. You can review changes made in your own editor using a manual task.

## Connect Muse

Install and sign in to the official native Muse CLI separately using [Meta's instructions](https://dev.meta.ai/docs/muse-code). MuseBench does not install that binary, collect API keys, or copy credentials from other apps. It discovers the official versioned Windows executable from PATH or `%LOCALAPPDATA%\Programs\muse`, including when this app inherited an older PATH. Open the runtime panel, choose the native executable if discovery did not find it, and connect to your selected project.

On Windows, MuseBench uses the official **1.4.13** CLI's `exec --json` entry point. This avoids the native `serve` host failure while retaining the sandbox. **Ask for approval** is the default; the composer also supports Muse’s Auto-review and sandboxed No prompts settings. Connection checks the native version, Windows sandbox readiness and an inert echo event stream. These are readiness checks; they do not prove a real model request or file confinement. Clicking Send is a real Muse operation and uses your own Muse account's access and billing.

Send a complete request to start a Muse chat; MuseBench connects automatically if needed. Plan mode can be selected from the composer when wanted. The optional checkpoint workflow still requires its review evidence; it does not block conversation. Windows compatibility mode starts an independent run for each message. Compatible workspaces support Muse's managed, sandboxed PowerShell commands, including project tests and builds. Native command cards show their command, output and exit status; they do not satisfy MuseBench's separate revision-check gate. Web, reminder and interactive input tools and hooks remain disabled. Configured external tools that cannot be safely excluded prevent connection. Interactive approvals cannot be answered by this transport; reported requests stop without approval, and native holds without an event time out. Completion requires a correlated native completion event, exit zero, and confirmed cleanup of the run's Windows Job Object. Failed runs are never retried automatically.

Muse 1.4.13 can stall before starting a shell in the Windows user profile. Those projects retain file-editing mode. The connection panel offers **Create working copy** to copy supported source to a compatible location and start a fresh task. Dependencies, Git metadata and local secrets are excluded, so a copied project may need dependency setup. Original files remain untouched. See [sandboxed commands](docs/SANDBOXED-COMMANDS.md) for the Windows workaround and proof boundaries.

The Plan conversation option is guidance, not enforced read-only access. Session resume/replay, automatic reconnect, arbitrary preview recipes and model switching are not implemented. Non-Windows hosts retain the SDK adapter pinned to **1.4.13**, schema **1**, fingerprint `sha256:7fddaf646dbc317e5fcac0785e135eb04df14fbb0db1863089dfd6da21730e5b`, with strict sandbox and permission inspection. Its one-time approval UI remains available for supported hosts.

On the tested machine, **1.4.13-R6996.1** is installed and the user completed browser sign-in. Native sandbox setup reports ready while `serve` reports unavailable, matching [Meta SDK issue #107](https://github.com/meta-models/muse-code-sdk/issues/107). The native `exec` route retains the sandbox. Initial billing was resolved by the user. Both the original file-editing workflow and the subsequent sandboxed-command probes have separate evidence records; see [VALIDATION.md](docs/VALIDATION.md).

## Data and acceptance

Project metadata, task journals and checkpoint records stay in MuseBench's application data directory (normally `%APPDATA%\MuseBench`; development may use `%APPDATA%\musebench`). An accepted checkpoint records the exact reviewed content hash. It is not a Git commit, backup, merge, deployment, or automatic undo operation.

Changing source files invalidates old preview/test evidence and acceptance, and stops the preview so the new revision must be opened again. Check results derive from the actual command's exit status, with a two-minute limit and explicit cancellation. An agent saying “tests passed” never marks a check passed. Generated folders, credential files and symlinks are excluded or refused by the bounded source snapshot; this app does not provide a full repository backup. Snapshot limits are 4,000 files, 2 MiB per file, and 24 MiB total.

## Verify

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:ui
npm.cmd run test:redesign
npm.cmd run doctor
```

The UI test uses Electron itself and a disposable application data folder. No API key or live model call is required. The extracted historical adapter tests remain separate from the new controller and desktop checks.

`npm.cmd run doctor:host` explicitly runs the installed CLI's version/sandbox checks and a bounded SDK initialization, then saves `artifacts/muse-install/verification.json`. It creates no session and sends no model request. Exit code 2 means the native host is not eligible for a live session.

After account access and billing are ready, `npm.cmd run test:live -- --muse-bin C:\absolute\path\to\muse-bin-VERSION.exe` exercises one actual Muse edit and the complete desktop review workflow. This uses your account. Add `--connect-only` to check desktop integration and native readiness without a model request. See [LIVE-WORKFLOW.md](docs/LIVE-WORKFLOW.md) for details and reports.

Add `--shell` to exercise a real sandboxed project test inside that Muse turn, its command card, the independent review check, and persistence. Add `--reasoning xhigh --approval auto` to verify selected run settings (`ask`, `auto`, `never`). Windows builds compile process-lifetime and local speech helpers using the installed .NET Framework x64 C# compiler; the packaged app includes both helpers and does not compile at runtime. `node scripts/composer-smoke.mjs` checks the composer and transcribes synthetic audio without using a microphone.

## Code chat tools

Use the composer’s **Add** menu for these tools in both desktop and browser preview:

- **Screenshots:** paste, drop, or choose up to four PNG/JPEG/WebP images (8 MiB each). Attachments follow drafts, queued prompts, and chat history; desktop sends validated local image files to native Muse.
- **Skills:** search the installed catalog or use shortcuts for planning, frontend delivery, Git, and workflow authoring. Availability and source diagnostics remain visible. Selecting a skill adds a request to the draft; it does not claim the runtime has loaded it.
- **Worktrees:** create a new branch from a committed base, or reopen a retained worktree. Uncommitted source changes stay in the original folder. Dependencies, merging, and deletion remain explicit operations outside this picker.
- **Session:** native Windows Code chats retain one Muse session per chat. Existing chats seed their history on the first request. Later requests continue that session without replaying history. Interrupted runs require Continue or Start fresh; an unconfirmed input receipt requires Start fresh. A missing native log blocks continuation rather than silently resetting context. Branching creates an independent session.

The preview uses the same React components with simulated local data; it does not execute Git, call Muse, or inspect your account. Native session persistence currently applies to Windows Code chats; Work and Sites generation retain independent requests. This does not add live mid-run steering.

Code chats can now run in the background while you navigate. Each chat owns its session, output, queue and Stop action. Up to four chats may run concurrently in separate folders/worktrees; overlapping checkout roots cannot run simultaneously. Closing MuseBench stops its owned processes; interrupted native sessions require recovery on restart. The connection dialog lists supported capabilities. Composer Add → Task budget offers Standard (3 min/8 steps), Extended (15 min/32 steps), and Deep (45 min/96 steps); these are not token spending caps.

### Interactive Full access connection

Windows Code chats can opt into **Your Muse connection → Interactive · Full access**. The official `serve --disable-sandbox` host runs with your Windows account permissions, while MuseBench still verifies the pinned SDK/CLI contract and the separate Ask me approval profile. The default remains native exec. Disconnect before changing transport; this opt-in is connection-scoped.

During an interactive run, Enter sends a correction to the existing turn; **Alt+Enter** queues a later prompt. MuseBench binds corrections to the exact active turn and checks the native acknowledgement without automatic retries. A rejected or uncertain correction remains in your draft. Interactive mode currently requires the default model, Ask for approval, text input and no exec budget preset. Reconnecting starts a new native session seeded from the app conversation; exec saved sessions are separate.

The **Session → Compact context** control is available after a turn completes on an interactive connection. It sends native `session/compact`, displays admission separately from the observed terminal outcome, and reports token counts only when Muse supplies them. Local chat history and files are preserved. Pending or uncertain compaction prevents another turn; disconnect to resolve an unknown connection. Unfinished receipts become unknown after restart and are never automatically replayed.

**Session → Child agents** shows native subagents and workflow attempts observed on the interactive connection. Available controls include child messages, follow-up tasks, interrupt/stop, resume/reopen/close, result retrieval, and workflow retry/skip. Actions bind the exact observed child revision and latest attempt; Muse remains the eligibility authority. Command admission and child results are shown separately. Unknown commands are not retried, and children keep their checkout reserved through the parent reporting turn. Parent reports remain attached to the original app request.

Browser preview renders these same controls with labeled sample children and simulated admission receipts. It does not execute agents. Live verification on the pinned host confirmed a child message changed its result, interruption cancelled child work, and both parent reporting turns completed. Other controls have protocol-boundary regression coverage; their eligibility depends on native state. The tested generated workflow child rejected a follow-up with `subagent_state_ineligible`, which is shown as a rejection, not successful execution. Children from earlier explicit requests remain inspectable, but new work on them is disabled to preserve parent attribution.
