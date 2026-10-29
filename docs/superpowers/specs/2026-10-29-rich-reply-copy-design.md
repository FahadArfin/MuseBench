# Rich reply copying

Roadmap C02. A reply's existing Copy action should provide both its exact Markdown text and safe rich HTML, so editors can paste headings, emphasis, lists, code, tables and links. Code-block copy remains plain code. No new menu or setting is needed.

Generate the HTML from the reply source, never from the app DOM. Use the existing Markdown libraries with raw HTML disabled, images reduced to their alt text, only fixed document tags, and absolute HTTP(S)/mailto links without credentials. No application controls or attributes enter the clipboard. Limit source to the existing 100,000-character clipboard bound. Plain text remains the original source.

Desktop receives only the Markdown source through a trusted-frame IPC and generates HTML in the host. Browser preview uses the same serializer and ClipboardItem; denied or unavailable rich copying falls back to plain text. Existing older host bridges retain their text-only fallback. Show success only after a completed clipboard write; a failed copy stays visible as an error.

Rendering is loaded on demand to avoid slowing startup or chat switching. No provider requests or network dependencies. Validate safe serialization and real production clipboard behavior plus the preview fallback. Preserve response feedback, speech and branching.
