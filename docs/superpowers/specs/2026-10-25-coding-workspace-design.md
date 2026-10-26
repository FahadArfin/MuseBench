# MuseBench coding workspace

The user requests a close recreation of the supplied Codex and Claude desktop screenshots, built for programmers. This is a real upgrade to the existing Windows app, with its Muse sandbox and saved data preserved.

## Direction and approach

Keep Electron, React and TypeScript. Rebuild the renderer around a compact Codex-style project/chat sidebar, quiet conversation canvas and bottom composer. Put the existing plan, diff, preview, checks and acceptance workflow in a toggleable right panel. Use Claude-style two-column settings. The screenshots supply the chosen visual direction; exact proprietary source and undocumented framework details are not prerequisites.

A cosmetic recolor would retain the current tutorial-oriented layout, so it does not meet the request. Rebuilding the backend in another language would add migration risk without improving these interactions. This implementation uses the existing controller and native sandbox adapter.

## Visual specification

- Default dark: canvas #181818, sidebar #1c1c1c, rail #202020, raised surfaces #242424, borders #303030, text #ececec and muted #999999.
- 48px activity rail, 252px project sidebar, 48px workspace header; compact 30px navigation rows; conversation content at most 760px wide.
- System sans-serif interface at 13px, conversation at 14px/1.7, native monospace command/diff text. Existing Lucide line icons closely match supplied thin outline navigation icons.
- Rounded user bubbles, restrained assistant transcript, collapsible native command results, floating bottom composer, contextual status and review controls.
- Right review panel approximately 440px, resizable/collapsible. On small screens it becomes the main work surface and navigation overlays. No page-level horizontal overflow.
- Settings modal: left category navigation, right grouped rows; theme dark/light/system, text size, font and motion persist locally.

## Working behavior

Project-grouped saved task navigation, new task composer, search across known projects/tasks, Ctrl+K command palette, Ctrl+N new chat, Ctrl+B sidebar, Ctrl+, settings. New prompts create a task and show its approval plan; nothing silently submits model work. Existing tasks restore their baseline and messages safely. Returning to a changed project invalidates stale evidence. Customize provides real prompt starters and shortcuts, not fictional integrations.

Keep native permission inspection, Ask me, supervised sandbox commands, independent checks, revision-bound preview and checkpoint gates. Stop remains reachable. User profile shell limitation and working-copy action remain visible in connection settings. No credential copying, model switching, fake plugins or background auto-approval.

## Compatibility and acceptance

Tasks gain project association with conservative legacy migration; existing unassociated records are not guessed into unrelated folders. Settings only change renderer appearance. Default user data is untouched by test fixtures. Verify existing tests, full Electron tutorial, history across projects/restart, keyboard/search/settings, narrow layout, source/package parity and a bounded live native shell workflow if account access allows. Compare rendered screenshots to provided references and document material differences.
