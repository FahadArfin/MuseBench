# SDD ledger — plan: docs/superpowers/plans/2026-10-30-code-chat-relations.md

Base: fcf1bf2e93b230bf52d064fd0adaa5ede4045398. Branch: codex/code-chat-relations. Worktree created with native Codex tool; all prior worktrees/evidence retained.

Authorization: user requested Code forks/side chats and selected fresh context linked to main. Standing implementation/delegation/push/update authorization persists. This implements that concrete behavior; compact UI details are routine implementation choices, not a new permission or account change.

Ruling: use fresh independent session plus app parent relation for side chats — pinned native sideChat inherits context and has null root — using it would violate the explicit user choice.
Ruling: retain labeled saved-conversation fallback for exec/manual chats — no verified native fork on exec — history is bounded and is not represented as complete native state.
Ruling: keep all .superpowers and failed receipts — explicit evidence-preservation instruction overrides skill cleanup — retained disk use is acceptable.

Preflight:
| Tasks | Shared interface/consistency | Result |
|---|---|---|
| 1 → 2 | Explicit taskId actions and persisted chatRelation feed sidebar/current-chat/menu and preview | Consistent; Task 2 receives concrete exported signatures in report. |
| 1 | Native fork once-only and confirmed release, fresh side separate; no model on creation; existing exec prefix compatibility | Consistent; reject native failure without copy fallback. |
| 2 | Compact UI and preview use same relation shape; orphan visibility and memo dependency verified by behavior tests | Consistent; no additional persistent parent pointer or duplicate sidebar storage. |

Research: main artifacts/code-chat-relations-research/report.json and probe.mjs. Real pinned Muse 1.4.14 hash 20d18c426cc26e9e4b3cc07008ec07ec97e12e466a2be8cd2797b2e0e2018382. Native fork/all/cut, side inheritance, confirmed fork leave + separate-host resume, parent/sibling independence; 7 scripted turns, 22 loopback requests, zero inference, both hosts cleaned. Native side cannot fulfill chosen fresh behavior.
Baseline: main exact base focused harness-gaps + exec-controller: 87 passed, zero failed. Worktree npm ci succeeded. Main tracked tree was clean; installed desktop 0.2.250 idle, native Code unavailable, no personal data changed.

Tasks: 1 complete; 2 pending. No paid/native provider inference authorized.

Task 1 initial independent review: /root/code_relations_domain_review, Sol/high, Needs fixes. One P2: relationParent traverses fork provenance beyond an independent main, so side S -> fork F -> missing/archived/moved original P loses S -> F and new sides become nested under S. Root verified against helper and spec; fix round 1/5 assigned to original implementer, with targeted relationship/controller regressions. No other findings. Root independently checked full1953pass/1skip and final native7cases/28loopbackrequests/zeroinference/bothcleanupconfirmed evidence.

Task 1 fix round 1 submitted: 3525f13..32e4a49, seven RED regressions, GREEN104pass. Scoped re-review /root/code_relations_domain_rereview pending. No native change in fix; full suite appropriately deferred to final UI verification.

Task 1 fix round 1/5: 1 addressed, 0 open — fork provenance boundary corrected, commits3525f13..32e4a49. Independent scoped re-review confirms direct backlink/side-cycle protection and real controller deleted/archived/moved regression coverage; no new breakage or deferred observations. Task 1 gate complete at32e4a493233ad0d47d45ce04f7081465c125747c.

Task 2 dispatched /root/code_relations_ui Sol/high at32e4a49. Owns UI, preview, projection/slash tests, shared browser/Electron smoke, CI wiring and validation doc. No concurrent product implementation. Root prepares only ignored delivery helpers at artifacts/desktop-update-code-chat-relations. Baseline native preflight sees installed0.2.250 responsive, two saved Code chats, no active Code/Work/Sites/blockers; installation will recheck exact latest source and idle state. Delivery preflight now checks unresolved fork receipts in both durable task rows and app snapshot to avoid a crash-stale selection hiding ownership uncertainty. Private native config stays ignored and is never printed/staged.

Task 2 implementation head6675fdc07c6cc79f855e4d7e3d58dac4a6fe441e. Root read full1964pass/1skip/0fail evidence, browser12/Electron11 reports, final organization16 and build success. Root visual check caught left clipping from nested grid min-content widths; implementer reproduced RED, fixed minmax/min-width, added bounding checks. Final current-menu, fork backlink and430px screenshots inspected and legible. Task-scoped review /root/code_relations_ui_review pending. Named extra review risk: repeated all-task maps in side projection could regress large-chat performance; benchmark if code warrants it.

