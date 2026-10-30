# Preview annotations implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Turn a selected Code preview element and comment into editable, unsent, owner-bound feedback.
**Architecture:** Fixed bounded DOM capture, shared ephemeral selection service, thin Electron/browser adapters, shared React preview component and existing durable draft append.
**Tech Stack:** Existing Electron, React/TypeScript, Node tests and Playwright.
**Spec:** docs/superpowers/specs/2026-10-30-preview-annotations-design.md

## Global constraints

- Native Muse backend and current iframe sandbox/IPC trust remain intact; no paid model calls or new grants.
- Current Code owner + loopback preview only; one selection, ten-minute TTL; 500 nodes / 600 text / 160 title / 4,000 note / 16,000 total draft characters.
- No form values/storage/cookies/full HTML; page text is untrusted data. Only fixed capture code in the frame.
- Navigation, owner changes and content/geometry changes invalidate. Late work cannot update another chat.
- Shared desktop/browser component; test fixtures and installed/provider proof remain distinct.
- Preserve evidence and complete profile. One feature push, exact-source green release before installation.

## Review focus

1. Selection races with page/chat changes or another click: stale results cannot become a usable token (Task 1 unit, Task 2 UI).
2. Hidden/editable/input content and hostile markup: visible bounded evidence only, no evaluation or executable links (Task 1 DOM/Task 2 UI).
3. Removed/replaced/scrolled target, same-URL reload or SPA navigation: invalidate before draft staging (Task 1 service and real Electron).
4. Existing draft near capacity, attachments and plan mode: preserve all on failure/success (Task 2 UI).
5. Keyboard-only, narrow viewport and reduced motion: usable selection/cancel/edit without accidental site action (Task 2 browser/Electron).

### Task 1: Bounded preview capture and owned selection service

Files: create src/shared/preview-annotations.mjs + .d.mts, src/shared/preview-target.mjs + .d.mts, electron/preview-annotations.mjs; test/preview-annotations.test.mjs; scripts/preview-annotations-smoke.mjs.

Interfaces:
- createPreviewAnnotations({resolve,read,onInvalidate,now?,token?}) provides inspect(input), feedback({token,note}), discard(token), invalidate().
- resolve({projectId,taskId,frameName}) returns current owner/frame key, exact URL and generation or throws; read(context, {x,y}|{selector}) executes only capturePreviewTarget(document, request).
- inspect accepts projectId/taskId/frameName/x/y, yields a token, owner, sanitized page URL and bounded target. feedback revalidates and yields {text}.
- createDesktopPreviewAnnotations({contents,getState,onInvalidate}) wraps the service and Electron navigation listeners; close removes listeners.

- [x] Write meaningful tests for valid evidence and untrusted formatting, strict input bounds, owner/frame/URL eligibility, expiration, invalidation, concurrent and late reads, changed target, timeout and discarded tokens; observe failures.
- [x] Implement minimal bounded validators/service and fixed DOM capture. Test real DOM privacy/geometry/visibility in Chromium.
- [x] Implement the Electron adapter with direct-child frame resolution and navigation invalidation. Exercise real cross-origin frame capture with no page bridge.
- [x] Run focused suites, preserve evidence and ledger Task 1.

### Task 2: Shared selection UI, wiring and delivery

Files: src/ui/ProjectPreview.tsx + preview-annotations.css; WorkspacePanels.tsx/App.tsx; shared/types.ts; electron/main.mjs/preload.cjs; src/preview/bridge.ts + preview-annotations.ts; demo public preview HTML; package scripts/CI group; docs/validation + roadmap.

Interfaces:
- Bridge inspectPreviewTarget, preparePreviewFeedback, discardPreviewTarget, onPreviewInvalidated.
- ProjectPreview receives current owner, URL, onDraft(targetKey,text); owns overlay, pending/error/note, key and navigation invalidation. App delegates exact key to appendDraftText.
- Browser adapter uses same service/capture against only the registered sample; real desktop adapter controls only owned local frame.

- [x] Add failing production UI scenarios: pointer/keyboard capture, no site activation, editable note, draft metadata preservation, capacity rejection, cancellation/navigation/late result; no dispatch or model calls.
- [x] Implement shared UI and wiring, test desktop/browser parity and responsive/reduced-motion layouts.
- [x] Exercise production shell and real local tutorial preview in isolated Electron; build/typecheck and full unit suite once final source settles.
- [x] Carry desktop192 acceptance forward, write guide/validation, update CX05 evidence.
- [x] Commit feature; one fresh independent final review over immutable base..HEAD, fix material findings with failing regression and full verification. Preserve review/ledger.
- [ ] Recheck exact main, merge/push authorized feature, await all release checks, verify exact published installer hashes, idle preflight, full profile backup, graceful install/reopen/native version and controls. Keep provider proof distinct.
