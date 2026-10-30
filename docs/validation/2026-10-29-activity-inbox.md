# Persistent Activity inbox validation

Source base: `86479b3f12f84f2b9081e7056f2b4d2e8870c9fc`. CX01 adds a compact Recent view beside Running in the existing Code Activity menu. Observed completions, questions/approvals, uncertain runs and check results have exact owning-chat links and read/unread controls. Local metadata survives restart and is limited to 200 events / 30 days; it contains no transcript, prompt, question or tool-output copies.

## Verification

- Store regression began RED with the missing store. Controller regression began RED on missing inbox output. The component fixture began RED on the missing Recent control. A malformed array-shaped read action also reproduced RED before its validator correction.
- `node --test test/activity-inbox.test.mjs test/work-activity.test.mjs`: **25 passed**. Covers duplicates, distinct input/approval identity, source/event atomic rollback, persistence, bounded retention, exact read IDs, unknown/foreign-turn completion rejection, background owners, checks, deletion and migration without backfill. OS notification delivery does not create completion history.
- `npm test`: **1,468 passed, 0 failed, 1 skipped**. The skip is the existing optional native replay whose retained capture is absent in this managed worktree; it is not provider acceptance.
- `npm run build`: passed. Existing large-bundle advisory remains.
- `npm run test:work-activity`: **12 checks passed in Chromium and 12 in Electron**. Existing running-work stop identity, focus and draft behavior passed alongside read/unread controls, captured-ID bulk marking, arrivals during the operation, failed navigation staying unread and exact-chat navigation followed by read marking. Narrow layout and reduced motion passed; screenshots inspected.
- `npm run test:browser-preview`: passed. `npm run test:chat-navigation`: all sidebar/reader component and drag checks passed, retaining C08 navigation isolation.
- `git diff --check`: passed.

Independent whole-feature review identified two P2 missing-event cases: simultaneous pending requests and temporary storage failure after terminal ownership cleared. Both reproduced RED, then passed after a single correction pass. Concurrent batch rollback and selected/background write recovery also pass. Failed observations keep their original timestamps in a bounded 200-entry memory buffer and retry before later task writes; process loss during a storage outage cannot preserve that buffer. No review findings remain unresolved. The shared component fixtures use synthetic activity; preview samples are fictional. No paid model request, real native question, OS notification preference change or account/billing/security change was made. Actual published/installed acceptance is a separate gate. Version 0.2.180 was installed before this feature; its [receipt](2026-10-29-desktop-0.2.180.md) does not prove the new inbox is installed.

Retained local evidence: `.superpowers/sdd/2026-10-29-activity-inbox/`, `artifacts/work-activity/preview-LgONRL`, `artifacts/work-activity/desktop-oalp5w`, and the referenced browser/navigation artifact directories. These fixtures are separate from the user's profile.
