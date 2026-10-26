# Native Muse chat implementation plan

**Goal:** Make Muse messages and composer visually match MuseBench while preserving official behavior and isolation.
**Architecture:** Guarded, removable CSS on retained official documents; finite appearance preferences from the local renderer.
**Tech stack:** Existing Electron/React/TypeScript and CSS. No new dependencies.
**Spec:** ../specs/2026-10-25-native-muse-chat-design.md

- [x] Appearance plumbing: validate complete finite command; pass cloned appearance to presentation.apply(contents,compact,appearance), including new views; resolve System theme locally; prove draft/full-layout preservation with focused tests and TypeScript.
- [x] Scoped presentation: add personalChatCSS(appearance) in electron/personal-chat-style.mjs; import into personal-presentation.mjs. Use only enum-mapped CSS values and observed hooks; preserve all official controls. Verify origin guards, removal, serialization and no CSS injection with tests.
- [x] Rich fixture: scripts/fixtures/personal-native-chat.html and scripts/native-chat-smoke.mjs; realistic observed message/composer hierarchy, rich content, approval/status, streaming and late hydration. Prove geometry, appearance, controls and document/draft preservation in source and package.
- [x] Review and ship: inspect fixture captures; verify saved login and unsent draft styling with no message/account changes; full unit/build/package, existing sidebar/personal/coding regressions, byte verification, docs and normal launch. Preserve previous package/validation.

Review focus: site-specific inline styles overriding CSS; rich widgets and approval controls staying visible; composer overlaps at narrow widths; theme changes or delayed hydration losing input; original layout restoration and auth pages remaining untouched.

This existing workspace is not a Git repository. Proceed within the user's explicit implementation request without a new approval gate.
