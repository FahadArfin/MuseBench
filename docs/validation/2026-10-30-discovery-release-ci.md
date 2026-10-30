# Hosted discovery release checks

Release run [41113670173](https://github.com/FahadArfin/MuseBench/actions/runs/41113670173), source `506ebef27d2968cced5b94c35e2c4916c29ff6fb`, did not publish version 0.2.237. Windows packaging passed in 2 minutes 55 seconds. The chats, extensions, navigation and native validation groups passed; appearance and unit validation failed. The installed desktop remained 0.2.230.

The failures exposed test-harness assumptions. No product behavior, dependency, production timeout or approval policy changed in these corrections. Original failure logs and controlled reproductions are retained separately from subsequent passing results.

## Launch animation

The cold-font scenario used absolute request delays but required animation even when the real font could arrive outside the app's existing 400 ms readiness allowance. The original CI run recorded preparing/settled frames without font timing; its exact scheduling is unproven. A controlled real-font delay reproduced the same motion assertion failure.

Reviewed correction `8cecd7eca56eeb65a56d6f2c9cf5803394f98a6e` gates the actual font response relative to readiness: 100 ms for normal motion, with all original typing, cursor, flight and landing assertions; 650 ms for a separate usable fallback check. It preserves native font results, real clocks, the 400 ms allowance and 2100 ms overall watchdog. The fallback must release usable controls, show the settled title and never replay when the font eventually arrives. No retry or skip was added. Combined browser/Electron acceptance passed 20 checks; the final browser run passed 16 after the additional preload-order assertion. Independent Sol review approved specification and quality.

## Discovery fixtures

The first gateway test configured a three-second positive startup budget, below the existing production default of 30 seconds. A real delayed protocol fixture reproduced the startup failure with the old budget. Correction `2a2749db7e2d75c56808301c6f1e4d22e4bfc370` uses the production default for positive fixtures, retains explicit 500 ms negative cases, and proves one launch, initialization and invocation after delayed startup.

The uncertainty fixture previously equated assertion-owner exit with whole-tree teardown. A controlled detached Windows child reproduced a live directory holder and `EBUSY` after owner exit. The fixture now uses an independent outer Windows Job receipt and recorded descendant absence before removing its exact temporary root. Inner unconfirmed cleanup still blocks start/send and repeatedly rejects close; the outer test receipt never grants product recovery permission. This demonstrates the harness flaw, not the identity of the original CI file handle.

Focused discovery/Windows Job checks passed 108/108. The subsequent full suite passed 1,801 tests with zero failures and one existing retained-capture skip. Existing Node experimental SQLite/MockTimers warnings remain disclosed. Independent review then identified an unbounded failure-event wait in the fixture. Correction `ea610415bb563989f758d5f674b4204be0c138c0` adds a fixture-only eight-second watchdog, matching the existing Job cleanup bound, and clears it reliably. A deterministic suppressed-event probe now exits nonzero on that watchdog, confirms outer cleanup and proves all three recorded fixture processes gone. All five actual uncertainty paths pass. The full suite was not redundantly repeated for this scoped follow-up; fresh release CI remains required.

Independent scoped re-review accepted the watchdog correction with no new blocking issues. Parent accepted both reviewed test corrections for one combined release attempt.

## Evidence and delivery boundary

Launch reports and hashes are retained in the isolated launch-animation-ci worktree under `.superpowers/sdd/2026-10-30-launch-ci/` and `artifacts/launch-ci-fix/`. Discovery reports, RED/GREEN logs, cleanup probes and hashes are retained in the remote-discovery worktree under `.superpowers/sdd/2026-10-30-discovery-ci/` and `artifacts/discovery-ci/`. Original failed CI receipts remain under `artifacts/desktop-update-remote-discovery/` in the main checkout.

These results establish focused local correction evidence. A new exact-source release must pass all six validation groups and packaging, publish its installer, and pass manifest/hash and idle-profile-preservation checks before installation. They do not establish personal provider authentication or real-model acceptance.
