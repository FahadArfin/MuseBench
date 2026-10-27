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
- [x] Pin schemas and write tests for admission/terminal ordering, no-op, failure, wrong command and interruption.
- [x] Add runtime compaction state, controller/IPC action and shared Session dialog controls with no transcript deletion.
- [x] Run native compaction against an owned real session and verify terminal result; tests/build/parity, commit and push.

## 3. Child controls
- [x] Pin supported child operations and test observed identity, attempt/revision guards, refusal and uncertain receipts.
- [x] Fold native workflow children and expose supported controls in shared Session UI; unsupported peer messaging stays unavailable.
- [x] Validate native observed children using a supported invocation if available. Do not manufacture a successful child control from fixtures; record any native admission blocker precisely. Tests/build/parity, commit and push.

## Closeout
- [x] Independent final review, fixes, verified production package/install, clean GitHub sync. Keep user data and previous install backup.

Feature 1 evidence: 717 tests; 54 browser/packaged-renderer parity scenes; real native same-turn steering applied with confirmed host shutdown. Review fixed history budget, transport-session ownership and durable unknown steering receipts. The first full-suite run had an unrelated HTTP oversized-body connection reset; focused and full reruns passed.

Feature 2 evidence: 724 tests; 56 shared-renderer parity scenes; real compaction 28,134 to 20,832 native tokens, local transcript preserved, subsequent turn retained the cobalt marker. Review fixed interrupted receipt restoration. The protocol supplies no compaction command identity in view items: serialized idle-only dispatch binds the first new manual item for the exact owned turn, then follows its revision.


Feature 3 evidence: 739 tests, production build, and 62 browser/production-Electron renderer parity scenes passed. Real pinned-host probes confirmed child message delivery changed its final result, interruption cancelled child work, parent reporting turns were retained, and owned host shutdown completed. A generated workflow child's follow-up was rejected by Muse with `subagent_state_ineligible`; no successful follow-up effect is claimed. Other controls retain native admission checks and fixture coverage.

Review fixes: reserve the checkout through child work and automatic parent reporting turns; separate result-ready from closed child lifecycle; retain original prompt attribution; keep unknown commands blocked after receipt eviction; choose the latest workflow attempt; preserve immutable steering text; clear native root identity on fresh request submission; prevent older-root child launches; release known rejected launches; keep Session controls available during child-only work and queue rather than steering a completed foreground turn. The production-package comparison now includes the modified SDK adapter modules.


Closeout: feature commits `2e5e11d` (steering), `d1f88af` (compaction), and `596e96c` (children) were pushed separately to origin/main. Windows package verification compared 109 source/build files plus both native helpers. Installation copied and hash-verified all 76 package files, preserved the previous app directory, and left the user profile untouched. The ordinary installed window was not relaunched; runtime proof uses owned disposable sessions and UI proof uses the shared production renderer in Electron. Preview remains at port 4319 with the same components and labeled fixtures.

GitHub Actions run 40438536645 did not start its Windows job: GitHub reports failed account payments or an increased spending limit is required. Local test/build/parity/package checks passed; remote CI is not green. Build retains the pre-existing large JavaScript chunk warning.
