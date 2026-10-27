# Remaining feature retry

User authorized retrying unfinished features, shared preview/desktop behavior, and per-feature GitHub pushes. Execute inline against the existing preview checkout.

1. Audit earlier delivery claims against current code; distinguish unfinished features from experiments and historical blockers.
2. Retry page fetching, native input, and child follow-up in isolated owned sessions. No interaction with the user's running chat.
3. Enable verified native web tools only on explicitly Full-access exec connections. Verify sandbox defaults, cancellation and capability reporting; run real production-adapter fetch and search; commit/push.
4. Add native question presentation and exact-request answer/cancel handling. Preserve pending work attribution, reject stale/malformed responses, never infer an answer, retain unknown outcomes, and keep preview fixtures shared. Test native completion and UI parity; commit/push.
5. Reconcile the remaining inventory, including native child limitations, concurrent requests/reconnect, semantic/dynamic tools, native voice, and comparative evaluations. Record current evidence and reasons without claiming deferred experiments are implemented.
6. Full tests/build, review, package verification, and GitHub sync. Do not interrupt the open desktop session to install without the user's go-ahead.

Initial retry: page fetch completed under Full access with native tool events and confirmed cleanup. Native input answered and settled successfully. Generated workflow child follow-up still rejected with `subagent_state_ineligible`; message delivery still changed its response. Source and machine-specific probe receipts remain under ignored artifacts/roadmap-revalidation and artifacts/native-children-followup-retry.json.

Web ruling: explicit per-tool config attempted to isolate fetch but withheld it in the installed host. Removed only the existing disable-web flag for Full access, then independently verified native fetch (Example Domain, HTTP 200) and search (official Python download URL), including native tool result receipts and confirmed shutdown. No global CLI settings changed. Keep CLI defaults and limits rather than unsupported per-tool assumptions.

Native questions delivered: shared choice/multiple-choice/free-text UI, decline and engagement notifications, exact session/turn/request/revision binding, one-attempt commands, unknown-outcome retention, and confirmed answer persistence in chat history. Requests arriving before turn admission are buffered; unseen settlements prevent stale redisplay. Concurrent pending requests still fail closed. Preview includes `/preview-question` for inspection. A real production-adapter run answered and completed with confirmed shutdown; one repeat could not send after connection, then the next isolated retry completed. Do not represent host startup as infallible.

Verification: 750 automated tests passed, TypeScript/Vite build passed; independent review found no remaining material issues after timing and history fixes. Live evidence: ignored `artifacts/roadmap-revalidation/question-production.json`; full tests: `artifacts/remaining-retry-full-tests.txt`.
