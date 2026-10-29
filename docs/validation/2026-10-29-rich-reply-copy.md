# Rich reply copy validation

29 October 2026. Roadmap C02, baseline `9fc76d21e7c011c79b7768ec146eaee47d14b247`.

Copy reply and `/copy` now offer original Markdown text plus sanitized rich formatting. Code-block copy stays plain code. Formatting loads only on demand. The desktop accepts only bounded source text and constructs its own fixed text/plain and text/html clipboard representations. No copied DOM controls, raw HTML, remote images, or executable/local URLs.

## Evidence

- Serializer: 3 tests passed for headings, lists, tables, code, safe links, untrusted markup and source bounds.
- `npm run test:reply-copy`: 6 browser checks and 8 real Electron checks passed. Actual desktop clipboard contains original text and rich HTML. Invalid IPC payloads leave it unchanged. Injected rich-write rejection falls back through the actual Copy button; both-write rejection remains an error. Existing feedback, speech, branching and narrow layout pass.
- `npm test`: 1,393 tests passed, zero failures.
- `npm run build`: passed; rich serializer is an on-demand chunk. Existing main-bundle-size advisory remains.
- `npm run test:code-responsiveness`: passed; large transcript, subscription and timeline behavior retained.
- Fresh review identified a missing host rich-copy fallback. Addressed with browser and actual-host regression checks and reran the focused suite. No other findings.

The original desktop smoke needed an explicit switch to Muse Code after startup/reload, matching the current default Meta AI surface. Electron 45's [clipboard API](https://www.electronjs.org/docs/latest/api/clipboard) uses asynchronous writes with ClipboardItem arrays. Rich copying follows that contract; existing plain copy handlers now return their write promises so callers observe errors and completion.

Ignored evidence: `artifacts/reply-copy/preview-ZSPOVY`, `artifacts/response-actions/source-dUnRK2`, `artifacts/changelog-roadmap-2026-10-29/rich-copy-*.log`.

## Scope

Source and actual-host clipboard verified, using isolated profiles and no model requests. Browser clipboard capability/error paths are injected. External editors may style pasted content differently; no external-editor fidelity claim is made. Published/installed release acceptance remains separate.
