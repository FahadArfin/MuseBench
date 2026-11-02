# Built-in file viewer

Muse Code's session tools now include **Files**. Click a supported local file link in a reply, or browse the current project's folders from Files. The same viewer runs in the desktop app and browser preview; the browser preview uses isolated sample documents.

| Format | Preview |
| --- | --- |
| HTML / HTM | Interactive sandboxed page, with local relative CSS, JavaScript and images. Source view is available. |
| Markdown | Headings, tables, lists, code and local images using the existing Markdown/GFM renderer. Source view is available. |
| PDF | Local PDF.js rendering with selectable text, page navigation and zoom. |
| Word DOCX | Local rendering of authored pages, text, tables, images, headers, footers and notes. |
| PowerPoint PPTX | Authored slide layout, text and supported embedded media, with slide navigation and zoom. |
| Images and text | Image preview or an escaped text view; includes common JSON, CSV and log files. |

The viewer can expand to fill the workspace, refresh a snapshot and save its exact original bytes through the desktop Save dialog. General settings → **Preview generated files** controls whether a newly completed reply's local document link opens automatically. It opens only while the prompt is empty and the Code chat is visible; switching to an old chat does not open old links automatically. The viewer is loaded separately from the main chat bundle.

## File comments

Click the comment icon, then a point on the preview. Add a note or use the existing microphone/dictation control, and save multiple numbered comments. **Attach comments** puts the path, file revision, page and normalized position into the chat draft. It does not send a message or edit the document. Attachment verifies that the file has not changed. Refresh and comment again if it has.

PDF, DOCX and PPTX positions refer to the displayed page or slide. HTML positions refer to the visible embedded page viewport; its separate sandbox deliberately prevents inspecting its internal DOM or scroll position. Existing page-browser annotations remain available for DOM-aware website feedback.

## Fidelity and resource limits

This is local browser rendering rather than a Microsoft Office process. Unavailable fonts, advanced layouts, fields, transitions and unsupported Office features can look different. DOCX pagination follows authored section/page breaks; it does not implement Word's complete layout engine. PPTX EMF/PDF conversion fallback is disabled. Older binary `.doc` and `.ppt` files are not supported; save them as DOCX or PPTX first. Encrypted or corrupt documents show an error rather than an invented preview.

The host accepts snapshots up to 100 MiB and retains at most two; the browser decoder accepts up to 40 MiB. Text/Markdown rendering is capped at 2 MiB, while the source tab is an explicitly marked 256 KiB excerpt. Office parsing limits entries and decompressed size, with up to 300 authored pages/slides. PDF pages load individually, up to 1,000 pages, with bounded canvas pixels. Downloads preserve complete host snapshots. These bounds protect the UI from archive bombs and unbounded rendering; they are independent of repository indexing limits.

## Isolation and packaging

Files must be regular files below the selected chat's project root. Symlink/junction traversal, hidden path segments, executable formats and arbitrary renderer-supplied roots are rejected. Bytes are captured once under an opaque, chat-bound capability. Owner/project changes and close revoke capabilities. Comment attachment verifies the original identity and content hash.

The trusted viewer uses a fixed local bundle in an opaque iframe, without a native preload. HTML runs in a second opaque sandbox with no native bridge, external network, popups, top-level navigation, forms, microphone or camera access. Office external relationships/media are disabled. Bundled PDF workers, fonts, CMaps and WASM are local. The production navigation guard admits only the trusted viewer entry, current-file loads and same-capability HTML navigation.

`scripts/build-file-viewer.mjs` runs after Vite. Assets are packaged once as real `resources/file-viewer` files, and package verification compares them against the source build. They are outside ASAR because the file service verifies real file identities. Renderer licenses are included in the viewer assets.

## Verification

- `node --test test/file-preview*.test.mjs` covers paths, snapshots, archive guards, ownership, comments, exports, navigation and deferred-operation races.
- `npm.cmd run test:file-renderers` renders real local fixtures in an opaque browser sandbox, checks seven formats, PDF glyphs/text, Word images/tables/header/footer, slides, cancellation and blocked external requests.
- `npm.cmd run test:file-viewer` checks the shared UI and native protocol, then the actual source app with an isolated profile and a manual chat. It exercises file links, source, page/slide navigation, zoom, comments, exact original downloads, ownership revocation and narrow/fullscreen layouts. No model requests or installed-profile changes are needed.

Inspired by the [artifact viewer reference](https://learn.chatgpt.com/docs/artifacts-viewer?surface=app). Local rendering uses [PDF.js](https://mozilla.github.io/pdf.js/), [docx-preview](https://github.com/VolodymyrBaydalka/docxjs), and [PptxRenderer](https://github.com/aiden0z/pptx-renderer).
