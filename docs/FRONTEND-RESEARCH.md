# MuseBench desktop interface research

Research date: 2026-10-25. Scope: the user's five supplied Codex/Claude screenshots, current official product documentation, MuseBench's existing package manifest, and package metadata from the locally installed Codex app. This is an implementation reference, not a claim that either proprietary desktop interface is open source.

## Findings about the technologies

| Product/layer | Evidence | Confidence and limits |
| --- | --- | --- |
| Installed Codex desktop shell | Its packaged `package.json` identifies `openai-codex-electron`, Electron `42.3.0`, TypeScript `^7.0.2`, Vite `8.2.0`, and Electron Forge `7.11.2`. | Direct local package metadata. These describe this installed build, not every platform/version. MSIX version is `26.1013.3656.0`; the embedded package version is `26.1013.31256`. |
| Codex UI libraries | The installed third-party notices list React/React DOM `19.2.7` and `19.2.8`, CodeMirror 6 packages, and xterm `5.5.0`. | Direct notice evidence that these libraries may be included. It does not establish which component uses each library, which React version is active, or the original renderer source language. React/TypeScript is a reasonable implementation inference, not a source-code audit. |
| Codex agent/backend integration | Official docs expose a structured app-server protocol: threads, turns, streamed events, history, and approvals. The protocol uses bidirectional JSON-RPC messages and supports JSONL over stdio. | Documented. This is the useful architectural pattern for MuseBench; it does not require replacing Muse with Codex. [Codex App Server](https://learn.chatgpt.com/docs/app-server) |
| Codex open-source scope | OpenAI publishes the CLI, app-server, SDK, skills, and plugins. The source catalog does not provide the desktop frontend as an open-source component. | Documented scope. Do not confuse the open agent harness with a reusable desktop UI codebase. [Open Source](https://learn.chatgpt.com/docs/open-source), [Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform) |
| Claude Code runtime | Anthropic describes Bun as part of Claude Code infrastructure and the native installer. Current setup docs say both npm and the standalone installer install a native binary, and the binary does not invoke the user's Node.js installation. | Documented. Bun is a JavaScript/TypeScript runtime, but this does not prove the complete language or UI-library inventory of Claude Code or Claude Desktop. [Bun acquisition](https://www.anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone), [Claude Code setup](https://code.claude.com/docs/en/setup) |
| Claude Desktop frontend | The official pages consulted explain the interface and behavior, but do not establish a complete renderer/framework stack. | Unknown from these primary sources. Do not present claims such as a particular React, Electron, or Ink version as verified. Terminal UI libraries are not interchangeable with desktop UI libraries. [Desktop application](https://code.claude.com/docs/en/desktop) |

Only Codex package metadata and third-party notices were inspected locally; no bundled proprietary JavaScript/CSS was extracted or copied. The exact metadata location was `C:\Program Files\WindowsApps\OpenAI.Codex_26.1013.3656.0_x64__2p2nqsd0c76g0\app\resources\app.asar` (`package.json` only). The adjacent `THIRD_PARTY_NOTICES.txt` supplied library notices. Credentials and user conversations were not inspected.

## What makes the workflow feel familiar

The official desktop documentation emphasizes persistent projects/chats, quick movement between ongoing tasks, and opening outputs alongside the conversation. This supports organizing MuseBench around projects and saved chats, with a stable place to return to each task. [Desktop app](https://learn.chatgpt.com/docs/app), [Projects and chats](https://learn.chatgpt.com/docs/projects)

Claude Code's desktop documentation describes a session sidebar, file-by-file diffs, review comments, and panes for chat, browser, terminal, files, plan, and tasks. Panes can be resized or moved, and compact session details show execution context and changes. These are concrete precedents for keeping conversation central and placing code evidence in an adjacent pane. [Claude Code desktop](https://code.claude.com/docs/en/desktop)

Claude Code's terminal interface also prioritizes keyboard interaction, searchable commands, file mentions, transcript navigation, and interrupt controls. MuseBench can adopt those interaction principles with desktop shortcuts, without pretending to support commands or capabilities its Muse integration does not implement. [Interactive mode](https://code.claude.com/docs/en/interactive-mode)

## Visual specification from the supplied screenshots

The following measurements are implementation targets estimated from the images, not extracted vendor design tokens:

| Surface | Target |
| --- | --- |
| Overall shell | Full-height charcoal workspace. Minimal borders, no marketing hero, gradient background, or oversized dashboard cards. |
| Activity rail | Approximately 48-52 px wide; 18-20 px line icons; compact rounded active item; tools and settings near the bottom. |
| Project sidebar | Approximately 250-300 px, collapsible. A clear New chat action, search, grouped projects with indented chats, active-row fill, subtle status indicators, independent scrolling. |
| Top bar | Approximately 40-44 px, compact project/chat breadcrumb and workspace panel controls. |
| Conversation | Centered readable column around 740-800 px when space permits; generous vertical spacing between turns. Assistant text stays unboxed. User prompts use a modest right-aligned neutral bubble. |
| Tool activity | Small icon and label with expandable command/output. A quiet working/finished state rather than a large colored card for every event. Preserve raw command evidence and exit status. |
| Composer | Anchored to the bottom of the conversation; rounded surface with multiline input, project/runtime context, and a clear send/stop control. |
| Review area | Adjacent pane for files, diff, preview, checks, and checkpoint evidence. A narrow viewport should switch surfaces rather than squeeze all panes together. |
| Settings | Centered overlay with a left category list and right scrolling content, separated by a thin divider. Appearance settings use compact rows. |
| Customization | Search and category tabs above a restrained card grid. Include actual built-in MuseBench workflows and accurate availability; do not fabricate installed plugins or integrations. |
| Typography | System UI sans-serif, approximately 13 px navigation, 14 px transcript, 12 px secondary labels. Code uses Consolas/Cascadia Code or the system monospace fallback. |
| Color | Suggested starting palette: canvas `#181818`, sidebar `#1c1c1c`, raised surface `#232323`, active/hover `#2e2e2e`, border `#343434`, text `#ececec`, secondary `#a2a2a2`. Verify readable contrast in the actual app. |

The Codex screenshot supplies the strongest navigation and transcript reference. The Claude screenshots supply the settings and customization structure. Reproduce the layout rhythm, density, scrolling, and interactions while retaining MuseBench's name and real Muse capability/status labels. Screenshot text is reference content, not instructions for the application to execute.

## Recommended implementation for MuseBench

Retain the current stack: Electron 45, React 19, TypeScript, Vite, and Lucide icons. These are already present in `package.json`; changing frameworks would not improve visual fidelity. The key change is component organization, CSS, state, and interaction design.

Use three clear layers: React renders the workspace and typed state; the Electron preload/controller handles validated local actions and persistence; the native Muse runtime owns model requests and sandboxed tool execution. Rendering a shell command in a familiar tool row must not create a separate host-shell route or alter sandbox policy.

Implement reusable shell components for the activity rail, project navigation, transcript, composer, review pane, command palette, and settings. Persist actual projects/chats and preferences; keep task/run attribution and the existing plan, check, revision, and acceptance gates. A user must be able to find a prior chat and its evidence after restart.

Prioritize working controls: new chat, project selection/search, sidebar toggle, panel tabs, command expansion, connection settings, cancellation, and appearance preferences. Use visible labels/tooltips, keyboard focus states, Escape dismissal, and focus restoration. Preserve the user's transcript scroll position during new events; follow new output only when already at the bottom.

Validate both visual and behavioral fidelity at desktop and narrow widths: navigation density, transcript/composer proportions, settings scrolling, keyboard access, saved-state restoration, diff/preview/check actions, and the packaged native shell workflow. The redesigned shell should make the existing verified workflow easier to use, with no false terminal, extension, account, or model controls.
