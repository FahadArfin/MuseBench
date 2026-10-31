# Image annotation implementation plan

**Goal / agreed scope:** Annotate attached images with numbered point comments, freehand strokes, arrows and rectangles. Apply to the draft without sending. Preserve originals for editing; support existing queues and saved drafts. Keep this batch local.

**Architecture:** Shared bounded annotation metadata travels with image references. Applying creates a PNG composite through the existing image import bridge. The original reference remains available. The composer opens an isolated editor; history opens the saved annotations read-only. Native prompt context includes numbered comment text and receives the composite image.

**Tech stack:** Existing React, SVG, Canvas2D, image store, Playwright/Electron; no new packages.

- [x] Validate metadata and prove original/composite storage and comment context with targeted tests.
- [x] Build editor with numbered comments, drawing tools, undo, delete, cancel and apply; bind to the active draft.
- [x] Check comments/drawings, reopening, cancellation, queue metadata, keyboard use and narrow layout with a bounded offline UI fixture.
- [x] Typecheck, frontend build and relevant existing tests. Keep previous local changes intact.

**Review focus:** stale draft ownership during async image import; source retention; bounded coordinates/text; duplicate image hashes; unchanged cancel; no accidental model send.

Validation: 53 targeted unit tests passed; actual isolated Electron editor/queue/failure-retry/narrow checks passed; typecheck and frontend build passed. Read-only review found an editor-unmount failure path and incomplete original-image cleanup; both fixed with regressions. No model calls, publication, installation or installed-app restart.
