# Codex source-informed harness improvements

30 October 2026. User request: deeply analyze `https://github.com/openai/codex`, add useful missing capabilities to MuseBench's roadmap and implement the selected additions. Existing authorization covers feature-by-feature implementation/review/push, shared preview/desktop, and final verified Windows installation. Selection and design choices below are the implementer's judgment, not an assertion that the user approved an unseen document.

## Intent and approach

Make existing Muse workflows more useful and responsive, with clearer source and completion evidence. Compare against pinned upstream **a795f961be68383738e56ac396742b3e8451696a** and MuseBench baseline **103df231cb1367b405376291650578fa40f30dac**. Six bounded additions are selected; existing forks, worktrees, schedules, history, tool discovery, OAuth, context inspection and batching are not counted again.

Adapt the relevant patterns inside the existing Electron/React/Node architecture. Importing Codex's Rust engine would introduce a second provider/runtime and incompatible session/permission contracts. Recreating its entire desktop/cloud product is neither supported by this repository nor useful to this request. No upstream implementation is copied verbatim; immutable source links document the inspiration.

## Global constraints

- Native Muse remains the backend. No paid model calls, hidden inference, personal account/billing/permission changes, or execution of upstream Codex code.
- Existing native session, request, approval, source digest, cancellation and no-replay boundaries remain authoritative.
- Provider frames, credentials, form values and private tool configuration are excluded from new diagnostics.
- Preview and desktop share product UI. Preview fixtures are labeled and never establish provider acceptance.
- Preserve saved chats, profiles, drafts, source history and existing compatibility identifiers.
- Keep current context, IPC, filesystem, schema and receive limits unless a specific requirement below narrows them.
- Test with disposable fixtures and focused behavior assertions; source, real Electron, scripted native, CI and installed evidence are distinct.
- Commit and push each reviewed finished feature. Install only the exact latest fully validated published Windows x64 artifact, with idle checks, full profile backup, manifest/hash verification, graceful close and reopen.

## CS01 — Complete app instruction snapshots

Current prompts omit an empty saved instruction section, so a continued native session receives no explicit retirement of earlier text. Every ordinary composed request will include a small, complete snapshot of the two app-owned saved settings: personal instructions and project instructions. Clearly state that this snapshot replaces earlier instances of those same app settings; an empty section explicitly means no current instructions in that scope. Keep the full nonempty current text on every request because native compaction membership cannot be inferred from an app digest.

This does not replace repository instruction files, skill bodies, direct conversational requests, objectives or permission policy. It does not erase native history or guarantee obedience. A stateless complete snapshot is deliberately preferred to a new accepted-state transition database: it works after old-schema restore, fork, compaction or an uncertain previous send without guessing what survived. Existing per-request hashes identify the actual text. Add a small versioned instruction-snapshot descriptor to context receipts and explain the behavior in existing context/settings UI without new top-level chrome.

Acceptance: exact outgoing snapshots for nonempty/edit/clear, empty first request, unchanged settings, independent projects, native/fallback context, old-session restoration, fork/side and queued delivery admission. Previewing or saving settings never sends anything. Existing 16,000-character prompt and 64,000-character context bounds remain.

## CS02 — Useful oversized tool-result previews

The reviewed discovery gateway currently preserves outcome but discards all content when its fully encoded response exceeds 128 KiB. Preserve the existing original result/schema validation, then return a clearly labeled lossy preview. Keep source ID/name, catalog revision, tool, failed/completed outcome and original encoded byte count. Include at most 16,000 Unicode code points of text with a balanced head/tail and an omission marker, then shrink if the complete JSON-RPC frame still exceeds 131,072 bytes. Omitted text counts refer explicitly to code points; original encoded size refers explicitly to bytes.

Only MCP text content is eligible; structured-only/media-only results receive an omission explanation. Do not expose partial image/audio data, arbitrary metadata or truncated structuredContent as an authoritative structured result. Preserve `isError` meaning and source-provided truncation distinctions. No persistent output store, extra file-reading tool, model summarization, retry or larger transport budget is added.

Acceptance: large success/failure, structured schema validation before truncation, Unicode/surrogate/combining sequences, escaped characters, many blocks, media-only output, exact frame bounds and unchanged one-call/unknown-outcome behavior for stdio and remote fixture sources.

## CS03 — Semantic native navigation completion

Navigation success will mean that the requested shell destination actually committed, not that every document animation ended. Use a unique request identity and explicit React-commit acknowledgement bound to the requested destination, including settings section/customize tab/chat identity where applicable. An unrelated render or changed selection cannot satisfy it. Cancellation/expiry prevents late completion or a second reply; native actions are never replayed.

Keep the existing 8-second request deadline and enforce it in the main-process reply path even if its timer has not fired. After verified commit, allow at most 400 ms for relevant visible destination transitions; report visual settling separately. Hidden, unrelated, paused/zero-rate or infinite animations do not block semantic completion. No animation-frame progress must not hide an already committed destination. Screenshot capture remains a separate pixel observation.

