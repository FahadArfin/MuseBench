# Named models and safe catalog loading

The composer and effort card previously rendered the literal “Default” whenever no explicit model override was saved, even when Muse had supplied its default model's name. Model discovery also required a manual refresh and could connect a chat as a side effect.

The compact picker now shows the named catalog default. “Automatic” remains a separate list choice that removes the override without changing the user's billing source. Before discovery, the chip says “Choose model.” Opening the picker loads missing choices once, waits for active work to finish, and exposes manual retry after failure. Empty catalogs do not cause a retry loop. Missing saved models remain unavailable rather than silently substituting another model.

When disconnected, discovery uses a short-lived native host with `initialize` and sessionless `model/list`, followed by shutdown. It uses the selected Code billing credentials without opening a session, sending a prompt, registering tools, or changing permissions. The controller deduplicates concurrent refreshes, scopes transient results to the binary and workspace, and invalidates them when billing connections reset. An already verified idle connection uses its current read-only model query without reconnecting, and its live catalog takes precedence. Catalogs are not saved as durable account entitlements. Unconfirmed host cleanup blocks further work until resolved.

Provider names are retained. When Muse returns an identifier as its label, known Spark/Wonder identifiers are formatted for readability while the exact request ID stays unchanged. Contributor variants stay distinct. Catalog provenance and the plan/API access qualification are visible in the list. The actual model accepted for a running request still requires native runtime evidence.

## Source and live discovery evidence

Checked 31 October 2026:

- [Meta's model reference](https://dev.meta.ai/docs/models): Spark 1.1 is API-only, while Spark 1.2/1.3 and Wonder 1.0 are available in Muse Code. Wonder Full is limited to qualifying Code plans. API availability alone does not make a model selectable by the Code harness.
- [Muse Code subscriptions](https://dev.meta.ai/docs/muse-code/subscriptions): subscription credentials and separately created API keys have different billing. MuseBench therefore uses its selected credential source for discovery rather than inferring access from prices.
- A read-only query of the installed Muse 1.4.14 CLI, using its existing stored credentials, returned a `providerCatalog`: `muse-wonder-1.0`, `muse-spark-1.3`, `muse-spark-1.3-contributor` (default), `muse-spark-1.2`, and `muse-spark-1.2-contributor`. No session or generation request was sent. This proves catalog discovery, not subscription entitlement or model-run acceptance. No Spark 1.1 or Wonder Full choice was fabricated.

## Verification

- The named-default regression failed against the old UI: expected “Wonderful” from the fixture catalog, received “Default.” Native identifier-label normalization also failed before its correction.
- Browser and Electron model-picker fixtures pass 19 checks each: named default, exact request IDs, Contributor distinction, Automatic reset, unsupported effort fallback, running-work locks, missing models, narrow layouts, keyboard selection/focus recovery, one-shot discovery, errors/retry, empty catalogs, and draft preservation.
- Live catalog discovery used no paid generation. UI fixtures prove presentation and interaction only.

- Final full unit suite: 2,121 passed, zero failures, one optional skip. Production build passed; its existing bundle-size warning remains.
- Full browser-preview smoke passed with no external requests or page errors. Desktop/preview parity passed all 100 comparisons.
- Independent review identified an untyped cleanup failure from the credential account probe. The correction adds bounded account cleanup and propagates its failure into the catalog blocker, including preflight and post-read verification. The reviewer independently reran 25 focused tests and cleared the final change.

The Windows installer is published only after its exact source commit passes release CI. Downloaded installer verification and installed-version receipts are retained separately in the ignored delivery artifacts; these source/fixture checks do not assert installation or paid model acceptance.
