# Model screenshot and image inspection

Reuse the existing chat-bound browser MCP on both exec and interactive transports. Browser capture already returns MCP image content; add fixed read-only `view_image`, `list_chat_images` and `view_chat_image` tools. Project reads stay inside the owning project with regular-file/identity checks. Chat image IDs come from the current chat manifest, not model-supplied private storage paths. Normalize PNG/JPEG/WebP through Electron after bounded header validation, with pixel/byte limits and explicit original/resized dimensions.

Browser screenshots continue to require the user's per-chat browser control switch. Project/chat image reads do not require opening a browser. No general desktop capture, arbitrary JavaScript, shell helper, account change or new paid provider is introduced. Capabilities revoke on disconnect, owner/root change, cancellation and read-only-plan mode.

Persist bounded visual evidence separately from native lifecycle authority, tied to the exact owning request. Show an expandable image entry/thumbnail in its work log, with truthful viewed/captured labels. Never infer model understanding or successful completion from an image receipt. Keep restored evidence validated and image references retained by existing ownership cleanup.

Verify image boundary handling, MCP image blocks, auth/cancellation, request ownership/durability, existing exec/MSP configuration, and an isolated Electron fixture with nonblank rendered browser pixels and image thumbnails. No live model calls or installed profile changes.

## Implemented and verified

- Fixed MCP tools: `view_image({path})`, `list_chat_images({})`, `view_chat_image({id})`; existing `browser_capture({})` returns real PNG image content. Same trusted server is provisioned on exec and interactive transports. Browser screenshot access retains the visible-browser/control gate.
- Project reads: 20 MiB input, PNG/JPEG/static WebP, 16,384 dimension / 40 million pixel ceiling before decode. Delivered image scales to at most 2,048 pixels per side / 7 MiB PNG. Output includes original and delivered dimensions. Windows WebP uses fixed trusted code in the app's isolated Chromium world; no provider page or shell decoder.
- At most 12 visual references per request, validated on restoration. Per-project image mutex covers import plus ownership publication and cleanup plus unlink. Pruned/canceled references are released; cleanup cannot delete an identically hashed newly retained image. Native lifecycle authority remains separate.
- Full build/typecheck passed. 229 targeted tests passed, including 15 host image boundary cases and 6 evidence/retention cases. Test log: `artifacts/visual-tools/unit-tests.log`.
- Isolated Electron + actual stdio MCP passed 5 checks including native PNG/JPEG, Chromium WebP, nonblank browser capture, revocation, thumbnail viewer, and visibility after 120 native activities: `artifacts/visual-tools/desktop-iNf5Ld/report.json`.
- Existing browser-control native smoke (9 checks) and full source request-activity UI smoke (14 checks) passed; activity evidence: `artifacts/activity-ui/source-SwHJzW/report.json`.
- Focused independent review findings were fixed and rechecked, including a deterministic paused-unlink/concurrent-import regression. No material findings remain.
- These are real host/transport/image-rendering checks with no provider/model requests. Live model delivery/understanding has not been exercised. No publication, installation, installed-app restart, or account/permission changes were made.
