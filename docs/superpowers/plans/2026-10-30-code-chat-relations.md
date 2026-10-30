# Code chat relationships implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make native forks and linked fresh side chats discoverable and persistent in Muse Code.

**Architecture:** Controller-owned chat relations bind source actions and isolate child state. Interactive runtime forks use native completed-turn history and confirmed ownership release; exec/manual copies retain their existing bounded history with explicit provenance. Shared React UI renders the same compact controls in preview and desktop.

**Tech Stack:** Existing Electron 45, React 19, TypeScript/Node, SQLite, Muse SDK 1.4.14 and Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-30-code-chat-relations-design.md`.

## Global Constraints

- Side chats start with fresh conversation context and stay linked to the main chat. Forks carry prior context and evolve independently.
- Creation sends no model request and changes no project files. No automatic worktree creation.
- Preserve `forkedFrom` and saved native identifiers; never copy active work, goal drivers, usage, tool leases or private credentials.
- Native commands execute once; only a matching `session/leaveCompleted` outcome `released` admits independent fork restoration. Unknown outcomes remain explicit and are not retried automatically.
- No paid/provider model requests, personal account changes, or active-app mutations during fixtures. Use disposable profiles and scripted loopback responses with cleanup.
- Browser and desktop share product UI. Keep controls compact, accessible, blue-accented and reduced-motion-aware.
- Preserve all evidence and `.superpowers` artifacts. Commit locally per task; root handles push/release/install once the feature passes review.

## Review Focus

1. A stale menu callback must not fork or attach to the newly selected chat; test explicit source binding in Task 1 and rendered switching in Task 2.
2. Native fork admission or release can become uncertain; test no duplicate fork/retry, no child turn and retained recovery information in Task 1.
3. Parent archive/delete/move and legacy invalid relations must leave children visible and independently usable; test restoration in Task 1 and list projection in Task 2.
4. Parent drafts, queues, goals and gateway leases can leak into children; test independent initial state and existing tool-review requirements in Task 1.
5. Sidebar memoization, collapse, drag and narrow keyboard menus can conceal new children or route to wrong parents; test actual shared controls in Task 2.

### Task 1: Independent sessions and persistent relationships

**Files:**
- Create `src/shared/chat-relations.mjs` and `.d.mts` for bounded relation validation and projections; `src/runtime/session-fork.mjs` if needed for the focused once-only native fork/release operation.
- Modify `src/controller/index.mjs`, `src/runtime/index.mjs`, `src/runtime/selector.mjs`, `src/shared/types.ts` and narrowly related lifecycle helpers.
- Add `test/chat-relations.test.mjs`, `test/native-session-fork.test.mjs`, and `scripts/native-session-fork-contract.mjs`; extend existing controller/exec tests only where behavior changes.

**Interfaces:**
- Consumes controller task records, native connection, native message/run mapping and existing exact session restoration.
- Produces `Action {type:'createSideChat';taskId:string;text?:string}` and expanded `{type:'forkTask';taskId?:string;messageId?:string}` (old selected-chat/message action remains supported). `taskId` selects the exact source; missing/archived/unusable sources fail before changing selection or creating a child.
- Produces persisted/summarized `chatRelation` exactly as defined by the spec, plus legacy `forkedFrom` for forks. Report exported helper signatures for UI use.
- Produces runtime `forkSession({sessionId:string,lastTurnId?:string})` with distinct verified native session and confirmed release result, or explicit rejected/unknown recovery information. Expose capability/status needed by controller without inventing provider support. Report exact receipt shape.

- [ ] Write and run RED tests: side creation has zero parent context/queue/usage/driver/native identity, preserves parent draft, creates no send; side-from-side resolves main; restart retains relations and orphan children; exact source failures leave state unchanged; retained fork preserves only chosen prefix and context markers; native fork validates provenance/root/permissions/completed cut, waits for matching release, blocks active source, records uncertainty, never silently copies after native failure.
- [ ] Implement helpers, runtime and controller actions. Keep changes localized; normal permission/tool review remains authoritative when reconnecting a native fork. Do not use native `session/sideChat` for fresh sides. For eligible MSP forks require a verified idle source; reconnect through the existing route, never silently change transport/access. Use retained-copy mode only where no verified native fork applies, with relation context `retained` and accurate system receipt.
- [ ] Adapt the disposable probe at main checkout `artifacts/code-chat-relations-research/probe.mjs` into a reproducible bounded contract that exercises the product fork operation and independent resume; prove fresh session requests exclude parent markers. Save command/evidence receipts under `artifacts/code-chat-relations/`. No personal credentials or model inference.
- [ ] Run focused new tests plus `test/harness-gaps.test.mjs`, `test/exec-controller.test.mjs`, `test/native-session.test.mjs`, runtime/selector regressions, and relevant discovery ownership tests. Run `npm.cmd test` once before commit. Record exact commands, counts and limitations.
- [ ] Self-review and commit the domain implementation. Write report in the assigned SDD report file; no push or worker subagents.

### Task 2: Compact chat controls, nesting and preview parity

**Files:**
- Modify `src/ui/App.tsx`, `src/ui/useChatActions.tsx`, `src/ui/ChatSidebar.tsx`, `src/ui/ResponseActions.tsx`, `src/ui/CommandDialog.tsx`, `src/shared/slash-commands.mjs`, `src/shared/sidebar-model.mjs`, `src/preview/bridge.ts`, `src/ui/chat-sidebar.css`.
- Create focused `src/ui/ChatRelations.tsx` and style file only if the topbar/relation controls need a separate component.
- Add `scripts/code-chat-relations-smoke.mjs`, wire browser/Electron test into existing chat CI group/package scripts; add projection/command tests and focused updates to existing action-label assertions.
- Add `docs/validation/2026-10-30-code-chat-relations.md` with commands, outcomes and native/fixture distinctions.

**Interfaces:**
- Consumes Task 1 actions and `TaskSummary.chatRelation`. All source callbacks carry task ID. Preview has the same relations and independent state, labeled as sample behavior.
- Produces Code options **Fork chat**, **New side chat**, reply **Fork from here**, current-chat compact menu, parent backlink and project-list side nesting with accessible collapse. `/fork` and alias `/branch` invoke a fork; `/side` creates fresh linked draft, optional side question unsent.

- [ ] Write/run failing behavior checks for shared controls: fork/side availability, no implicit send, fresh side vs copied fork, parent navigation, separate drafts, collapse/reopen, side sibling creation, unavailable-parent visibility, exact-source switching, keyboard/narrow/reduced-motion, and unchanged chat organization/drag behavior.
- [ ] Implement compact controls using existing menu/disclosure and motion conventions. Side chats appear once within project nesting; pinned/recents/search remain independently accessible. Parent deletion/archive/move promotes children when necessary; no silent disappearance. Ensure memo projection compares relationship fields. Use short context descriptions, including **Saved conversation** for retained forks.
- [ ] Update preview actions to construct clean independent tasks (do not structured-clone native runtime/usage/goals into children). Use shared relation helpers. Preserve browser draft behavior and no model calls.
- [ ] Run browser and Electron relation smoke, existing chat organization/navigation/responsiveness/response tests, full `npm.cmd test`, and `npm.cmd run build`. Inspect resulting screenshots at desktop and narrow widths. Fix only relevant regressions.
- [ ] Write validation evidence, self-review and commit. Root performs independent final review, CI/publish, verified installer/profile-preserving update and installed control inspection.
