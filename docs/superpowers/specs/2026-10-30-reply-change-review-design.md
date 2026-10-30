# Per-reply changes and source feedback

OC02 uses a small Changes control beside a Code response to open a bounded, local review of source changes observed between that run's dispatch and confirmed terminal event. A file may also have been edited externally; the product says “Observed during this run” and never asserts exclusive model authorship. Historical replies without a capture show an explicit unavailable state.

## Capture and ownership

Use the existing source snapshot taken before dispatch. Store a bounded baseline in a dedicated SQLite table, keyed by exact chat and prompt/run ID; no new watcher or model request. On a confirmed owned completion/failure/cancellation, schedule the after-snapshot before queued/goal follow-ups on the existing controller queue. Reject or mark unavailable uncertain outcomes, restarted pending captures, root changes, resumed work during capture and missing baselines. Capture failure cannot turn provider success into a model failure.

Retain at most 20 runs per chat and 100 globally. Keep all bounded source hashes from the existing snapshot, at most 1 MiB baseline text, at most 128 KiB per text file, and at most 100 changed-file entries with 1 MiB combined diff text. Binary/large/omitted content is labelled rather than fabricated. Existing secret, ignored-path, symlink and source-size checks apply. Pending captures interrupted by restart become unavailable without later attributing unrelated edits to them. Delete captures with their chat.

## Review and feedback

The shared browser/desktop dialog is lazy: no extra source read per streaming render. It shows compact file rows, bounded diffs, Refresh and a reviewed checkbox. Review markers bind to the captured before/after hashes and current file hash. A changed current file is stale and unreviewed, even when other files remain unchanged. Revalidate on inspection and mutation; a stale dialog or changed chat cannot mark another file/run.

An inline comment uses an exact captured text side (before/after), valid line range and bounded note. “Add to draft” obtains validated source references and appends editable text to the current composer without sending or replacing existing text, files or images. The draft is limited by the existing 16,000-character cap. Historical references include run ID, file path, side and lines; file content is untrusted source material. No file restore, automatic model call or native-history rewind is added.

## Boundaries

Fixed historical captures and mutable working files are distinct. No atomic external filesystem writer guarantee is offered. Noninteractive source review only; native provider acceptance and installed binary acceptance are separate from fixtures. Existing checkpoint restore remains the files-only restore route.
