# Default request budget

New Code requests now select Extended: 15 minutes or 32 model steps. The previous implicit Standard limit, three minutes or eight steps, can stop ordinary implementation and research before verification. Extended already exists as a bounded product preset; using it as the default avoids inventing another setting or removing the short option. Deep remains an explicit 45-minute / 96-step choice. This is a product default, not a measured guarantee that a task will finish within that time.

Explicit saved Standard, Extended and Deep choices retain their values. Valid legacy options without a budget keep their saved object shape, selected model, reasoning and approval choices. Their missing budget resolves to Extended in the composer and in the exec runtime's default limits. No persisted run receipt, active process, deadline or timer is migrated. Each new native request captures its own limits; changing a future default cannot extend an already running request.

The composer labels model steps explicitly and explains that elapsed execution time includes tool work and waiting. A model-step ceiling is separate from tool-call counts and token spending. The selected time or model-step limit stops the request when either is reached; cancellation still requires native process cleanup. Interactive MSP sessions do not implement these exec ceilings, so their composer displays that limitation and disables the budget selector.

Local checks for the shared-options/composer change:

- Test-first budget assertions failed against the previous default, then all four `node --test test/run-options.test.mjs` tests passed. Coverage includes new defaults, legacy omission, unchanged explicit presets, malformed budgets and immutable preset lookup.
- `npx.cmd tsc --noEmit` passed after the composer changes.
- The related options, exec/controller, schedules, workflows and Sites generator selection ran 51 tests: 50 passed, with one expected Sites generator assertion requiring the new default budget field. The parent release task owns updating that integration expectation and the exec fallback limits, then runs the release candidate checks.

These checks use local fixture runtimes. They do not prove paid-account completion quality, interactive budget support or a published artifact.

Final integration: the exec fallback is now 15 minutes / 32 steps. Explicit runtime limits in fixtures remain authoritative when no request preset was supplied. The Sites generator expectation is updated and its 17 tests pass. All 186 final targeted runtime/event/controller/planning/web/budget/capability tests pass. The real Electron composer flow verifies Extended default selection, an explicit Standard change, draft preservation, and disabled MSP budget/Plan controls. Final required release preflight builds/types and all six checks pass with stable source evidence.
