# Native Muse collections implementation plan

**Goal:** Match Ideas and Goals to MuseBench while retaining account synchronization, login and sandbox.
**Architecture:** Reuse finite appearance settings in a removable collection stylesheet; continue rendering official documents and reading bounded native-sidebar metadata.
**Tech stack:** Existing Electron, React, TypeScript and CSS. No dependencies.
**Spec:** ../specs/2026-10-25-native-muse-collections-design.md

This is an authorized extension of the existing design. Implement inline in the current non-Git workspace.

- [x] Add a realistic offline collection fixture and smoke script. First run against current source to show missing presentation. Assert theme, layout, interaction retention, service-rendered updates and origin guards through the real Electron application.
- [x] Extract shared finite appearance resolution into electron/personal-appearance.mjs; use it in personal-chat-style.mjs and new personal-collections-style.mjs. Attach collection CSS through personal-presentation.mjs's existing serialized insert/remove path. Run unit and source fixture checks.
- [x] Inspect dark/light/narrow captures, review selectors against live DOM, and verify signed-in Ideas preview and Goals category setup without submitting actions. Record only counts/geometry/booleans. Preserve the normal app profile.
- [x] Archive the previous package/validation. Build/package; run collection, chat, sidebar, personal and coding checks; verify package bytes; update documentation and reopen normal app.

Review focus: unrelated dialogs or side-by-side chat must not inherit collection layout; changed/unknown markup must remain usable; long titles and menus must remain reachable at narrow widths; appearance toggles must preserve document and action state; live synchronization must continue through official DOM updates rather than a stale local copy.
