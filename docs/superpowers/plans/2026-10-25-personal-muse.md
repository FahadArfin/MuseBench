# Personal Muse integration implementation plan

> Implement in this session with independent Electron and UI work, followed by review and packaged verification.

**Goal:** Keep the existing coding workspace and add a product selector and personal Muse navigation for AI bot, Chat, Ideas, and Goals.

**Architecture:** React retains the existing workspace mounted while a dedicated sandboxed Electron WebContentsView presents official personal services. Remote pages never receive the local preload, workspace IPC, CLI credentials, or project context. Separate persistent browser sessions retain website sign-in. Use verified official destinations, and report login-dependent navigation honestly.

**Stack:** Existing Electron 45, React 19, TypeScript, Lucide, and CSS.

## Constraints

- Preserve saved tasks, drafts, review state, preferences, native Muse sandbox, and permission gates.
- No undocumented model API adapter, token extraction, fake chat, or fabricated personal activity.
- Remote session permissions denied by default; no unsafe schemes, local IPC, certificate bypass, or arbitrary window opening.
- Native content must be hidden under menus, mobile navigation, dialogs, and local errors.
- Do not publish auth URLs, queries, cookies, or tokens in logs or app state.

## Work

- [x] Add curated personal-browser controller and validated commands, with tests for navigation, bounds, isolation, and lifecycle.
- [x] Add product selector and personal sidebar, retaining the existing coding workspace and its drafts. User clarified Muse Code / Meta AI, then Chat, Ideas, Goals, and separate Muse AI bot.
- [x] Inspect official signed-in routes for Ideas/Goals: verified /ideas and /goals in the real account UI.
- [x] Add integration checks for switching, menu/modal overlays, native bounds, navigation, and code-workspace preservation.
- [x] Run unit suite, build, existing redesign regression, packaged personal UI verification, and focused code review. Fix both narrow-to-wide navigation and actual native window shutdown defects.
- [x] Rebuild and open the actual app, with sign-in handed to the user. Normal-profile signed-in account actions remain a user-assisted check.

## Review focus

Remote pages must have no preload or bridge; hidden views must not obstruct local dialogs; app zoom/resizing must keep bounds aligned; switching modes must preserve drafts; login failure and offline/error state must remain recoverable without exposing auth data.
