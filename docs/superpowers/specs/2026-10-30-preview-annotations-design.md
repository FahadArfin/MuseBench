# Preview annotations to editable feedback

CX05 continues the authorized roadmap. In the existing Code project preview, a compact **Comment on preview** control enables a pointer/keyboard selection overlay. Clicking a visible element captures its page, structural selector, tag, bounded visible excerpt and rectangle. A compact comment editor offers **Add to draft** and cancel. The existing composer remains the only place that sends a request.

Builder choice: use the existing sandboxed local project iframe, with fixed DOM inspection through Electron's frame API. Do not proxy/rewrite arbitrary project HTML or expose a privileged bridge inside the project. A browser demonstration uses the same capture function and service against a same-origin sample. Actual cross-origin desktop capture requires a real Electron test; fixtures are not provider acceptance.

## Contract

- Only the current Code chat/project and running loopback project preview are eligible. Capture is scoped to the exact direct child frame name, owner, URL and navigation generation. Nested frames are represented by their outer element, never traversed.
- Coordinates are normalized viewport points. Keyboard arrows move a visible crosshair; Enter selects and Escape cancels. The overlay intercepts clicks, so selecting a button does not activate it. A selected element remains outlined while its comment is edited.
- Capture reads at most 500 text nodes, 600 characters of visible text and 160 characters of page title. Skip form controls, editable content, hidden content, script/style/template nodes, and offscreen text. Never read form values, cookies, storage, source files or full HTML. Page query/hash/credentials are omitted from feedback.
- Store one ephemeral selection for at most ten minutes. A second selection supersedes pending first reads. Navigation (including same-document), preview stop/restart, chat/project switch, timeout or frame destruction invalidates it. Re-read the structural target before preparing feedback and reject changed content/geometry.
- Page-derived strings are plain bounded data, never instructions or executable input. Feedback labels JSON-encoded context as untrusted evidence. No page-requested action, network call, permission change or model request.
- Notes are 1–4,000 characters. Append to the exact current durable draft, preserving existing text, images, files and mode. Enforce the existing 16,000-character draft limit, retain the note on failure, and guard late reads/results after navigation. Sending remains explicit.
- Keep the current iframe sandbox, CSP and trusted top-level IPC guard. Only a fixed capture function executes in the local project; no caller-provided JavaScript/selector is accepted at the public IPC boundary.
- Compact responsive controls, Facebook-blue selection, reduced-motion support. No dependency, network integration or telemetry added.

## Scope and evidence

This delivery covers Code project previews. Personal Meta/Muse websites, Work artifacts, remote sites and nested-frame internals are outside this first contract. Context is a point-in-time observation, not a source-code mapping or screenshot. A short title/selector/excerpt is sufficient for this roadmap row.

Verify pure admission, ownership, invalidation and bounds with unit tests; visible DOM capture and the exact production component in browser/Electron; then actual packaged tutorial preview with isolated data. Keep real personal profiles untouched until the separately verified authorized release install.

References inspected 30 October 2026: [Electron frame API](https://www.electronjs.org/docs/latest/api/web-frame-main), [navigation events](https://www.electronjs.org/docs/latest/api/web-contents). Existing project frame and durable draft code supply the local implementation contract.
