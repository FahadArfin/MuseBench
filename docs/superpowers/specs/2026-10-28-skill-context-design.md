# Skill context inspector

Continue the approved harness roadmap's native skill-cost and diagnostics recommendation. The CLI already reports per-skill `context_cost` and catalog/skill diagnostics; Customize currently drops both. Preserve these bounded observations and show them in the shared installed-skills view.

- Add one compact, collapsible catalog summary and per-skill context details. Keep discovery uncluttered. Searching or selecting one installed skill must not change the catalog-wide total.
- Sum only native-reported startup estimates. Missing, malformed or omitted observations mean a partial/unavailable estimate, never zero. Do not derive costs from activation or describe them as billing or current-session occupancy. Native catalog compression and runtime trust can change the actual prompt.
- Retain startup/invocation byte and estimated-token fields, plus bounded plain-text loader diagnostics. Do not fetch bodies, execute skills, change trust or make model calls to inspect metadata.
- Use the existing refresh/activation path so refreshed estimates replace old values. Keep preview simulated and desktop native. Preserve the current extension review and activity gates.

Evidence: official skills guide documents `skills list --json` context costs, lazy loading, activation and catalog compression: https://meta-models.github.io/muse-code-sdk/next/guides/extend/skills/. A read-only local 1.4.14 inventory returned 27 rows with 4,617 reported startup tokens and no diagnostics. This is a catalog observation, not native inference or token-saving proof.

Acceptance: normalization/coverage/overflow tests, real Customize service integration, shared preview and production Electron UI checks for totals, filtering, diagnostics, activation refresh and narrow layout; build/full tests; exact-head CI/release and desktop synchronization.
