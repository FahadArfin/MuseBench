# T304: Direct response quotes

Implemented on 30 October 2026 in the shared Code transcript and composer. Muse remains the only coding backend.

Quote response captures a selection wholly within one settled assistant reply. Keyboard activation without a selection captures the displayed reply, including code/list/link text and excluding code toolbar labels. Cross-reply selections and selections starting or ending in toolbar controls, active chats, archived chats and changed destinations reject safely. Pointer cancellation and keyboard activation discard an abandoned pointer snapshot.

The captured text becomes readable, escaped blockquoted text with stable chat/message IDs in its attribution. It appends through the existing owner-scoped `appendDraftText` path. The complete combined draft must fit 16,000 characters; failure preserves every prior character. Quote never sends, queues, connects or changes permissions. Saved-prompt mutation and unknown-outcome recovery fences remain authoritative, and Quote never saves around them.

The latest staged quote offers Inspect quote source. The compact reader retains the exact captured displayed text and reads current saved source through the existing bounded `readChatHistory` API. It shows capture coverage, changed/missing/unavailable states and paged saved excerpts without claiming Markdown line offsets. Late source reads cannot appear in another chat. Escape closes the reader and restores the trigger's focus. Editing the exact quote away removes its shortcut.

The quote itself is ordinary durable draft text, retaining attribution through saved prompts, explicit queue storage and restart. The source-reader shortcut is current renderer staging state: after reload the text remains, but this shortcut is not reconstructed. Arbitrary restored text is never parsed into source actions. Source edits/deletion do not rewrite the quote, and there is no new rich context codec, native API or provider integration.

## Local evidence

- `node --test test/response-quote.test.mjs test/controller-drafts.test.mjs test/queue-recovery.test.mjs test/ci-suites.test.mjs test/prompt-shelf.test.mjs test/renderer-state-preload.test.mjs test/native-preload.test.mjs`: 56 passed, zero failed. Six quote tests cover exact displayed/selected text, whitespace, emoji, escaping, identity validation, exact combined limit/no truncation, and real controller draft/explicit queue persistence across restart. The offline queue test counts zero runtime connect/send calls.
- `npm run build`: native helpers, TypeScript, production Vite and native MCP build passed. Existing large-chunk warning only.
- `npm run test:response-quote`: shared real App in browser and production Electron preload/IPC/controller, with disposable profiles. Covers selections in code/lists/links and across formatted/code regions within one reply, keyboard full reply, pointer cancellation, existing text preservation, edited-away shortcut, source changes/deletion, oversize rejection, cross-reply rejection, chat-switch race, held source read, pending and unknown shelf fences, no blind save, active snapshot rejection, durable reload, 390px layout, reduced motion and Escape focus. Source-reader screenshots were visually inspected.
- `npm run test:prompt-shelf`: browser and production Electron regression checks passed, preserving T303.
- `npm run test:chat-history-find`: browser and production Electron regression checks passed, preserving T302. An earlier parallel fixture attempt hit occupied port 5173; the sequential rerun passed.

Both quote UI variants count their request-admission boundary; no provider admission actions were observed, and the seeding fake runtime counted zero connect/send calls. Active-state evidence uses an explicitly delivered fixture snapshot, not a live native reply. No paid requests, upstream executable runs, personal profile, account, billing or permission changes were made.

Initial RED evidence: absent quote builder and absent Quote button. A later regression check caught an abandoned pointer snapshot being reused for keyboard activation; the action now clears it on pointer cancellation, blur and keyboard input. A same-reply cross-format selection regression also caught an over-strict toolbar intersection rejection; selection endpoints are validated while the displayed selection remains verbatim. The source shortcut is tied to the exact quote text in the current draft.

Registered as `test:response-quote` in the chats CI suite, with clean fixture reports under `artifacts/response-quote/**/report.json`. The script supports `MUSEBENCH_EXECUTABLE` for later exact installed-artifact checks. Local verification used the source Electron app with production preload/IPC; packaged/installed artifact, remote CI, release and live provider acceptance remain separate evidence classes. The previously green broad unit suite was not repeated for this feature; required CI retains every unit and UI group.
