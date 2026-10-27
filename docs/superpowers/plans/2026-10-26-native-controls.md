# Native controls implementation plan

> Execute with superpowers:executing-plans. User authorized implementation and per-feature GitHub delivery, retaining shared preview/desktop UI.

**Goal:** Add native exact-turn steering, asynchronous compaction and observed workflow-child controls over an explicitly selected Full access MSP connection.

**Architecture:** Keep Windows exec as default. A per-chat runtime selector owns one adapter at a time; interactive Full access opts into official `serve --disable-sandbox`. Preserve exact version/schema validation and independently verify Ask me/onRequest. Do not pretend sandboxAvailability becomes available. Connection-scoped sessions replay app history only when starting a new session; existing exec durable sessions remain unchanged. Use command identity and terminal events, not an acknowledgement as completion.

**Stack:** existing Electron/React/SQLite and pinned Muse SDK 1.4.13. Shared typed actions and preview fixtures; no new provider or dependencies.

**Constraints:** explicit Full access only; human approval remains separate; no automatic retry after uncertain command; expected turn/session/child attempt required; no QA-only workflow executor; no invented child messaging. User explicitly selected true live steering earlier, so Enter during a capable run steers and Alt+Enter continues to queue.

## Review focus
- Late response after disconnect or turn replacement cannot affect a new turn.
- Accepted commands are not completed operations; unknown outcomes stay visible.
- New interactive connections must not omit prior app history.
- Native compaction preserves local history and exposes failed/no-op outcomes.
- Child actions require current observed identities and refuse stale attempts.

## 1. Interactive connection and steering
- [x] Add failing runtime tests for explicit Full access, exact target/ack, rejection, unknown timeout, disconnection and default-exec selection.
- [x] Implement optional compatibility gate parameter that skips only sandbox availability after explicit host Full access selection; keep all metadata checks.
- [x] Add runtime selector, typed steer action/controller admission, draft preservation and composer controls; preview simulates the same UI.
- [x] Verify real native shell turn absorbs a correction in the same turn; verify stale target rejected. Run full tests/build/parity, commit and push.

## 2. Native compaction
- [ ] Pin schemas and write tests for admission/terminal ordering, no-op, failure, wrong command and interruption.
- [ ] Add runtime compaction state, controller/IPC action and shared Session dialog controls with no transcript deletion.
- [ ] Run native compaction against an owned real session and verify terminal result; tests/build/parity, commit and push.

## 3. Child controls
- [ ] Pin supported child operations and test observed identity, attempt/revision guards, refusal and uncertain receipts.
- [ ] Fold native workflow children and expose supported controls in shared Session UI; unsupported peer messaging stays unavailable.
- [ ] Validate native observed children using a supported invocation if available. Do not manufacture a successful child control from fixtures; record any native admission blocker precisely. Tests/build/parity, commit and push.

## Closeout
- [ ] Independent final review, fixes, verified production package/install, clean GitHub sync. Keep user data and previous install backup.

Feature 1 evidence: 717 tests; 54 browser/packaged-renderer parity scenes; real native same-turn steering applied with confirmed host shutdown. Review fixed history budget, transport-session ownership and durable unknown steering receipts. The first full-suite run had an unrelated HTTP oversized-body connection reset; focused and full reruns passed.