Task 2 initial review Needs fixes: synthetic unsent request in fork-of-side DOM, and measured synchronous projection lag (3000direct191ms; legacychain3001227ms). Root confirmed rendering condition and helper call contract. Fix round1/5 original implementer will address these two Important findings together. Task 2 minor (deferred): legacy Back to main chat goes to immediate side while list flattens to final main; final reviewer to triage unless corrected naturally by indexed projection work. No other findings.

Task 2 fix round1/5: 2 Important addressed plus deferred minor addressed, 1 new Important open — blanket related-history rendering hides genuine manual original requests stored only in task.request. Commits6675fdc..32b72c3. New index benchmark3000direct6.82ms/chain3.96ms,35998fieldreads each; root directly read receipts. Original worker owns round2 for precise genuine-request identity, preserving fork-of-side and unsent-prompt behavior. Final integration build/fulltest running at32b72c3, results will be labeled to that revision.

Task 1 dispatched: /root/code_relations_domain, Sol/high, base 5540c37ec8bb00cdb6e579d4b14785f386e8c0c0. Requirements task-1-brief.md; report task-1-report.md. Native research /root/code_fork_research complete; full handoff proof recorded. No product edits by root while implementer owns domain.


Ruling: unresolved native fork/release receipts block another native fork on that source until ownership is independently reconciled; no speculative retry/dismiss UI — exact returned IDs and reasons remain visible — rare ambiguous outcomes may require native inspection. Known rejection must not be mistaken for uncertainty. Fresh side and ordinary parent use remain available when normal idle/ownership rules permit.
Task 1 regression evidence so far: 258 focused regressions + 9 native-controller tests passing; product native contract exposed sole-listener replacement in SDK, implementer correcting multiplexing and preserving failed receipts. Do not claim native product proof from preliminary research alone.

Root integration checkpoint at 32b72c3177e38fde48e405c5b22b9ad46b960f6d: npm.cmd run build passed; npm.cmd test 1,968 pass, one existing skip, zero fail, 1,969 total. Evidence final-integration-build.txt and final-integration-tests.txt. This precedes round2 and is not claimed as exact latest proof after a further code change. Main/origin reconfirmed fcf1bf2; local main clean. Task2 original worker resumed for round2 genuine manual-prompt regression.

Task2 fix round2/5 complete at9558a9f: sole Important manual-prompt regression addressed, no new breakage or outside observations. Independent scoped review confirms requestOrigin persistence/legacy bounds, source-independent initial prompts and selected-user unsent draft. All task gates complete; whole-feature final review next. Native protocol and composition unchanged in this fix. Root full build/test at9558a9f currently running.

Task gates complete: root visually inspected current-menu.png and desktop.png from ui-desktop-pkIGXv after round2; compact labels/nesting/backlink remain legible. Final integration at9558a9f exited0 build and tests1974pass/1skip/0fail;8aa6e00 adds documentation only. Whole-feature reviewer /root/code_relations_final_review Astra/high dispatched read-only for fcf1bf2..8aa6e00, source-only diff includes electron/security and excludes only logs/screenshots. No unfinished task-level findings or minors.

Final review Needs fixes: late native child-ID receipt lost after source replacement by pin/move (P2), and explicit side-group collapse reopened by unrelated task snapshots (P3). Root accepts exact reproduction and source evidence; original domain worker owns ONE consolidated fix wave from8aa6e00. Provider acceptance remains excluded, release/installation remain later gates. Preserve all receipts; no paid calls.

Final ONE fix wave7541c9f independently cleared by /root/code_relations_final_rereview: Important receipt race and Minor collapse both addressed, no new breakage or outside observations. Root inspected focused286pass/build-success output; final full suite running. Existing user authorization selects main merge+push and verified install without another menu; finishing skill applied within that authority. Preserve this worktree/evidence under prior preservation ruling.

Root final integration at7541c9f: npm.cmd test exit0,1977pass/1skip/0fail,1978total57.413s. Full build at same source previously passed. No product changes after this proof. Main clean onfcf1bf2 and remote exactfcf1bf2. Final docs/review receipt commit then fast-forward merge and push; CI and installed proof remain separate.
