# Browser annotations and controlled browser implementation plan

**Goal:** Reproduce the supplied workflow in Muse Code: inspect an HTML element, type or dictate a comment, adjust requested styles, collect numbered comments, and attach an editable annotation bundle to a prompt. Extend the existing browser so the native Muse agent can inspect and interact with its own chat's browser when explicitly enabled.

**Source:** Clean `d23df253a2ef3e0d24712cf790984240c62a966f`. Preserve installed app/profile. Keep this batch local. No paid provider requests, account changes, publication, or installed-app restarts.

**Design:** Reuse the shared preview picker and image markup. Page contents, selectors, computed styles, screenshots and diagnostics are untrusted reference data. Capture rendered element metadata rather than input values. Annotation context is a typed attachment, independently editable and persistent with the Code draft/queue; normal sending/steering rules remain in charge. An annotation contains `{id,page,target,note,styleChanges?}`. `target` retains structural selector, tag, title, visible text, normalized rectangle, and optional bounded computed styles. Requested style properties are color, backgroundColor, opacity, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, padding, margin, borderRadius, width, height. Comments are numbered by current order, capped at 20 per bundle, 4,000 characters each.

**Browser:** Keep the existing sandboxed isolated chat WebContentsView. Use a captured page while annotating so native child views cannot cover the annotation controls. Navigation/owner changes invalidate live selection tokens. Browser agent tools are routed through a narrowly scoped local MCP bridge to the native Muse runtime, with per-chat explicit control enabled, bounded calls, screenshot/DOM references and no arbitrary JS bridge. The normal approval model remains authoritative. No separate AI provider/API key is introduced. Public pages and localhost may be opened, while non-web protocols, downloads, file pickers and permission changes remain outside this browser toolset.

## Independent work

1. **Browser backend/control:** Extend `electron/chat-browser.mjs`, its session types, new browser control/MCP transport files, and native runtime configuration. Implement fixed capture/inspect and status/navigate/click/type/scroll/key tools with current-owner/document checks, disabled-by-default control, limited output and navigation invalidation. Add focused backend/transport tests. Coordinate exact integration hooks for main and SessionBrowser.
2. **Annotation UI/dictation:** Extend `ProjectPreview.tsx` using reusable annotation UI and add per-comment dictation to image markup. Support multiple pins, edit/delete, comment text, requested style controls, clear/save batch; no automatic prompt sending. Keep exact existing preview tests compatible or update their flow. Preserve dictation ownership across mounted composers/editors. Add isolated interaction checks.
3. **Attachment data flow:** Define/validate typed annotation bundles in a shared module, drafts/messages/queue and input contracts; preserve them through saved prompts, cloning, transfer and source-bound preparation. Include the bundle in native prepared context and history without treating page data as instructions. Add focused durability/queue/context tests.
4. **Integration:** Root wires browser UI, shared attachment chip with hover/focus details, App composer and transcript, sidebar resizing/full-width browser, native main/preload hooks and preview simulation. Reuse established icon/style conventions. Review current official documentation for reference, then verify browser/annotation interactions in isolated Electron, wide/narrow visual states, typecheck and targeted tests. Perform bounded final review and fix material issues.

## Acceptance

- Several page elements can be annotated without sending intermediate prompts; pins, edit/delete and the annotation count agree.
- Dictation appends to the intended annotation only and respects stop/cancel and context changes; no real microphone is used in automated checks.
- The prompt shows a compact Annotations (N) attachment with accessible details and editing/removal; drafts survive navigation/restart, and queues carry the correct bundle.
- The native Muse tool boundary can operate the enabled browser through a bounded local fixture without a model/provider request, and rejects stale, hidden, foreign or disabled ownership.
- Existing single-preview feedback and image drawings continue to work; desktop/preview share components with explicit capability differences.
- Report actual verification and any native/provider limitations honestly. No claim of full Codex parity or of a paid live model test.

## Implemented workflow

Open a Code chat's session tools, choose Browser, enter an HTTP/S address or a search, and optionally expand the panel. Desktop/Tablet/Phone presets resize the page. Muse control is a separate, disabled-by-default checkbox; the normal native approval rules still apply. The browser's nine fixed MCP tools support status, navigation, DOM references, screenshots, clicking, writable text fields/textarea, scrolling and keys. They cannot evaluate arbitrary agent JavaScript. The view uses a temporary isolated browser partition, separate from Meta Chat login data.

Choose Annotate, select an element, type or dictate its comment, optionally describe requested styles, and save it. Repeat for multiple numbered pins, then attach the comments together. The composer shows Annotations (N), with hover/focus details, edit, dictation and removal. Sending/queuing includes the typed references and requests. The same attachment survives draft storage, saved prompts, transfer, queue edits, steering and message history. Existing image drawings remain available and point comments gain their own dictation control.

Desktop annotations use a page snapshot so the native browser cannot cover controls. Captured metadata stays bound to its document; navigation invalidates live geometry but retains saved comments as historical references. Closing annotation mode discards un-attached editor notes; Attach is the durable draft boundary. Requested styles describe edits for Muse and do not immediately restyle the website. Element references currently address the top document rather than iframe/shadow-root internals. Browser typing supports writable standard text fields and textareas and rejects unsupported fields or over-limit insertions without partial changes. Browser preview shares the annotation components for local project frames; native page capture/control is desktop-only.

## Verification and review

- Full local build, subsequent final typecheck/renderer build, and focused runtime/data/preview tests passed (218 in the combined run).
- Native Electron control smoke passes real DOM, mouse, exact-field text insertion, Enter form submission, screenshots and actual stdio/authenticated-loopback MCP round trips, including hostile focus redirection, field maxlength and file-picker cancellation. No model/provider request was made.
- Native App/session-tools integration passed: three page comments with injected dictation and styles, rendered snapshot pixels, auto-navigation retention, chip hover/edit/delete, modal/native-view stacking, zoom geometry, narrow layout, browser disposal and existing side-chat/media flows. Evidence: `artifacts/session-tools/desktop-7toM4N`.
- Fresh production shell/preload/controller preview check passed exact h1/p selection, equal iframe/overlay geometry, two typed comments/styles, original prompt preservation, durable draft/chip, reopen and same-URL invalidation. Evidence: `artifacts/preview-annotations/app-Ub1Mdp`.
- Fresh built image annotation check passed (`artifacts/image-annotations/desktop-PDarJA`); injected browser/image dictation, ownership, overflow recovery and existing speech durability checks passed. Automated dictation uses injected events, not a real microphone.
- Independent review identified and resolved navigation data loss, focus redirection, Enter delivery, field maxlength and queued/active MCP cancellation. An already-dispatched browser action can still have an unknown outcome after cancellation; inspect before retrying. Cancellation tests include a real HTTP abort and preserve the connection lease.
- CI registration includes the native browser control fixture, multi-annotation session-tools flow and injected annotation/dictation fixture. No publication, installation, installed-app restart, profile modification, account change or paid request occurred.

Useful separate follow-ups are console/network diagnostics, screenshot comparisons and multiple browser tabs. They are not part of this batch.
