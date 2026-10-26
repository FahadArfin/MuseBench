# Native Muse sidebar review

Reviewed the main-process catalog/controller/policy, bounded DOM reader, native UI integration, retained views, and presentation adapter on 2026-10-25.

Resolved blockers: chat switching without thread-page navigation controls; independent retained drafts; popup and retained-page authentication invalidation; delayed old-document reads and commits; stale collection selection; closed idea preview reopening; and Ctrl+K/N forwarding from remote composition.

Final independent review passed 60 focused controller/catalog/library/policy tests and reproduced the delayed old Ideas reload case successfully: a fresh generation-owned reload is required before publication. A subsequent narrow review of bounded Settings-tab selection found no blockers; presentation tests passed 3/3. No reviewer accessed credentials or changed the live account.

Final packaging and saved-session evidence are in VALIDATION.md. Remaining limits are the bounded rendered-item catalog and fixture-only populated saved-chat/goal cases for this currently empty account. The main content and approvals remain official Muse UI.
