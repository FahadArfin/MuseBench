# OAuth save-race test synchronization — 30 October 2026

CI run `41147637571` exposed a pre-existing test timing assumption in `test/discovery-oauth-service.test.mjs`: the after-commit binding assertion ran after a fixed 40 ms delay, although the controlled store save could still be pending. A fresh disposable loopback probe using a 120 ms awaited save reproduced `0 !== 1`. This is a test synchronization correction; production OAuth behavior is unchanged.

The same four security cases remain: invalid snapshot, throwing snapshot, thenable snapshot, and owner cancellation after a completed commit. Each has a 10-second failure bound. The test now waits for save entry, holds it behind an explicit gate for 60 ms, verifies no binding or settlement while held, releases the gate, and awaits the controlled commit's actual settlement before the original binding-count and not-ready assertions. The 60 ms delay proves elapsed time cannot substitute for completion; it is not used to decide completion. Cleanup releases the gate before closing the fixture.

Fresh validation:

- RED: `node --test artifacts/research/oauth-slow-save-probe.mjs` — reproduced the original after-commit `0 !== 1` failure. Retained output: `.superpowers/sdd/2026-10-30-codex-source-adaptations/ci-oauth-red.txt`.
- GREEN: `node --test test/discovery-oauth-service.test.mjs test/discovery-oauth-store.test.mjs` — 82 passed, no failures/skips, 2.5 seconds.
- Missing-wait mutation probe: a disposable copy of the corrected test with only `await settled.promise` removed failed all four security subtests with `false !== true` at the settlement assertion. It therefore cannot prematurely accept a merely released pending commit. Retained probe/output: `artifacts/research/oauth-no-settlement-probe.mjs` and `.superpowers/sdd/2026-10-30-codex-source-adaptations/ci-oauth-no-settlement-probe.txt`.

The passing service/store output is retained as `ci-oauth-green.txt` in the same SDD folder. The full suite was not repeated for this test-only correction. No inference, provider/personal account/profile change, push or installation was performed. These fixture checks do not establish live-provider or release acceptance.
