# Ledger — adapter/PLAN.md

Tasks 1–4 implemented. Compatibility RED: 4 failures from unimplemented guard, then GREEN. Session RED: adapter unimplemented, then full suite 19/19. Review/bridge RED: unimplemented boundaries, then full suite 32/32. Node built-ins and in-process fixtures only.

Task 5 in progress: offline demo and doctor successful; original UI 17/17 regression checks passed from a temporary output directory. Original 3 delivered artifacts verified byte-identical.

Ruling: no trusted Muse executable on PATH, so no version/schema subprocess was run. Cost: live compatibility remains unverified.
Ruling: official recorded transcript handshake differs from the stable manifest; preserve it unchanged and reject startup, then test its events with a separately labeled synthetic descriptor. Cost: these are focused seam tests, not complete upstream conformance.
Ruling: keep original visual UI separate from this adapter. Cost: no live UI experience is delivered.

Fresh read-only review requested under executing-plans/requesting-code-review skills. No git commits or external integration actions.

Final review: fresh read-only reviewer found 3 Important and 3 Minor findings. Fixed all code findings in one RED→GREEN pass: session closure, view gap (including late gaps), subscriber-triggered disconnect before dispatch, conflicting terminals and command-id mint failure. Six regression tests failed for the stated reason, then the full suite passed 38/38. Plan checkboxes updated. No deferred minor findings.

Final Ruling: regraded conflicting terminal outcomes and command-id failure as Important because they could show false completion or leave the session stuck. Cost: stricter unavailability on inconsistent backend behavior.
Final Ruling: live interoperability, sandbox enforcement and process cleanup remain untested; source and fixture tests cannot prove them. No claimed live support.
Final Ruling: runner record authenticity and revision hash acquisition remain responsibilities of a trusted controller; this object is not a security boundary. Cost: exposing it to agent/renderer input would invalidate its evidence guarantees.
Final Ruling: runtime completion is a session-state gate, not revision evidence. Current preview and passing runner results must match the revision; changing revision invalidates those and acceptance. Cost: callers must compute genuine revision identities and connect runtime events correctly.
Final Ruling: preservation confirmed independently by comparing all three original artifact hashes; original UI regression 17/17 passed with output isolated in /tmp.

Task 5 complete: demo, doctor, matrix, home steps and package prepared. No git operations, installs, authentication changes, native execution or model calls.
