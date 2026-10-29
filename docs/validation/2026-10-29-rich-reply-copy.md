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

CI follow-up: runs 40963934313 and 40963934307 exposed an empty native clipboard item in the smoke setup, before any product action. The preservation helper now skips empty MIME lists and restores an initially empty clipboard with `clear()`. The browser and desktop copy suite passed again (6 + 8 checks), evidence `rich-copy-empty-clipboard.log` and `artifacts/response-actions/source-qBxEPS`. This corrects the validation harness; product copying is unchanged. Release acceptance still requires the replacement CI run.

The next validation run, 40965719243, passed copying and stopped at the pre-existing real speech-engine check: the hosted Windows runner lists voices but has no usable audio session. Real speech startup remains exercised locally; CI uses the existing injected speech-interface check. `CI=true npm run test:reply-copy` passed with 6 browser and 7 desktop checks (`rich-copy-ci-environment.log`). No product speech code changed.

## Scope

Source and actual-host clipboard verified, using isolated profiles and no model requests. Browser clipboard capability/error paths are injected. External editors may style pasted content differently; no external-editor fidelity claim is made. Published/installed release acceptance remains separate.