Add bounded diagnostic receipts for the last 20 shell operations using only operation/target enum, phase, outcome and elapsed milliseconds. No request arguments containing IDs, text, paths, provider URLs or inputs are copied into diagnostics. Preserve current top-level inspect fields; an optional navigation metadata object records committed/visual status. The prior personal-app timeout is unconfirmed: do not declare its cause without a fresh phase receipt.

Acceptance: exact commit versus target mismatch; delayed relevant transition; unrelated hidden/infinite/paused animations; stalled rAF; reduced motion; cancellation before/after claim; late replies with overdue timers; one terminal outcome; renderer loss. Real isolated Electron checks must use the installed public bridge, not direct component state injection for the main journey.

## CS04 — Bounded desktop state delivery

Existing 40 ms producer coalescing remains. Add a shell presentation publisher with one in-flight snapshot and one replaceable latest pending snapshot, keyed by generation/revision. Acknowledgement confirms renderer consumption only, never a command or model action. Durable state processing, notifications, Work/Sites observers, approvals and owned background work stay independent.

Main/preload use a private versioned envelope while retaining the existing public state API. A single ordering gate covers pushed snapshots, initial reads and state-returning commands so late replies cannot roll back newer UI state. Preserve each action's own error/result semantics; stale action data must not be relabeled as a new canonical snapshot. Subscribe before initial read, and acquire a fresh authoritative snapshot on renderer reattachment. Validate acknowledgements from the trusted current main frame and ignore wrong generation/revision.

An unacknowledged delivery does not cause repeated full-state sends: after 2 seconds suspend that presentation stream, retaining only the newest state. A subsequent valid acknowledgement or explicit view reattach recovers from current canonical state; no model reconnect/action replay. Window destruction/reload rotates generation and clears in-flight view ownership. Public preview behavior remains compatible.

Acceptance: 10,000 publications while acknowledgements are held retain one in-flight/one pending; newest terminal/pending-input facts delivered on recovery; second observer unaffected; stale ack cannot release a new renderer; initial-read/dispatch races; renderer reload and background hide/reopen. Record counts and a real disposable Electron burst/reattach check; do not infer model latency gains.

## CS05 — Source-attributed discovery approval cards

Recognize only the exact app-owned `mcp__musebench_discovery__discovery_call` and validated JSON arguments `{sourceId,catalogRevision,tool,arguments}`. When the approval belongs to the current runtime session/turn and the source ID is in that connection's reviewed `toolDiscovery.sources`, show compact **Source** and **Tool** rows above the existing complete raw request. Use the reviewed source ID as the initial public label; do not reread private configuration or add endpoint/credential fields solely for this feature.

These are literal requested identities, not assurances that a tool is safe, healthy or currently authorized by a remote provider. A stale/unresolvable/malformed wrapper receives the existing generic raw view. Do not interpret arbitrary tool names/descriptions as Markdown/HTML. Preserve exact one-time tokens, existing truncation/incompleteness approval disablement and full raw argument access. The gateway still revalidates source/catalog/tool before execution; the card cannot certify a catalog revision merely because it has the right shape.

Acceptance: same-name sources, wrong wrapper, unknown source, mismatched session/turn, malformed/oversized JSON, changed runtime selection, hostile labels, narrow layout and keyboard reading. Native fixture approve/deny identity and call counts stay unchanged; no new model turn is needed.

## CS06 — MCP configuration origin explanations

While the existing project MCP resolver merges personal and project layers, record which source path/revision supplies each effective field and which earlier declarations it replaces. Add an optional **Setting sources** disclosure inside each existing Project server review row, using compact readable field names and source paths. It is read-only and uses the same immutable inspected snapshot as the effective values/review digest.

Follow the existing qualified merge and canonical aliases exactly. Scalars/arrays replace; nested environment/header maps retain per-key origins. Defaults are labeled built-in defaults, not attributed to a file. Provenance contains field names, source paths and source revisions only: never header/environment values, source document bodies or substituted private values. Missing fields and explicitly false flags remain distinct. Bound entries using existing maximum files/server/map limits and do not render a second large source inventory by default.

Acceptance: personal/root/nested sources, inherited maps, replacements/false flags, canonical/legacy aliases, stable revision, mutation invalidation, no secret leakage, narrow/keyboard shared preview and desktop. Do not expand native precedence or change execution/trust grants.

## Not selected in this pass

Installed-extension update comparison needs a separately qualified reversible official CLI replacement contract; current source review/install remains available. Raw runtime snapshot-copy optimization needs a measured material bottleneck below existing batching. Native deferred schemas, retention tuning, hidden memory consolidation, provider prompt caching/prewarming, extra hook events, individual process handles and cloud services require contracts or authorization not supplied by upstream Codex's code. These are research boundaries, not six more promised implementations.

## Delivery and review

Use one independently reviewed task per selected feature, with an overall final review. Record source links, changed behavior, focused tests and evidence boundaries in the roadmap/research/validation documents. Prior generation receipts remain preserved. A final installed check must distinguish personal-app observations from disposable fixture results; any unresolved personal navigation timeout retains a concrete diagnostic record.
