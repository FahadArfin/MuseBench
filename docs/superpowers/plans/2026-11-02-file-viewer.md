# File Viewer Implementation Plan

**Goal:** Preview actual Muse Code project outputs beside chat: HTML, Markdown, PDF, Word DOCX and PowerPoint PPTX, with local rendering, file browsing, source view, page/slide navigation, zoom, refresh and draft-only file comments.

**Architecture:** A host-owned file-preview service binds current task/project and snapshots validated regular files. Opaque temporary capabilities serve file bytes, static relative HTML assets and a bundled viewer through `musebench-files:`. The shared UI embeds a sandboxed opaque viewer frame; local PDF.js, docx-preview and @aiden0z/pptx-renderer retain visual layouts. Model HTML stays in a further sandbox with no native bridge or external network. Preview mode uses the same viewer bundle and fixture/approved loopback bytes, never desktop filesystem access.

**Approaches:** Browser-native format renderers chosen for portable local previews. Hosted Office viewers would upload private files; unavailable local Office applications/converters are not a prerequisite. Complex Office layout/fonts/animations can differ; state limitations and offer original download rather than presenting extracted text as a faithful rendering. Keep the existing Work artifact renderer intact.

**Scope and ownership:** Preserve the existing local Desktop Assist and Predictions batch on `codex/desktop-assist`. No installed app/profile changes or publication. Root owns shared types, viewer UI, build/protocol integration, transcript links and session files entry. Independent backend and renderer tasks own separate files. No paid model calls or new AI provider.

## Contracts

- Shared `src/shared/file-preview-types.ts`: `PreviewKind='html'|'markdown'|'pdf'|'docx'|'pptx'|'text'|'image'`; `PreviewFile={token,taskId,path,name,kind,size,revision,rawUrl,resourceBaseUrl,source?:string,sourceTruncated?:boolean,warnings?:string[]}`.
- Commands: `{type:'list',taskId,directory?:string,offset?:number}` returns `{directory,entries:[{name,path,kind:PreviewKind|'directory'}],nextOffset?:number,outputs:[{name,path,kind}]}`; `{type:'open',taskId,path}` returns `PreviewFile`; `{type:'close',taskId,token?}` revokes current snapshots; `{type:'feedback',taskId,token,comments:[{page:number,x:number,y:number,note:string,quote?:string}]}` returns `{taskId,text}` for an editable draft only. No renderer-selected root or executable.
- Host `createFilePreview({getState,assetRoot})` returns `{command,handle(request),reconcile,close}`. Resources: `musebench-files://file/<token>/<relative-path>` and fixed trusted `musebench-files://assets/<asset-path>` (no arbitrary paths). `rawUrl` points to the snapshot file; resource base is token's approved source directory. Header CSP/CORS isolate the viewer and block non-local network, permissions, downloads/popups and native access. Cache at most two snapshots, bounded size/inflation. No symlink/junction/root escape, sensitive dotfiles or executables; input changes/disconnect revoke access. Static assets confined to approved source directory.
- Trusted viewer entry: parent iframe loads `musebench-files://assets/frame.html#<nonce>` (preview uses equivalent loopback asset URL). Fixed frame code accepts messages only from its parent with nonce and emits messages with nonce; parent validates exact iframe source. `render` message supplies PreviewFile; `view` sets page/zoom; `annotate` toggles point selection. Events `ready`, `loaded {pages}`, `page {page}`, `selection {page,x,y,quote?}`, `error {message}`.
- Renderer module `src/ui/file-preview/renderers.ts`: `renderFile(file,container,{onPages,onPage,signal}):Promise<{pages:number;setPage(page):Promise<void>|void;setZoom(zoom):Promise<void>|void;destroy():void}>`; renderer receives bytes through `fetch(file.rawUrl)`, uses only local assets. HTML iframe retains relative resources. Markdown uses existing React Markdown/GFM and no raw HTML. DOCX uses paginated layout/images/styles/headers/footers and disables altChunks; PPTX keeps authored layout/media/charts with externalMedia blocked; PDF renders pages to canvas with selectable text when supported, worker local.
- Root creates viewer frame entry (`frame.ts`, bundled HTML/assets), parent FileViewer/Files panel and bridge command `filePreview`; frame renderer dependencies loaded on demand and isolated from trusted app DOM.

## Tasks

- [x] Backend file/ZIP guards, capabilities, safe static assets, output discovery/listing, stale-owner cleanup and file feedback, with tests.
- [x] Local PDF/DOCX/PPTX/HTML/Markdown rendering adapters with navigation, zoom, cancellation/cleanup and real fixture proof.
- [x] Shared UI: Files sidebar page, output cards/local transcript link entry, browsable folders/path, preview/source tabs, comments with optional existing dictation, refresh/download, auto-open preference without stealing in-progress input.
- [x] Protocol/build/preview integration, exact dependency versions, clean CI fixtures, focused tests/build, native Electron flow and independent review.

**Review focus:** Untrusted files cannot access native bridge or external network; ZIP bombs and stale tokens fail closed; close/navigation cancels rendering and worker/blob resources; original bytes/layout are represented honestly; no automatic file execution beyond the sandboxed HTML preview; annotations stay drafts until sent.

## Final evidence

- Build and TypeScript passed.
- File host/path/frame targeted tests passed, including stale async and token navigation cases.
- Renderer fixture smoke passed seven formats without external requests.
- Native shared viewer fixture: artifacts/file-viewer/fixture-e5pVQQ/report.json, eight checks passed.
- Actual source app: artifacts/file-viewer-app/fixture-u2rBbF/report.json, three checks passed.
- Independent review found and verified fixes for navigation admission, comment attachment races and stale render/view completions.
- No model calls, publication, installed-app restart or profile changes.

- Final focused unit run: 36 passed, zero failures. Browser preview sample PDF + dark/light visual checks passed (artifacts/file-viewer-preview/report.json).
