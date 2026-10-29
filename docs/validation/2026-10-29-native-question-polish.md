# Native question polish validation

29 October 2026. Roadmap C01, baseline `35be5697276183171153d322a53b84b62b863524`.

Questions and options now display safe Markdown, offer an explicit custom answer, and support Ctrl/Command+Enter with composition protection. Original option labels and native response identities are unchanged. Immediate submission guards prevent duplicate answers/cancellations. Explicit rejection unlocks; missing or thrown acknowledgments remain unknown and locked.

## Source evidence

- `npm run test:native-question`: 9 checks passed in Chromium and 9 in production Electron. Same-tick answer/answer/cancel dispatch sends once; links do not choose options, remote images/raw HTML do not execute, plain Enter and IME do not submit, revisions reset, rejection unlocks, unknown outcomes retain the lock, narrow layout fits.
- `node --test test/user-input.test.mjs`: 2 protocol tests passed.
- `npm test`: 1,390 tests passed, zero failures.
- `npm run build`: passed. Existing bundle-size advisory remains.
- `npm run test:preview-parity`: passed, including custom native answers and existing multi-question/rejection scenes. Shared geometry and styles match within 1px.
- Independent fresh review: no critical/important findings. Its minor same-tick regression-test gap was addressed and both component modes rerun successfully. The reviewer also checked keyboard link activation, null acknowledgments and accessible groups.

Ignored receipts are under `artifacts/changelog-roadmap-2026-10-29`, `artifacts/native-question-ui/preview-DFvgxs` and `artifacts/native-question-ui/desktop-zBYkGs`.

## Scope

These are source, protocol and renderer checks. No additional provider/model request was made. Native transport behavior was preserved, not newly claimed from fixtures. Published installer identity and installed acceptance are pending the release produced by this feature commit.
