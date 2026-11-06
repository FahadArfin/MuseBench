# Work Creative Studio Roadmap and Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this roadmap task by task. Use `superpowers:subagent-driven-development` only when that execution method is authorized. Checkbox steps are tracking instructions, not evidence that a feature exists.

**Goal:** Make Muse's existing **Work** section a practical studio for presentations, video editing, images, posters, motion, and documents, with direct editing, optional AI assistance, and usable exported files.

**Architecture:** Extend the current Work service, local project library, isolated preview, and native Muse integration. Add application-owned document models, reusable visual editing controls, managed assets, and revision-bound background jobs. Keep file access, export processes, and provider credentials in the Electron/controller layer.

**Tech Stack:** Existing Electron, React, TypeScript, JavaScript ESM, Vite, native Muse CLI/SDK, and Node/Playwright verification. Evaluate canvas, Office-writing, and media dependencies in the owning tasks; none is installed or selected by this document.

**Spec:** The [product specification](#product-specification) in this document is the self-contained brief. The user requested creative features inside Muse **Work**, then a detailed roadmap another chat can implement.

**Status:** Implemented locally on `codex/work-creative-studio` by twelve agents. The initial batch passed its build, 2,781 unit tests, 30 integrated native format checks, recovery/conversion/layout gates and independent Office/video output checks. A subsequent UI follow-up exposes all seven deferred image, narration and generated-footage actions as grey, disabled **Coming soon** controls in Inspector → Media; its fresh build, focused test and native interaction checks passed separately. See [the evidence ledger](../../validation/work-creative-studio.md) for exact source identities and limitations. Checked steps do not assert publication, GitHub CI, installed-app validation or live provider output. The disabled controls do not implement the deferred generation capabilities. Live Muse/API and physical assistive-device acceptance remain separately recorded and unverified.

**Baseline:** Source inspected on **2026-11-05**, commit `8b1572db45e81e72f12b35e10138efeb7485bfa2`. Recheck the working tree and relevant code before implementation; later changes may supersede file locations or behavior.

## Global constraints

- Keep this work inside the existing **Work** category. Preserve Code, Chat, Sites, Spaces, and existing project identities.
- Keep all changes local until the user explicitly requests publication of the batch. Follow the current root `AGENTS.md` and `docs/RELEASING.md`; this roadmap grants no release or installation authorization.
- Preserve existing Work item IDs, project IDs, task IDs, sources, saved artifacts, and native Muse ownership. Do not replace Muse with another coding harness.
- Direct editing, opening a template, previewing, undoing, and exporting local content must not silently start model requests.
- Generated content is validated data. Never execute model-generated JavaScript, arbitrary export commands, plugins, or remote HTML inside an editor.
- An edit or export operates on an explicit item and revision. Switching the selected item must not redirect an in-flight result.
- A feature is complete only when a person can use it, reopen the saved project, and verify its advertised output. A mock, fixture, screenshot, or green build alone is insufficient.
- Unsupported import content, missing encoders/fonts, unavailable providers, and failed saves need accurate user-facing states. Never silently flatten an editable deliverable or claim a partial import is lossless.
- Treat proposed new paths and API names below as implementation targets, not files or functions that already exist. Extend existing modules where appropriate; do not duplicate the Work controller.

## Review focus

1. **Old projects and interrupted saves:** a crash or migration failure must leave the last committed project readable. Owned by W01/W02.
2. **Long-running work and changed selection:** a delayed AI/export/import result must stay attached to its original item and revision. Owned by W03/W04/W09.
3. **Hostile or oversized media/Office files:** malformed files, archive expansion, missing assets, and path tricks must fail without exposing local files or wedging the app. Owned by W03/W12/W13/W20.
4. **Real output fidelity:** editable Office objects, fonts, transparency, timing, and audio must survive actual export and independent inspection. Owned by W06/W11/W16/W20.
5. **Non-mouse and constrained use:** keyboard editing, IME text, screen readers, display scaling, and large projects need usable behavior. Owned by W05/W06/W10/W26.

## Product specification

The central flow is: **choose what to make → start blank, from a template, or from files → edit visually and with chat → save versions → export**. The AI assistant shares the workspace with the actual deliverable. Users must be able to keep working without a model request for every adjustment.

The [DeepSeek harness demonstration supplied by the user](https://www.youtube.com/watch?v=VKmUC5ukfqU) is inspiration for a flexible creative workspace. The features below are Muse product proposals, not a claim that every feature or export format was demonstrated in that video.

### Work home and editor layout

The target creation categories are **Presentations · Videos · Images · Posters & Design · Motion · Documents · Dashboards · Websites**. Preserve existing Sites/Spaces navigation; the Websites category routes into the existing Sites implementation. Spaces remains a sharing destination, not another media editor.

- Work home: a clear creation prompt, category cards, recent work with thumbnails, search/filter/sort, and template browsing.
- Start options: **Blank**, **Template**, **Import**, and **Describe with Muse**, where supported. A description is not sent until the user presses the explicit generation action.
- Editor: project title and save state at the top; chat on the left; canvas, page, or playback preview in the center; contextual properties on the right.
- Thumbnails/pages/layers appear beside the canvas; a timeline appears below it only for Video and Motion.
- Chat and the inspector can collapse. On smaller windows, use drawers or tabs instead of squeezing all panes into unusable columns.
- Shared controls: undo/redo, zoom/fit, selection, asset browser, versions, export, and background job progress.
- Selection-aware chat explains its scope: selected object, selected slide/page/scene, or whole project. Users can change scope before sending.
- Normal editing uses visual controls. Keep validated raw data editing as an advanced option for formats that support it.

### Feature inventory

| Area | Features to add | Expected deliverables | Tasks |
| --- | --- | --- | --- |
| Presentations | Prompt/source/outline to deck; slide thumbnails; reorder/duplicate/delete; text, images, shapes, tables and charts; layouts/themes; notes; presenter mode; PPTX import | Editable PPTX; PDF; presentation playback | W09–W12 |
| Video editing | Import clips/stills/audio; multi-track timeline; trim/split/reorder/crop/speed; titles/overlays/transitions; audio mixing; captions; storyboard to sequence | Editable local project; MP4; SRT/VTT | W13–W17 |
| Images | Import, crop, resize, rotate, color adjustments, layers, text, shapes, masks, variations/history; optional generation and targeted AI edits | PNG, JPEG, WebP; transparent PNG | W03, W06–W09, W22–W23 |
| Posters & Design | Posters, flyers, thumbnails, banners, social posts and invitations; alignment/snapping/grouping; typography; multiple artboards; resize variants; print setup | PNG/JPEG/WebP; PDF with explicit dimensions and bleed | W06, W08 |
| Motion | Visual scene timeline; animate text, shapes, images and charts; keyframes/easing; presets; animated posters and explainers | MP4, GIF; editable animation project | W18 |
| Documents | Page editor; headings, paragraphs, lists, tables, images, charts; margins, headers, footers and page numbers; report/proposal templates | Editable DOCX; PDF | W19–W20 |
| Shared studio | Assets; brand kits; templates; selection-scoped chat; direct manipulation; undo/redo; autosave/recovery; versions; export presets; cancellable jobs | Durable, reusable local projects | W01–W09, W26 |
| Reuse across formats | Document to slides; slide to poster; deck to narrated sequence; poster to animation; dashboard chart to slide | New independently editable Work items | W17–W18, W21, W25 |
| Optional media AI | Image generation, background/object removal, background replacement, outpainting; later voice and generated footage | Real imported media with provider provenance | W22–W24 |

### Scope boundaries

The first release-sized milestone should be a complete local poster/image workflow, followed by an editable PowerPoint workflow, then a usable video editor. Do not build every panel before finishing one real output path.

Full Photoshop/Premiere feature parity, arbitrary PowerPoint fidelity, collaborative simultaneous editing, cloud storage, stock-media purchasing, plugin marketplaces, live data connectors, automatic publishing, and new website hosting infrastructure are outside this roadmap. Explicitly deferred advanced features include RAW development, 3D slide objects, tracked Word changes, advanced color grading, multicam editing, and professional prepress color management.

## What exists today

| Current capability | Reuse or limitation |
| --- | --- |
| Work library, templates and independent Muse workspaces | Keep the existing ownership and navigation. Current kinds are `dashboard`, `motion`, `document`, and `slides`. |
| 24 templates across six business teams | Retain these; creative categories complement the existing collection. |
| Validated version-1 artifact data and fixed preview renderer | Keep the legacy reader/exporter. This is not a layered visual document model. |
| Chat refinement and JSON data editor | Reuse chat/activity; add direct visual editing. Existing session draft retention is not the durable history required below. |
| Text/data sources | Currently up to eight UTF-8 CSV/JSON/MD/TXT files, 2 MiB each. Add a separate managed media path rather than widening this source importer indiscriminately. |
| HTML/JSON/Markdown/CSV/PDF exports | Preserve existing behavior and applicable formats. Slides do not currently export editable PPTX. |
| Motion MP4 export | Existing optional FFmpeg path renders 1280×720 H.264 at 12 fps, with bounded duration. This is not a video editing pipeline or footage generator. |
| Generic DOCX/PPTX file previews | Reuse safe parsing knowledge where suitable. A read-only viewer is not Office import, authoring, or round-trip support. |
| Sites and Spaces | Preserve their existing workspaces and explicit sharing behavior. Public Sites hosting is not completed by this roadmap. |

### Current implementation map

Paths below are relative to the repository root.

| Existing path | Responsibility / expected use |
| --- | --- |
| `src/ui/WorkWorkspace.tsx` | Work home, item editor, chat, preview and JSON editor. Extract focused studio components as needed. |
| `src/ui/work-mode.css`, `src/ui/workspace-work.css` | Existing Work styling; preserve the app's visual system. |
| `src/shared/work-types.ts` | Work kinds, state, commands, export formats. Extend compatibly. |
| `src/shared/work-artifacts.mjs`, `.d.mts` | Legacy validation, prompts, samples and trusted rendering. Keep legacy coverage. |
| `src/shared/work-catalog.mjs`, `.d.mts` | Existing template collection. |
| `src/work/index.mjs` | Work service, manifest, source import, atomic saves, run ownership, cancellation and last valid artifact. |
| `electron/work-root.mjs` | Canonical Work workspace paths. |
| `electron/work-protocol.mjs` | Isolated artifact preview protocol. |
| `electron/work-export.mjs` | Existing export process ownership and bounded renderer/FFmpeg execution. |
| `electron/main.mjs`, `electron/preload.cjs`, `src/shared/types.ts` | Main-process handlers and typed renderer bridge. Extend all three together. |
| `src/preview/bridge.ts`, `src/preview/PersonalPreview.tsx` | Simulated preview integration; keep consistent without presenting it as native proof. |
| `src/ui/WorkActivity.tsx`, `src/ui/WorkLog.tsx` | Existing activity and progress presentation. |
| `electron/file-preview.mjs`, `electron/file-preview-ooxml.mjs`, `src/ui/file-preview/renderers.ts` | Safe file preview boundaries; see `docs/FILE-VIEWER.md`. |
| `src/sites/index.mjs`, `src/spaces/client.mjs`, `src/spaces/hub.mjs` | Existing Work-to-Site conversion and explicit Spaces artifact copies/validation. |
| `test/work-*.test.mjs`, `scripts/work-smoke.mjs`, `scripts/work-export-probe.mjs` | Existing Work regression tests and isolated runtime probes. |

## Delivery order and dependencies

The milestones are independently reviewable implementation batches. Expand the chosen milestone into a short execution plan when implementation begins; preserve these task IDs and acceptance gates. Do not infer a deadline from the order.

| Milestone | Tasks | Required result before moving the completion marker |
| --- | --- | --- |
| A — First usable visual studio | W01–W07 | Create a poster and edit an image, save/reopen both, undo changes, export correctly sized files. |
| B — Reusable designs and PowerPoint | W08–W12 | Apply a brand/template, refine a selected object with Muse, create and independently verify an editable PPTX; import the declared PPTX subset. |
| C — Video editing | W13–W17 | Import media, edit a multi-track sequence, adjust audio/captions, reopen it, and verify exported MP4/audio/subtitles. |
| D — Motion | W18 | Edit keyframes visually and export verified animation. Requires W06 and W13–W16 infrastructure. |
| E — Documents and conversion | W19–W21 | Edit a paginated report, verify DOCX/PDF, and convert content into another editable Work item. |
| F — Optional media generation | W22–W24 | Enable only capabilities proven against a configured provider; keep unavailable capabilities honest. Can proceed independently after its listed prerequisites. |
| G — Integrated studio acceptance | W25–W26 | Existing Work flows remain usable; cross-format reuse, accessibility, recovery, performance, and portable project behavior pass. |

Run the relevant W26 acceptance checks during every earlier milestone. W26 is a final consolidated gate, not permission to defer accessibility or recovery until the end.

## Shared architecture decisions

### Document model and compatibility

- Keep `work-artifact.json` and version-1 readers intact. New visual projects use **`work-document.json`**, a version-2 envelope with `version`, `id`, `kind`, `title`, `revision`, `createdAt`, `updatedAt`, `data`, and asset references.
- Preserve the identifiers `slides`, `document`, `motion`, and `dashboard`. Use user-facing **Presentations** for `slides` and **Documents** for `document`; add `image`, `design`, and `video` as validated new kinds. Websites remains a Sites route, not an invented Work artifact kind.
- Define each kind's complete schema in its owning task before enabling it. W01 enables only the initial design/image schemas and the legacy compatibility path; future kinds cannot pass through an unvalidated generic object.
- A visual scene uses logical units, ordered nodes, stable IDs, transforms, styles, and asset IDs. Designs have artboards; slides have slides and notes; videos have tracks/clips; motion has scenes/tracks/keyframes; documents have structured blocks and page settings.
- Use content coordinates independent of device pixels. Store slide/artboard dimensions explicitly; document physical dimensions use points (72 per inch). Video timing uses integer ticks plus an explicit timebase, not accumulated floating-point seconds.
- Do not serialize a canvas library's internal objects as the permanent format. Keep the application model authoritative so canvas/export engines can be replaced.
- Open old projects without rewriting them. First explicit visual conversion creates a validated v2 revision while retaining the original v1 artifact and compatible metadata. Legacy artifacts remain usable when no conversion exists yet.
- Extend manifest records with an optional document format/revision pointer. Read both manifest formats; stage and verify a migrated manifest before atomically replacing it. A future unsupported schema opens with a clear compatibility message and preserved bytes, never an automatic downgrade.

### Proposed service contracts

These are the boundaries to implement, not existing public APIs. Keep renderer requests narrow and serializable; `.mjs` implementations and matching `.d.mts` declarations should follow repository conventions.

| Contract | Inputs and output | Owner |
| --- | --- | --- |
| `validateWorkDocument(value)` | Unknown JSON → validated document, or a bounded field-specific error. | W01; extended by each editor |
| `readWorkDocument(itemId)` | Stable item ID → `{document, revision}` or a typed missing/unsupported error. | W02 |
| `commitWorkEdit({itemId, expectedRevision, operations, origin})` | Allowlisted edits with `origin: 'user' \| 'muse' \| 'import' \| 'restore'` → committed revision or explicit conflict. | W02 |
| `importWorkAssets({itemId, importToken})` | Main-process picker token bound to an item → managed asset records plus per-file errors. Renderer cannot supply arbitrary paths. | W03 |
| `createWorkJob({itemId, revision, kind, settings, destinationToken?})` | Frozen snapshot plus validated settings → job ID. Main owns any destination token. | W04 |
| `cancelWorkJob(jobId)` | Owned job ID → cancellation state; completion/cancellation race has one terminal outcome. | W04 |
| `proposeWorkEdit({itemId, revision, selection, instruction})` | Validated selection and explicit user instruction → proposal with operations, explanation and base revision. | W09 |
| `applyWorkProposal({itemId, proposalId, expectedRevision})` | An unchanged or explicitly reconciled proposal → one undoable committed edit. | W09 |

`selection` contains item ID, revision, surface ID, selected node/block/clip IDs, and an optional time range or image mask reference. It does not contain credentials, arbitrary paths, or unrelated chats. Each editor defines its allowlisted operation set; arbitrary property paths or executable expressions are not operations.

### Persistence, assets, and jobs

- Persist project metadata separately from media bytes. Each managed asset records ID, content hash, display name, media type, byte size, dimensions/duration where relevant, origin, and managed storage reference.
- Import by copying into app-managed storage with bounded decoding and staging. References resolve through an authorized protocol/bridge; raw local paths never become arbitrary renderer URLs.
- Keep original media immutable. Crops, masks, trims, color adjustments, and clip edits are non-destructive project data. Derivatives such as thumbnails/proxies are regenerable caches.
- Coalesce a drag or text-edit transaction into one undo step. Commit autosave after a short idle debounce and at transaction/navigation boundaries; display **Saving**, **Saved**, **Unsaved**, or **Save failed** truthfully.
- Write new revisions and referenced assets before advancing the manifest pointer. Recover orphaned staging data safely; do not replace a newer committed revision with an older asynchronous save.
- Background jobs use `queued`, `running`, `cancelling`, `completed`, `failed`, `cancelled`, and `interrupted`. A provider job with an uncertain remote outcome records that uncertainty and its request ID; it is not automatically resubmitted.
- Export freezes document revision, asset hashes, settings, and fonts. Complete only after the output exists and format checks pass; preserve any previous destination on failure.
- Concurrency starts at one heavy render per app instance. Imports and UI remain responsive; cancel kills owned child processes and releases temporary files. Restart recovery must never silently repeat a billable request.

### Dependency and capability choices

| Area | Initial choice / evaluation | Required evidence |
| --- | --- | --- |
| Canvas | Evaluate a small React adapter over [Konva](https://konvajs.org/docs/) versus existing SVG/DOM rendering in W06. Konva documents layers, transforms and events; it is a candidate, not a committed dependency. | Text/IME, keyboard access, high-DPI preview, export parity, and acceptable bundle/performance measurements. |
| PPTX writing | Evaluate [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) in W11. Its documented purpose includes native PowerPoint text, shapes, charts and images. | Editable exported fixture opens independently; no assumption that the writer imports PPTX. |
| DOCX writing | Evaluate the [docx project](https://docx.js.org/) in W20 against the supported document subset. | Editable paragraphs/tables/images survive independent reopen; pagination limitations documented. |
| Media | Extend the existing optional FFmpeg discovery/export boundary with a separate media worker. | Verify required decoder/encoder capabilities and exact arguments. Decide packaging, notices and distribution requirements before bundling any binary. |
| Office import | Reuse bounded ZIP/XML parsing practices; build a supported-subset mapper. | No external relationship fetching, archive bombs, macros, or silent success on unsupported objects. |
| AI media | Adapter only for a real configured provider with the required capability. | Documented API/auth, current limits, actual output proof, cancellation/billing behavior, provenance. Muse text generation alone proves none of these. |

Pin accepted dependencies and lockfile updates in their implementation task. Avoid adding every candidate library during foundation work.

## Implementation checklist

### W01 — Versioned creative documents and legacy compatibility

**Depends on:** none. **Produces:** validated v2 envelope, initial image/design schemas, explicit legacy adapters.

**Files:** Create `src/shared/work-document-types.ts`, `src/shared/work-documents.mjs`, `src/shared/work-documents.d.mts`, and `test/work-documents.test.mjs`. Modify `src/shared/work-types.ts`, `src/work/index.mjs`, and `test/work-service.test.mjs` only where compatibility requires it.

- [x] Add fixtures proving v1 dashboard/motion/document/slides still read unchanged; malformed v2, duplicate IDs, dangling asset references, non-finite geometry, unknown kinds, and future versions fail predictably.
- [x] Define the v2 envelope and typed design/image data; include object bounds, transforms, z-order, text styles and image references. Set explicit count/byte/dimension limits in one shared limits module as schemas are enabled.
- [x] Implement `validateWorkDocument(value)` and a legacy reader that does not rewrite projects on open. Retain legacy artifact generation/export while visual conversions are introduced incrementally.
- [x] Verify source/project/task identity survives migration and simulated staging failure; run `node --test test/work-documents.test.mjs test/work-artifacts.test.mjs test/work-service.test.mjs`.

**Done when:** a mixed library of old and new projects opens without data loss, and unsupported data cannot enter a visual renderer.

### W02 — Durable edits, undo/redo, autosave, and versions

**Depends on:** W01. **Produces:** revision store and `readWorkDocument` / `commitWorkEdit` contracts.

**Files:** Create `src/work/document-store.mjs`, `src/shared/work-operations.mjs`, matching `.d.mts` declarations, and `test/work-document-store.test.mjs`. Modify `src/work/index.mjs`, the Work bridge files, and `test/work-service.test.mjs`.

- [x] Write tests for stale revisions, item switching, two rapid edits, crash between snapshot and manifest writes, disk-full errors, corrupted latest snapshot, and restoring an older version as a new revision.
- [x] Implement serialized per-item commits with expected-revision checks, atomic snapshot/pointer writes, and recovery of the last complete revision. Do not weaken existing workspace path checks.
- [x] Add undo/redo transactions, save-state events, and durable autosave. Start with a 500 ms idle debounce; flush complete edits on navigation. Pending input must be recoverable or visibly unsaved if persistence fails.
- [x] Add named checkpoints and version previews. Undo/redo is session history; named/saved revisions support restart recovery. Bound ordinary history by both count and bytes, preserve named/current revisions, and explain storage pressure before removal.
- [x] Run `node --test test/work-document-store.test.mjs test/work-service.test.mjs`; prove reopen and recovery using an isolated test profile.

**Done when:** editing, undoing, switching items, and restarting cannot silently lose the last committed work; conflicts never overwrite newer data.

### W03 — Managed media imports and asset browser

**Depends on:** W01–W02. **Produces:** asset records, safe asset resolution, image thumbnails, library controls.

**Files:** Create `src/work/assets.mjs`, `electron/work-assets-protocol.mjs`, `src/ui/work/WorkAssetBrowser.tsx`, and `test/work-assets.test.mjs`. Modify the main/preload/typed bridge, `src/work/index.mjs`, and preview fixtures.

- [x] Test picker cancellation, item changes during import, duplicate content, unsupported files, bad MIME/extension pairs, path traversal, Windows junction/symlink escapes, oversized images, and decoder failure.
- [x] Implement `importWorkAssets({itemId, importToken})`; copy originals atomically and hash them. Start with PNG/JPEG/WebP raster import; SVG requires a separately bounded sanitizer before it can be enabled.
- [x] Add thumbnail/grid/list views, drag/drop through the native import boundary, rename, usage count, and replace/relink. Asset deletion must explain affected objects and preserve bytes still referenced by retained versions.
- [x] Put concrete import/decode limits and user-facing errors in `src/shared/work-limits.mjs` with declarations. Measure peak memory before raising limits; keep existing text-source limits unchanged.
- [x] Run `node --test test/work-assets.test.mjs test/work-protocol.test.mjs`; verify missing/relinked assets and cross-project access rejection in an isolated Electron fixture.

**Done when:** a user can import and reuse real images across layers, reopen offline, and identify missing files without exposing arbitrary local paths.

### W04 — Background jobs and reliable export framework

**Depends on:** W02–W03. **Produces:** revision-bound job queue, export settings, cancellation and receipts.

**Files:** Create `src/work/jobs.mjs`, `src/shared/work-job-types.ts`, `src/ui/work/WorkExportDialog.tsx`, `src/ui/work/WorkJobs.tsx`, and `test/work-jobs.test.mjs`. Modify `electron/work-export.mjs`, the bridge, `src/ui/WorkActivity.tsx`, and `src/ui/WorkLog.tsx`.

- [x] Test selection/revision changes during a job, double cancellation, app shutdown, missing capability, renderer/encoder failure, partial files, existing destination preservation, and recovery of interrupted jobs.
- [x] Implement `createWorkJob` and `cancelWorkJob`; use fixed command arguments and owned processes. Capture a revision snapshot rather than querying the active item later.
- [x] Add format, dimensions, quality, transparency, page/slide/range and destination controls as applicable. Disable unsupported combinations with a specific reason; changing settings must not spend provider credits.
- [x] Record job receipt fields: item/revision, format, settings, source asset hashes, output bytes/hash, tool version, completion time, and errors. Expose progress, Cancel, Retry where safe, and Open output after verified success.
- [x] Preserve current exporters; run `node --test test/work-jobs.test.mjs test/work-export.test.mjs` and the relevant isolated export probe after changing renderer/process behavior.

**Done when:** a real export can be cancelled, retried, and inspected without corrupting a project or an existing output file.

### W05 — Creative Work home and shared editor shell

**Depends on:** W01–W04. **Produces:** category navigation and reusable editor chrome.

**Files:** Create `src/ui/work/WorkHome.tsx`, `WorkStudio.tsx`, `WorkToolbar.tsx`, `WorkInspector.tsx`, and `work-studio.css` in that directory. Modify `src/ui/WorkWorkspace.tsx`, existing Work CSS, `src/preview/bridge.ts`, and `scripts/work-smoke.mjs`.

- [x] Add the target category layout, recent thumbnails, search/filter/sort, and Blank/Template/Import/Describe entry points. Preserve original templates and current Code/Chat selections.
- [x] Route enabled categories to actual editors. During incremental development, clearly label future categories unavailable or omit their creation action; do not connect them to fake success screens.
- [x] Add collapsible chat/inspector, contextual canvas controls, save state, versions, asset picker, export and jobs. Loading, empty, failed, missing-asset, and unsupported-project states need visible recovery actions.
- [x] Extend isolated Work smoke coverage for navigation without model requests, keyboard focus restoration, item switching, old-project access, and narrow-window panes. Verify 100%, 150%, and 200% display scaling during the visual pass.

**Done when:** users can reach a working creative editor and get back to their existing Work items without losing selection, drafts, or context.

### W06 — Poster/design canvas and first complete output

**Depends on:** W05. **Produces:** direct scene editing, poster artboards, PNG/JPEG/WebP/PDF outputs.

**Files:** Create `src/ui/work/canvas/WorkCanvas.tsx`, `CanvasTextEditor.tsx`, `LayerList.tsx`, `src/shared/work-scene-operations.mjs`, `electron/work-design-export.mjs`, `test/work-scene-operations.test.mjs`, and `scripts/work-design-smoke.mjs`. Extend W01 schemas, W02 operations, W04 exports and their tests.

- [x] Evaluate the canvas candidate using one image/text/shape fixture with Unicode, multiline text, transparent pixels, rotation and clipping. Record the choice and dependency version before building on it.
- [x] Implement selection, move/resize/rotate, numeric properties, keyboard nudging, text editing, text/image/shape layers, z-order, lock/hide, grouping, duplicate/delete, alignment/distribution and snapping. Coalesce gestures into undoable transactions.
- [x] Add multiple artboards with named sizes and custom dimensions; portrait/square/landscape presets; crop/fit/fill, margins, guides and safe areas. Preserve content while resizing and allow users to adjust the result.
- [x] Export exact requested raster dimensions and explicit PDF physical dimensions. PNG preserves alpha; JPEG requests a background color. Add margin/bleed settings and optional crop marks; label output RGB and do not claim PDF/X or CMYK support.
- [x] Run operation/export tests and `node scripts/work-design-smoke.mjs` after building. Verify the end-to-end fixture: create a flyer, import a logo, style text, align/group, undo, save/reopen, export and inspect dimensions, clipping, fonts and transparency.

**Done when:** a real poster can be created entirely through visual controls and exported correctly. This is milestone A's first mandatory vertical slice.

### W07 — Local image editing

**Depends on:** W06. **Produces:** an image-focused editor that works without a provider.

**Files:** Create `src/ui/work/image/WorkImageEditor.tsx`, `ImageAdjustments.tsx`, `src/shared/work-image-operations.mjs`, and `test/work-image-operations.test.mjs`. Extend the canvas, document schema, asset model and raster exporter.

- [x] Add crop, resize, rotate/flip, aspect lock, brightness, contrast, saturation, opacity and non-destructive masks. Define transform/filter order so preview and export agree.
- [x] Reuse text/image/shape layers; add before/after comparison, reset adjustment, duplicate variation, transparency checkerboard and explicit flatten-on-export behavior.
- [x] Preserve imported original bytes and orientation/color metadata handling. Explain any conversion or unsupported color profile; ensure edits do not accidentally bake the editor's checkerboard into output.
- [x] Run `node --test test/work-image-operations.test.mjs`; extend the design smoke with rotated EXIF JPEG, transparent PNG, resized WebP, undo, reopen and export-pixel checks.

**Done when:** crop/adjust/layer/export works offline, original assets remain recoverable, and users can distinguish editable project data from flattened image output.

### W08 — Templates, brand kits, and reusable assets

**Depends on:** W06–W07; each later editor adds its own template type. **Produces:** reusable design resources and a better Work library.

**Files:** Create `src/work/templates.mjs`, `src/work/brand-kits.mjs`, `src/ui/work/WorkTemplateBrowser.tsx`, `WorkBrandKitEditor.tsx`, and `test/work-templates.test.mjs`. Extend `src/shared/work-catalog.mjs`, the asset browser, and Work home.

- [x] Add searchable templates with previews, category, dimensions and supported editor. Include at least one poster, flyer, thumbnail, banner, social post and invitation; add deck/report/motion templates when those editors exist.
- [x] Make templates copies with new document/node IDs and explicitly copied asset dependencies. Editing the copy must never mutate the template or another user's project.
- [x] Add brand kits containing colors, font references, logos and text styles. Preview application to a selection or whole project as one undoable transaction; flag unavailable fonts instead of silently changing typography.
- [x] Add reusable user templates, favorite templates/assets, recent assets, project duplication and library rename/filter/sort. Keep existing team filters available alongside creative type filters.
- [x] Run `node --test test/work-templates.test.mjs`; verify duplicated IDs/assets, missing fonts, brand undo, and preservation of all existing sample templates. Template creation/opening must produce zero model requests.

**Done when:** a user can create a branded design, save it as a template, and create independent new work from it.

### W09 — Selection-aware Muse edits and structured generation

**Depends on:** W02, W05–W08. **Produces:** validated, revision-bound proposals through the existing Muse runtime.

**Files:** Create `src/work/proposals.mjs`, `src/shared/work-prompts.mjs`, `src/ui/work/WorkProposalReview.tsx`, and `test/work-proposals.test.mjs`. Modify `src/work/index.mjs`, editor selection adapters, chat UI and bridge contracts.

- [x] Define prompt/output contracts for whole-project creation and selection edits. Supply selected object IDs, relevant source excerpts, document schema and requested scope; exclude unrelated private items and assets.
- [x] Implement `proposeWorkEdit` and `applyWorkProposal`. Ask Muse for an allowlisted structured proposal file; validate identity, bounds, assets and operations before showing a preview of the change.
- [x] Add a concise change summary with Apply/Discard and scoped preview. Apply is one undoable transaction. If the user edits the same revision while generation runs, show a conflict and let them regenerate or deliberately reconcile it; never silently overwrite.
- [x] Support source/outline-to-layout generation and follow-ups such as “make this heading smaller,” “replace this chart with the attached numbers,” and “use the brand colors on this slide.” A model reply without a valid proposal is a reply, not a completed edit.
- [x] Test malformed output, unauthorized node IDs, stale revisions, item switching, Stop during connection/generation, late completion, missing Muse and runtime failure. Run `node --test test/work-proposals.test.mjs test/work-service.test.mjs`.

**Done when:** a real authorized Muse request changes only its declared scope, can be reviewed/applied/undone, and failed output leaves the last good document intact. Fixture verification and live Muse verification must be reported separately.

### W10 — Presentation editor, notes, and presenter mode

**Depends on:** W06, W08; W09 for AI generation. **Produces:** a native slide document and editable deck UI.

**Files:** Create `src/shared/work-slide-operations.mjs`, `src/ui/work/slides/WorkSlideEditor.tsx`, `SlideStrip.tsx`, `SlideNotes.tsx`, `PresenterView.tsx`, and `test/work-slides.test.mjs`. Extend schemas, scene canvas, Work routing and proposal operations.

- [x] Define `slides` v2 data with deck dimensions, theme/layout references, ordered slide IDs, editable nodes, chart/table data and speaker notes. Explicitly convert old slide artifacts while retaining the original.
- [x] Add slide thumbnails, select/reorder/duplicate/delete, title/content/section/blank layouts, background and theme controls, and editable text/images/shapes/tables/charts. Duplicates get fresh nested IDs; deleting a slide never deletes shared assets still in use.
- [x] Add outline-to-deck and source-to-deck generation through W09. Keep source attribution attached to relevant content; edits to chart data must update the chart without image regeneration.
- [x] Add notes editing, full-screen playback, keyboard navigation and presenter mode with current/next slide, notes and elapsed time. Projector output must omit private notes; a second-display window must be separately owned and cleanly closed.
- [x] Run `node --test test/work-slides.test.mjs`; add `scripts/work-slides-smoke.mjs` covering reorder/undo, notes, theme changes, legacy conversion, reopen, playback and keyboard focus.

**Done when:** users can create and present a visually edited deck without editing JSON. PPTX completion remains gated on W11.

### W11 — Editable PPTX and presentation PDF export

**Depends on:** W04, W10. **Produces:** independently verified editable PowerPoint output.

**Files:** Create `electron/work-pptx-export.mjs`, `test/work-pptx-export.test.mjs`, and `scripts/work-office-probe.mjs`. Extend export formats/settings and add purpose-built fixtures under `test/fixtures/work-office/`.

- [x] Evaluate and pin the PPTX writer using a small deck containing text, shapes, a photo, a data chart, a table, notes, custom size and transparency. Record support gaps before exposing format choices.
- [x] Map supported text, shapes, images, tables and charts to native PowerPoint objects. Include notes and explicit slide dimensions. Whole-slide screenshots do not satisfy editable PPTX acceptance.
- [x] Surface export limitations before writing. Unsupported effects may use a disclosed object-level fallback only when the remaining supported content stays editable; never label an entirely flattened deck editable.
- [x] Verify OOXML relationships, object types, slide count, embedded media, notes and chart data in tests. Open an exported fixture in PowerPoint or another independent compatible Office application and edit/save text, a shape and chart data. Record which application/version was used.
- [x] Export matching presentation PDFs; visually inspect clipping, line wrapping, fonts and slide order. Run `node --test test/work-pptx-export.test.mjs` and the isolated Office probe; if no independent Office application is available, report fidelity verification pending rather than complete.

**Done when:** a user can open the generated PPTX outside Muse, change native slide elements, save it, and retain those edits.

### W12 — Bounded PPTX import and reference-deck support

**Depends on:** W03, W10–W11. **Produces:** editable import for a declared subset plus honest partial-import reports.

**Files:** Create `src/work/import-pptx.mjs`, `src/shared/work-import-report.mjs`, `src/ui/work/WorkImportReview.tsx`, and `test/work-pptx-import.test.mjs`. Reuse reviewed parsing helpers from `electron/file-preview-ooxml.mjs` where suitable without turning the viewer into the editor model.

- [x] Define the first supported subset: slide order/size, text paragraphs/basic runs, pictures, simple shapes, fills, basic tables and notes. Add charts only when their mapping and data round trip have fixtures.
- [x] Preserve the original PPTX as an immutable asset. Import supported content to new Work IDs and report unsupported objects/effects, theme/font substitutions, hidden slides and conversion warnings by slide.
- [x] Offer **Import editable content** and **Use as visual reference** as distinct actions. A reference image or partial conversion must never masquerade as editable original content.
- [x] Bound compressed/uncompressed bytes, relationship count, XML depth and slide/object counts; reject encrypted/macro-enabled inputs in this first scope. Never fetch external relationships or execute embedded content.
- [x] Run `node --test test/work-pptx-import.test.mjs`; cover valid and malformed ZIPs, external links, missing media, unsupported effects, mixed fonts and import → edit → export → independent reopen.

**Done when:** a supported reference deck can be imported and edited, while unsupported content is clearly identified and the original file remains available.

### W13 — Video/audio ingest, metadata, thumbnails, and proxies

**Depends on:** W03–W04. **Produces:** managed time-based assets and a responsive playback source.

**Files:** Create `electron/work-media-worker.mjs`, `src/work/media.mjs`, `src/shared/work-media-types.ts`, `test/work-media.test.mjs`, and `scripts/work-media-probe.mjs`. Extend asset records, capability discovery and job handling.

- [x] Discover FFmpeg/FFprobe or the selected equivalent through a verified native path. Report decoder/encoder support separately; file extension alone does not prove playability or export capability.
- [x] Probe duration, dimensions, frame rate/timebase, rotation, audio streams and codec. Add bounded thumbnails, waveforms and preview proxies as cancellable jobs with cache limits.
- [x] Support common MP4/MOV/WebM and WAV/MP3/M4A inputs only when the active toolchain can decode them. Handle silent clips, variable frame rate, rotated phone video, unsupported codecs and damaged files explicitly.
- [x] Preserve original media, distinguish proxy from final render sources, and allow offline relink by content identity. Set measured clip duration/size and project storage limits before enabling imports.
- [x] Run `node --test test/work-media.test.mjs` and `node scripts/work-media-probe.mjs`; use short generated/licensed fixtures for variable frame rate, rotation, audio offsets and corrupted input. Probe failure must not hang the renderer.

**Done when:** users can import real media, browse thumbnails/waveforms, and preview it without waiting for a full final render.

### W14 — Multi-track video timeline and direct editing

**Depends on:** W05, W13. **Produces:** editable `video` projects with deterministic playback.

**Files:** Create `src/shared/work-video-operations.mjs`, `src/ui/work/video/WorkVideoEditor.tsx`, `VideoTimeline.tsx`, `VideoPreview.tsx`, `ClipInspector.tsx`, and `test/work-video-operations.test.mjs`. Extend document validation, history and selection adapters.

- [x] Define project dimensions/frame rate/timebase, ordered tracks, clips, source in/out, timeline start, transforms, speed and asset references. Keep video/audio/text/overlay tracks distinguishable in the model.
- [x] Implement play/pause/scrub, zoom/fit timeline, clip selection, trim handles, split, reorder/move, snapping, explicit ripple toggle, duplicate/delete, and track mute/lock. Preserve linked audio behavior through trim/split operations.
- [x] Add crop/fit/fill, position/scale, 0.25×–4× positive speed, still-image duration, text titles and image overlays. Start with cuts and crossfades; unavailable transitions are not selectable.
- [x] Persist timeline edits through W02; make keyboard shortcuts respect text-field focus. Keep proxy playback and render timing derived from the same model, including rounding at frame boundaries.
- [x] Run `node --test test/work-video-operations.test.mjs`; add `scripts/work-video-smoke.mjs` for import → edit two video tracks plus audio → undo → save/reopen → seek to known frames.

**Done when:** a user can assemble a coherent multi-track sequence visually and recover it after restart. Output verification is W16.

### W15 — Audio mixing and editable captions

**Depends on:** W14. **Produces:** controlled audio levels/fades and timed caption tracks.

**Files:** Create `src/ui/work/video/AudioInspector.tsx`, `CaptionEditor.tsx`, `src/shared/work-caption-operations.mjs`, and `test/work-captions.test.mjs`. Extend timeline schema/operations and the media worker.

- [x] Add per-clip/track gain, mute, fade-in/out and waveform display. Provide clipping indicators and basic voice/music ducking with editable parameters; do not normalize or duck audio silently.
- [x] Add manual captions, text/time editing, split/merge, style/position/safe areas, and SRT/VTT import/export. Preserve Unicode and distinguish captions from ordinary title overlays.
- [x] Keep automatic transcription capability-gated: a configured local or remote engine produces editable timed text through W04. Manual captions and subtitle import must work without a transcription service.
- [x] Test overlapping captions, invalid intervals, long lines, RTL/CJK text, offsets, leading/trailing silence, mute and fade boundaries. Run `node --test test/work-captions.test.mjs` plus the audio cases in the media probe.

**Done when:** the edited audio and captions play in sync, subtitle files round trip for the supported subset, and no transcription request starts without an explicit action.

### W16 — Final video render and MP4 export

**Depends on:** W04, W14–W15. **Produces:** verified render pipeline and practical export presets.

**Files:** Create `electron/work-video-export.mjs`, `src/shared/work-render-plan.mjs`, and `test/work-video-export.test.mjs`. Extend `scripts/work-media-probe.mjs`, W04 export UI and job receipts.

- [x] Compile a validated timeline into a deterministic render plan with explicit input assets, frame rate, transforms, compositing, transitions, audio mixing and subtitle handling. Never accept shell fragments from a document or model.
- [x] Add 16:9, 9:16 and 1:1 project/export presets, 720p/1080p, 24/30 fps, range export and quality controls. Require H.264/AAC capabilities for the initial MP4 path; defer 4K/60 fps until measured and verified.
- [x] Render from original assets where available; preview proxies must not silently lower export quality. Show an actionable missing-original error or an explicitly chosen lower-quality fallback.
- [x] Validate output duration, dimensions, codec, frame rate and audio stream; independently decode selected boundary frames and listen to a fixture with known sync marks. Preview, captions, fades, crossfades and speed changes must match the final output.
- [x] Run `node --test test/work-video-export.test.mjs` and the media probe. Exercise cancellation mid-render, disk-full, spaces/Unicode in filenames, failed encoders, duplicate clicks and existing output preservation.

**Done when:** the edited project exports a playable MP4 with correct pictures, timing, audio and captions. Successful process exit alone is not sufficient.

### W17 — Script/storyboard to editable video

**Depends on:** W09, W14–W16. **Produces:** structured planning and generated edits using available assets.

**Files:** Create `src/shared/work-storyboards.mjs`, `src/ui/work/video/StoryboardPanel.tsx`, and `test/work-storyboards.test.mjs`. Extend proposal schemas and video operations.

- [x] Add an editable script/storyboard containing scene order, duration, narration text, selected media, title/caption text and transitions. Show total planned duration and missing media.
- [x] Generate a storyboard from a user brief, document outline or deck using Muse; map accepted scenes into real editable clips. Respect available assets and never invent successful media downloads or footage generation.
- [x] Show intentional placeholders for missing media, with Replace/Import actions. Block final export or require an explicit choice to include visible placeholders; hidden missing content is unacceptable.
- [x] Allow scene reorder/timing changes and regeneration of one selected scene without replacing unrelated edits. Keep storyboard-to-timeline conversion undoable and revision-bound.
- [x] Run `node --test test/work-storyboards.test.mjs`; verify a three-scene sequence with one missing asset, one manually edited title, cancellation and a stale proposal.

**Done when:** a short script can become a usable timeline with explicit media gaps and continued direct editing.

### W18 — Motion editor and animated designs

**Depends on:** W06, W13–W16; W09 for AI animation assistance. **Produces:** visual animation editing and MP4/GIF export.

**Files:** Create `src/shared/work-motion-operations.mjs`, `src/ui/work/motion/WorkMotionEditor.tsx`, `KeyframeTimeline.tsx`, and `test/work-motion-operations.test.mjs`. Extend render plans, job formats and legacy conversion.

- [x] Define scene duration, layers and keyframes for position, scale, rotation and opacity; add explicit interpolation/easing. Keep chart data editable while animating its presentation.
- [x] Add playhead, keyframe add/move/delete, numeric timing, easing controls and simple fade/slide/scale presets. Support text, shapes, imported images and charts.
- [x] Convert a poster/artboard or supported slide into a new motion project; retain editable original elements. Convert existing v1 motion scenes without deleting their source artifact.
- [x] Export MP4 through the common renderer and bounded GIF with explicit frame rate, dimensions and palette limitations. Explain that GIF has no audio and limited transparency/colors.
- [x] Run `node --test test/work-motion-operations.test.mjs`; verify sampled frames at keyframe boundaries, loop endpoint, undo, reopen, MP4 duration and GIF frame timing. Use Work-specific probes rather than assuming the app's general `test:motion` covers this editor.

**Done when:** a user can animate an existing design through a visual timeline and verify the exported motion without writing code.

### W19 — Structured document editor and page layout

**Depends on:** W02–W08; W09 for AI writing. **Produces:** an editable paginated document model and PDF output.

**Files:** Create `src/shared/work-document-blocks.mjs`, `src/ui/work/document/WorkDocumentEditor.tsx`, `DocumentOutline.tsx`, `PageSettings.tsx`, and `test/work-document-blocks.test.mjs`. Extend v2 validation, render/export adapters, templates and proposal operations.

- [x] Define paragraphs with inline marks, headings, lists, tables, images, chart blocks, page breaks and source references. Keep text structure separate from computed pagination.
- [x] Implement editing, selection, copy/paste, keyboard formatting, tables, image sizing and heading outline. Evaluate rich-text engine integration against the existing model/undo boundary before adopting it; do not persist third-party executable markup.
- [x] Add A4/Letter/custom page size, margins, header/footer content, page numbers and explicit page breaks. Provide report/proposal templates and visual page previews.
- [x] Support selection-scoped rewrite, expansion and summarization through W09. Preserve source links and manually edited blocks outside the request scope.
- [x] Run `node --test test/work-document-blocks.test.mjs`; add `scripts/work-document-smoke.mjs` covering IME, long tables, page breaks, headers/footers, undo, reopen and PDF pagination.

**Done when:** a report with text, a table, an image and a chart can be edited visually, reopened, and exported as a readable PDF.

### W20 — Editable DOCX export and bounded DOCX import

**Depends on:** W19; reuse W12 archive protections. **Produces:** Office document interchange for a declared subset.

**Files:** Create `electron/work-docx-export.mjs`, `src/work/import-docx.mjs`, `test/work-docx-export.test.mjs`, and `test/work-docx-import.test.mjs`. Extract shared bounded ZIP/XML helpers into `src/work/ooxml-import.mjs` if W12 has not already done so; extend the Office probe and import review.

- [x] Evaluate/pin the writer and map paragraphs, heading styles, inline formatting, lists, tables, images, page size/margins, page breaks, headers/footers and page numbers. Declare chart handling; an image chart is not an editable Office chart.
- [x] Generate native editable paragraphs/tables/images; preserve document structure instead of exporting each page as a picture. Record font and pagination differences before export.
- [x] Import the supported subset into a new Work document, preserve the original DOCX, and report unsupported fields, tracked changes, comments, floating objects, equations and embedded content. Do not imply full Word fidelity.
- [x] Apply bounded archive/XML rules and no external relationship fetching. Test corrupted/encrypted inputs, missing media, nested tables, Unicode, long paragraphs, headers/footers and partial conversion.
- [x] Run `node --test test/work-docx-export.test.mjs test/work-docx-import.test.mjs`; extend the Office probe and independently open/edit/save an exported DOCX. Inspect PDF page count, clipping and table continuation separately.

**Done when:** the declared document subset remains editable outside Muse, and imports disclose omissions while retaining the original.

### W21 — Convert and reuse content across Work formats

**Depends on:** W10, W17–W20; W09 for transformations requiring interpretation. **Produces:** explicit, non-destructive conversions.

**Files:** Create `src/work/conversions.mjs`, `src/ui/work/WorkConvertDialog.tsx`, and `test/work-conversions.test.mjs`. Reuse existing editor models, templates and proposal boundaries.

- [x] Add document/outline → presentation, slide → poster, poster/slide → motion, and deck → video storyboard actions. Reuse W17/W18 adapters instead of creating alternative timeline models.
- [x] Let users choose destination format/template, source pages/slides and whether to copy eligible media. Preserve source attribution and identify content that cannot map directly.
- [x] Create a new independent Work item by default with new IDs, asset dependencies and conversion provenance. No live linked editing or source replacement in this first scope.
- [x] Show a preview and conversion report. A deterministic copy does not need a model; a summarization/layout request must use the explicit Muse action and remain reviewable.
- [x] Run `node --test test/work-conversions.test.mjs`; verify the source is unchanged, IDs are unique, assets reopen offline, omissions are disclosed, and failure leaves no half-created library item.

**Done when:** one source can produce another editable deliverable without damaging the original or hiding conversion losses.

### W22 — Optional image generation and provider adapter

**Local status:** Muse Image adapter and complete managed-output workflow implemented. Contract tests passed; paid/live output verification was not performed. An explicit configured API connection is required.

**Depends on:** W03–W04, W07; available provider/auth required for live acceptance. **Produces:** capability-based media generation, with local editing still fully usable without it.

**Files:** Create `src/work/providers/index.mjs`, `src/shared/work-provider-types.ts`, `src/ui/work/image/ImageGenerationPanel.tsx`, and `test/work-providers.test.mjs`. Add a provider-specific adapter only after verifying its official API and existing authentication route.

- [x] Define `getCapabilities()`, `start(request)`, `poll(jobId)` and `cancel(jobId)` contracts. Capabilities identify supported image generation/editing/transcription/voice/video actions, sizes, limits and cancellation semantics; unsupported actions stay unavailable.
- [x] Add prompt, reference image, aspect ratio, supported resolution and variation count. Show which provider will receive which inputs and any known cost estimate or unavailable estimate before the explicit generation action.
- [x] Keep credentials in the existing approved native credential path. Renderer state contains a provider/connection ID, not secrets. Do not infer media generation from a Muse CLI login or automatically create a paid account.
- [x] Import successful outputs through the same managed asset validation as local imports. Record provider/model/request ID, prompt/reference relationships, generation settings and output provenance; allow users to insert a chosen variation as a layer.
- [ ] Test rate limits, rejected prompts, unavailable auth, timeout, failed/corrupt downloads, cancellation and uncertain remote completion. Run `node --test test/work-providers.test.mjs`; live generation requires the user's existing authorization and a real configured provider, and must be separately evidenced.

**Done when:** at least one advertised provider action returns a genuine usable image through the complete job/import/edit flow. Otherwise this task remains partially complete with the unavailable capability stated honestly.

### W23 — Targeted image edits, removal, and outpainting

**User-approved provider status:** **Coming soon** for region-targeted generation/removal/outpainting. Current Muse Image does not expose masks. Local non-destructive masks and tested coordinate/review contracts remain available; no unsupported targeted action is advertised as working.

**Depends on:** W07, W22 and the relevant provider/local model capability. **Produces:** non-destructive image-edit proposals.

**Files:** Create `src/ui/work/image/ImageMaskEditor.tsx`, `ImageEditReview.tsx`, `src/work/image-edits.mjs`, and `test/work-image-edits.test.mjs`. Extend provider capabilities, selection references and asset provenance.

- [ ] Add brush/erase/feather mask controls and selected-region prompts; offer background removal, object removal, background replacement and canvas expansion only for verified supported implementations.
- [ ] Send the correct source revision, image/mask coordinates, prompt and output size. Respect crop/rotation transforms when mapping a canvas selection back to source pixels.
- [ ] Present before/after and Accept/Discard; accepted output becomes a new managed asset or layer, never an overwrite of original bytes. Preserve generation lineage and allow a single undo.
- [ ] Test empty/inverted masks, transparency, edge selections, rotated/cropped sources, provider size changes and document edits during generation. Run `node --test test/work-image-edits.test.mjs` plus the provider tests.

**Done when:** a supported targeted edit applies to the intended pixels and revision, while rejected or stale output cannot overwrite the working image.

### W24 — Optional narration, transcription, and generated footage

**User-approved provider status:** Muse Voice speech transcription adapter implemented; live acceptance remains unverified. Voice synthesis and generated footage are **Coming soon**. Muse Voice transcription is not a text-to-speech service.

**Depends on:** W13–W17, W22; each action requires a proven local/remote capability. **Produces:** generated media inserted into editable timelines.

**Files:** Create `src/ui/work/video/VoiceoverPanel.tsx`, `GeneratedClipPanel.tsx`, `src/work/generated-media.mjs`, and `test/work-generated-media.test.mjs`. Extend provider adapters and W15 caption integration.

- [ ] Add script-to-voice with supported voices, language and speed; add transcription to editable W15 captions. Preview returned audio before inserting it and show duration mismatches with the target scene.
- [ ] Add prompt/reference-to-short-clip generation where supported. Display provider constraints, duration/aspect choices, progress and cancellation limits; import the returned clip through W13 validation.
- [x] Insert media as ordinary editable assets/clips with provenance. Keep generation separate from timeline editing, render jobs and existing local MP4 export.
- [x] Retain remote job IDs across restart, reconcile uncertain outcomes before retry, and avoid duplicate paid requests. A local fake response or animated placeholder is not live generation evidence.
- [x] Run `node --test test/work-generated-media.test.mjs`; verify wrong duration/format, missing audio, failed downloads, cancellation, stale project revisions and explicit acceptance into the timeline.

**Done when:** each enabled action has real provider/local-engine proof and yields editable media. Unavailable video or voice providers must not hold up completed local editing milestones.

### W25 — Dashboards, Websites, and explicit sharing integration

**Depends on:** W08, W10, W19, W21. **Produces:** coherent reuse without rebuilding existing product areas.

**Files:** Modify `src/ui/WorkWorkspace.tsx`, `src/shared/work-artifacts.mjs`, `src/work/index.mjs`, `src/sites/index.mjs`, `src/spaces/client.mjs`, `src/spaces/hub.mjs`, their shared types and the main-process integration as needed. Create `src/work/artifact-conversions.mjs` and `test/work-artifact-conversions.test.mjs`. Extend `test/sites-service.test.mjs`, `test/spaces-client.test.mjs`, and `test/spaces-hub.test.mjs` for changed boundaries.

- [x] Keep all legacy dashboard templates, data/source notes, table search and current exports. Add selected chart/table → slide/document/design conversion while preserving values and provenance.
- [x] Route Websites to the existing Sites workspace and its own chat, source, preview and versions. Use an explicit copy action to pass selected Work content into a site; do not silently connect public hosting or publish.
- [x] Extend Spaces copies only for supported new document types. Review which visible media bytes are included; exclude private chat, unrelated inputs, local filesystem paths, credentials and version history unless intentionally part of a supported share format.
- [x] Ensure shared copies are snapshots and source updates are explicit. Unsupported studio formats should remain private/exportable until a safe viewer/share representation exists.
- [x] Run `node --test test/work-artifact-conversions.test.mjs test/work-service.test.mjs test/sites-service.test.mjs test/spaces-client.test.mjs test/spaces-hub.test.mjs` when those integrations change. Verify private-source exclusion and source-copy independence.

**Done when:** creative Work coexists with existing dashboards, sites and spaces, and cross-area copies remain understandable and private by default.

### W26 — Accessibility, performance, portable projects, and final acceptance

**Evidence boundary:** Native keyboard/draft recovery, Unicode, contrast, reduced motion, narrow layout, 100/150/200% emulated page zoom and actual editor workloads have automated evidence. Physical OS IME candidate interaction, spoken screen-reader output and physical multi-monitor DPI remain manual acceptance items; emulation is not claimed as those checks.

**Depends on:** all enabled milestone features; run applicable checks throughout delivery. **Produces:** tested product behavior and an honest completion record.

**Files:** Create `src/work/project-packages.mjs`, `test/work-project-packages.test.mjs`, and `scripts/work-studio-acceptance.mjs`. Modify owning UI/performance modules, `package.json` test entries and `scripts/run-ci-suite.mjs` only as required. Record evidence in `docs/validation/work-creative-studio.md` when implementation begins.

- [x] Add a versioned portable project package containing the chosen document and its required assets, with explicit optional history. Validate manifest/hashes, bounded extraction and path containment; importing creates independent IDs/workspace ownership. Do not include chats, credentials or unrelated files.
- [ ] Verify accessible names, logical tab order, focus restoration, keyboard selection/move/resize, deletion/undo, non-color status cues, inspector alternatives for canvas actions, reduced motion and readable contrast. Test IME composition and common Unicode/RTL/CJK content.
- [ ] Verify narrow windows, multiple display scales, zoom/fit and high-DPI canvas rendering. App theme changes must not unexpectedly change exported document colors or dimensions.
- [x] Lazy-load editor/media bundles; virtualize long slide/layer/timeline lists; bound thumbnail/proxy/history caches. Run the representative workloads below and record hardware, fixture, app revision and measured timings.
- [x] Add meaningful new native/UI tests to the appropriate CI suite so required checks execute them. Do not treat an unregistered standalone smoke script as recurring CI coverage.
- [x] Run the format-specific acceptance matrix, existing affected Work regressions and project-package tests. Keep remaining provider/Office/runtime gaps visible in the status ledger; do not check off an entire milestone because its unit tests pass.

**Done when:** every enabled feature meets its acceptance gate, current Work remains usable, and a new chat can find the exact validation evidence and remaining gaps.

## Acceptance and verification plan

### Required end-to-end examples

| Deliverable | User flow | Evidence required |
| --- | --- | --- |
| Poster | Create a flyer with logo, text, grouped shapes and two artboards; change size; undo; reopen | Correct raster pixel sizes, alpha/background behavior, PDF page size/bleed and visual inspection |
| Image | Crop a rotated photo, adjust color, add text/mask, create a variation, reopen | Original preserved; preview/export match; transparent pixels and orientation verified |
| Presentation | Build a five-slide deck with text, image, shape, chart, table and notes; reorder; reopen | Native editable PPTX objects and an independent edit/save; readable PDF and presenter output |
| PPTX import | Import a supported deck plus a deck with unsupported elements | Editable supported objects, retained original, accurate per-slide import warnings |
| Video | Assemble a 30-second sequence with two video tracks, music, a title, captions, a crossfade and a speed change | Saved timeline; independently decoded MP4; dimensions/duration; audio sync and subtitle timing |
| Motion | Animate a poster's text/image/chart with keyframes and easing | Matching sampled frames, correct MP4/GIF timing and successful reopen |
| Document | Create a multi-page report with heading hierarchy, table, image, chart, header/footer and page numbers | Editable DOCX subset, independent edit/save, readable paginated PDF |
| Conversion | Convert report → slides and slide → poster/motion | Source unchanged, new IDs/assets, editable destination, disclosed losses |
| AI edit | Ask Muse to change a selected heading while another object is manually edited | Correct scope, conflict behavior, review/apply/undo, no unrelated overwrites |
| Provider media | Explicitly generate an image or clip with a real configured provider | Real request/output evidence, provenance, cancellation/recovery and correct import; otherwise marked unverified |
| Recovery | Interrupt a save/export, restart an isolated profile, reopen previous work | Last valid revision retained, job status truthful, no corrupt destination or duplicate billable request |
| Portability | Export/import a project package, then open offline | Required assets present, hashes valid, independent ownership, no private extra files |

### Performance workloads and initial targets

These are implementation targets, not current measurements or guarantees. Record a reproducible Windows reference machine and baseline before optimizing. If a target is missed, record the cause and change the implementation or explicitly revise the target with evidence.

| Workload | Initial target |
| --- | --- |
| 200 mixed library entries with cached thumbnails | Library usable within 2 seconds after data is available; search/filter updates within 200 ms |
| Design with five artboards and 250 total nodes | Selection/property feedback within 100 ms; interaction remains responsive without blocking save/error feedback |
| 50-slide deck with mixed text/images/charts | Cached slide switch within 200 ms; thumbnails generated off the interaction path |
| Ten-minute 1080p video project with four tracks and 20 clips | Proxy seek typically within 500 ms; editing and cancellation remain responsive while exporting |
| 50-page report with tables/images | Typing feedback within 100 ms in the active block; pagination work does not block the whole editor |
| Heavy render/import | Progress or indeterminate state visible within 1 second; cancellation acknowledged within 1 second even if process cleanup takes longer |

Before enabling each importer, commit finite byte, decoded-pixel, duration, object-count and cache limits in `work-limits.mjs`, backed by boundary tests and measured memory use. A disabled or clearly rejected oversized input is preferable to claiming unlimited media support. These new limits must not silently relax the existing source-import or generic file-viewer boundaries.

### Verification commands and evidence rules

Run targeted checks for the code actually changed. New test filenames above are proposed and become runnable when their tasks create them.

Existing focused baseline checks:

```powershell
node --test test/work-artifacts.test.mjs test/work-catalog.test.mjs test/work-service.test.mjs test/work-root.test.mjs test/work-protocol.test.mjs test/work-export.test.mjs
```

After UI/native outputs change, build before running the relevant source-app smoke/probe:

```powershell
npm.cmd run build
node scripts/work-smoke.mjs
node scripts/work-export-probe.mjs
```

These existing scripts use isolated test data. Review that property again before extending them. Never point fixture tests at the installed production profile, close the user's installed app, or modify its documents as part of validation.

- Add task-specific `node --test` checks and end-to-end probes only where they prove behavior, failure handling, data fidelity or an actual regression. Do not write cosmetic tests that merely repeat implementation constants.
- Record **unit/fixture**, **browser preview**, **isolated native app**, **independent Office/media inspection**, and **live provider** results separately. One category is not evidence for another.
- Missing Muse, FFmpeg, an Office application, or provider credentials is a real acceptance gap for dependent capabilities, not a reason to fake output. Continue independent local implementation work and state the remaining prerequisite.
- For additional local CI groups, use `node scripts/run-ci-suite.mjs <suite> --reuse` after building current outputs when required. Inspect the timing report's `reused`, `fingerprint`, and `evidenceStable` fields before relying on reuse.
- Do not rerun passing checks simply because HEAD changed, CI is pending, or only documentation changed. New failures, changed relevant inputs, missing/expired evidence, or a new concern justify fresh checks.
- Publication requires a later explicit request. Then follow `AGENTS.md` and `docs/RELEASING.md`, including one normal `npm.cmd run release:preflight`, exact-candidate required GitHub CI, and validated installer/updater publication. Report the release link and stop; installation/restart/profile work requires a separate request.

## Progress and handoff ledger

Update this table during implementation. A feature cannot be marked verified without a source revision, evidence path and the relevant real-output acceptance result. Preserve partial/blocked status instead of erasing unfinished work.

| Milestone | Current state | Completion evidence |
| --- | --- | --- |
| A — Visual studio, W01–W07 | Implemented; native editing/export/recovery verified | Final six-editor formats gate `formats-QMwkUj`; save/quit recovery `recovery-95IhBH`; original asset and print output proofs in validation ledger |
| B — Templates/Muse/PowerPoint, W08–W12 | Implemented; Office editable output verified; live Muse proposal acceptance unverified | Independent LibreOffice edit/save/reopen `portable-26.2.4-verified`; scoped proposal/source regressions; templates/brands and native presenter/import proofs |
| C — Video, W13–W17 | Implemented; 30-second output/timing/audio and mixed Arabic/CJK text verified | Final `work-video/30second-proof/2026-11-06T01-04-04.936Z`; native `formats-QMwkUj` and saved font receipts; actual 10-minute proxy seek and virtual timeline evidence |
| D — Motion, W18 | Implemented; native MP4/GIF and reopen verified | `work-motion/probe-jds1No`; strict formats gate sampled timing/output |
| E — Documents/conversion, W19–W21 | Implemented; native PDF/DOCX, independent editing, legacy copies and container fit/zoom verified | `work-documents/probe-hTmUCb`; independent LibreOffice; `acceptance-qhSqaP`; `document-contrast-zYU5AH`; `document-layout-cPtega`; final 50-page typing `run-HNFffu` |
| F — Optional providers, W22–W24 | Muse Image and transcription adapters implemented; live output unverified; unsupported actions Coming soon by user decision | Official API contracts and credential/provenance/cancellation fixtures; no billable live call made |
| G — Integration/acceptance, W25–W26 | Implemented; applicable local gates passed; physical assistive-device checks remain manual | Fresh 2,781/2,781 units with stable fingerprint; packages/sharing regressions; core10 + legacy4 + formats30 + recovery11 + document-layout6 native checks; four-editor and 200-item library performance reports |

For each implementation batch, append a compact record with:

- Task IDs completed, partially completed and deferred, with specific reasons.
- Branch/worktree and source commit or uncommitted patch identity.
- Commands run, outcomes, artifact/report paths and any reused evidence metadata.
- Actual user flow and exported files inspected; application/provider versions used where relevant.
- Data migration/compatibility observations and known unsupported inputs.
- The next unblocked task and any external prerequisite. Do not record credentials or private source content.

## Instructions for the implementation chat

1. Read root `AGENTS.md`, this roadmap, and the current relevant code. Inspect `git status`; preserve unrelated edits and prior progress. Recheck the baseline instead of assuming every proposed file is still new.
2. Use the existing Muse Work implementation and stable IDs. Prefer an isolated `codex/` branch/worktree when code changes need separation, following current project instructions.
3. Start with milestone A unless the user selects another milestone. Write a short execution plan for that batch, then complete the earliest unblocked tasks in dependency order. Keep module contracts consistent across batches.
4. Complete an actual end-to-end deliverable before expanding into more unfinished editors. Do not mark scaffolding, read-only previews, fake provider output or screenshots as implemented features.
5. Keep routine choices moving using the requirements here. Ask only for a consequential product decision, missing required authorization/credentials, or an external prerequisite that cannot be resolved from the repo; continue unrelated work when possible.
6. Add focused tests and inspect real outputs. Update task checkboxes and the evidence ledger honestly. If context runs short, leave an exact checkpoint so the next chat can continue without restarting the project.
7. Keep the batch local. Do not publish, install, restart the installed app or alter its profile unless separately requested.

Suggested prompt to paste into another chat:

> Read `AGENTS.md` and `docs/superpowers/plans/2026-11-05-work-creative-studio-roadmap.md`. Implement milestone A (W01–W07) in the existing Muse Work section, completing the poster and local image editing flows end to end. Preserve legacy projects and native Muse behavior. Use the roadmap's file map, dependencies, acceptance criteria and evidence rules; update its checkboxes and progress ledger as you work. Keep changes local and do not publish or install anything. Continue through unblocked tasks and report actual verification plus any remaining gaps.

For later batches, replace “milestone A (W01–W07)” and the deliverable description with the desired milestone. Keep the compatibility, evidence and local-only instructions.
