# Prompt timeline implementation plan

**Goal:** Hover previews and quick prompt navigation in Muse Code and normal personal chat.
**Architecture:** Shared DOM timeline with a React host and guarded personal-page installation. Private transcript snippets remain in their own renderer memory. No new IPC, account endpoint or database.
**Stack:** Existing React/TypeScript, Electron and plain browser JavaScript/CSS.
**Spec:** ../specs/2026-10-26-prompt-timeline.md

- [x] Add a failing real-Electron interaction test and confirm current UI lacks the rail.
- [x] Implement shared timeline, Code message anchors and personal-page lifecycle/origin guards. Inspect real Meta AI structure before selecting hooks.
- [x] Verify jumps, previews, keyboard, streaming, repeated text, original layout restoration, drafts, narrow layout and themes; compare rendered screenshot to supplied reference.
- [x] Run relevant regressions, build/package, verify saved session and bytes, reopen app and record evidence.

Review focus: user/assistant role accuracy, stale nodes after route changes, scroll observer loops and streaming performance, tooltip clipping, focus and draft preservation, no privileged access or transcript logging.

User steering: include both personal services; fix the observed blocked Meta AI login and reuse the existing Muse browser sign-in. Exact auth.meta.ai origin added; shared partition retains same-origin protections and invalidates shared account caches at authentication boundaries. Meta System appearance now follows MuseBench.
