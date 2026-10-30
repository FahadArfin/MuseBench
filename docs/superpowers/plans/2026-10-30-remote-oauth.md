# Explicit Remote OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person explicitly authorize and remember a reviewed remote MCP source using app-owned public-client OAuth, then use it under connection consent and native approvals without effect replay.

**Architecture:** A main-only protected grant ledger and explicit authorization service own persistence, metadata review, browser/callback and refresh. The existing owned worker receives only a source/session-bound read-access-token lease. Durable authSourceIdentity excludes workspace execution state, while root-bound source.revision remains in ephemeral consent/leases; the same global enrollment works across projects after fresh review, and normal token rotation preserves its grant binding.

**Tech Stack:** Existing Node/Electron45, React/TypeScript, Muse SDK1.4.14, MCP SDK1.32.2, separate stable MCP client2.4.0 public OAuth helpers, actual disposable loopback MCP/OAuth/Responses fixtures.

**Spec:** `docs/superpowers/specs/2026-10-30-remote-oauth-design.md`.

## Global Constraints

- Keep Muse SDK 1.4.14, MCP SDK 1.32.2 and separate stable MCP client 2.4.0 pinned; OAuth uses only public client2.4.0 exports.
- No model inference, real provider/account authorization, personal configuration/credential access, settings/grant changes or production installation in development acceptance.
- Preserve native Muse identity, exact source consent, four-source cap, ownership cleanup, saved-session recovery and shared preview/desktop UI.
- Browsing/inspection/source-selection/status is local-only; network discovery, registration, browser launch and scope expansion require their explicit source-bound review actions.
- Refresh runs only before connection/native turn submission, never from discovery tool dispatch, a transport unauthorized handler or a submitted effect's error path.
- Once submitted, tool effects, code exchanges and refresh-token exchanges are never replayed automatically; uncertain effects retain unknown receipts.
- All secrets, expanded URL paths, authorization/callback queries and raw provider errors stay out of renderer state, chat/history, model schemas, command arguments and logs.
- Store credentials only under stable app userData using available OS protection; no plaintext fallback, silent store reset, installation-directory storage or credential export.
- Parent owns dependency integration, final independent review, consolidated correction, push, CI/release/hash/install acceptance; implementers keep focused evidence and worktree.

## Review Focus

1. Refresh reaches the provider, rotates a token, then the app crashes or protected commit fails: restart must not resend uncertain old refresh material or claim readiness (Task1/Task2).
2. Project/root/overlay changes versus endpoint/header/auth-policy changes: both revoke old execution leases, but only the latter invalidate durable enrollment; fresh review in another project reuses the same global grant without a browser (Task1/Task2/Task3).
3. Invalid stranger/duplicate callback or late valid callback arrives after owner switch/forget: it cannot cancel another attempt, mint an usable grant or resurrect forgotten credentials (Task2).
4. A valid token expires or401/403 follows a remote effect: zero automatic refresh/retry/browser activity, exactly one effect and explicit unknown receipt (Task3).
5. Protected storage is unreadable/unknown-version or an app update restarts with the same userData: preserve bytes/grants and exact saved auth marker instead of empty-store overwrite/new conversation (Task1/Task3).

---

## Execution Baseline and File Map

Task 1's pure ledger/identity/contracts may begin at the reviewed child-restart baseline `1ef20666358fd59b06bd253301839f9ca7821847`, without importing remote SDK/transport code. Parent integrates the final reviewed remote-discovery before Task 2 and records both dependency SHAs and resulting HEAD in `.superpowers/sdd/2026-10-30-remote-oauth/progress.md`; then verifies actual adapter signatures against that immutable baseline. No task implements against another worker's mutable tree. This is a parent integration prerequisite, not an extra user approval gate. No OAuth implementation changes another worker's files.

Create focused modules with exact interfaces below: shared safe contracts/identity; encrypted store; low-level OAuth flow; owned callback; authorization service; inline UI. Shared integration files remain in Task3 so neighboring tasks do not race on controller/runtime/main. The three tasks are independent review units: protected ledger correctness, explicit authorization protocol correctness, then complete usable product integration. Setup/dependency/docs work belongs to its owning task; no scaffolding-only task.

### Task 1: Durable protected grant ledger and source/auth identity

**Files:**
- Create `src/shared/discovery-auth.mjs` and `src/shared/discovery-auth.d.mts`.
- Create `src/runtime/discovery-auth-identity.mjs` and `electron/discovery-oauth-store.mjs`.
- Modify `src/shared/tool-discovery.mjs`, `src/shared/tool-discovery.d.mts`, `src/shared/native-session.mjs` only for optional auth marker/recovery.
- Create `test/discovery-oauth-store.test.mjs`, `test/discovery-auth-identity.test.mjs`, `test/fixtures/discovery-oauth-store.mjs`.

**Interfaces:**
- Shared exports: `validateDiscoveryAuthCommand(value):DiscoveryAuthCommand`, `safeAuthState(value):SafeAuthState`. `safeAuthState` constructs an allowlisted bounded DTO; it must not spread private records or import Node crypto into renderer.
- Private runtime exports: `authSourceIdentity({sourceId,transport,globalSettingsPath,nativeProfilePath,urlTemplate,resolvedUrl,headerTemplates,resolvedHeaders,authPolicy}):string`, `normalizeAuthBinding(value):AuthBinding`, `authBindingRevision(value):string`. Source identity hashes exactly the spec's versioned canonical global settings/native profile provenance, raw+resolved endpoint/header/global-ID/public-bearer projection; it excludes workspace root/overlays/enabled/filters/timeouts/execution-review revisions and all token material. Binding contains authSourceIdentity, issuer/resource/registration/scopes/grantId, never root-bound source.revision.
- `discoveryIdentity`/`discoverySelection` preserve optional64hex `authBindingRevision` on each source row; `sameDiscovery` compares it. Old exact `{id,revision}` rows work. Invalid/future markers retain native ID in blocked recovery through restoreNativeSession.
- Store consumes the injected async protection adapter and exports `createDiscoveryOAuthStore({dataDir,protection,fsAdapter?,now?}):Promise<Store>` with exact methods from spec Identity/store section. Only Task2 receives private Grant objects. Safe shared types contain no secret fields.
- Parent-reviewed private extension: `Store.listBindings(sourceId)` returns at most100 cloned `{binding,phase}` records for exactly that global source, including orphaned configuration identities, without tokens/registration/metadata. Task2 uses these solely for safe local Forget review, never credential reuse; exact `get` binding checks remain unchanged. Test changed configuration returns null from `get`, the orphan's bounded projection remains discoverable, other sources are excluded and returned objects cannot mutate the ledger.

- [ ] **Step 1: Write failing ledger/identity regressions** with these named cases and pinned assertions:

```js
test('same-scope token rotation preserves auth binding and saved native identity', async () => {
  const initial = await f.enroll();
  const tx = await f.store.beginRefresh(initial.binding.bindingRevision,
    {expectedTokenGeneration: initial.tokenGeneration});
  const next = await f.store.completeRefresh(tx.transactionId, f.rotatedTokens);
  assert.equal(next.binding.bindingRevision, initial.binding.bindingRevision);
  assert.equal(next.tokenGeneration, initial.tokenGeneration + 1);
  assert.equal(f.restore(initial).id, 'fixture-native-session');
});
test('restart with refresh intent requires reauthorization and performs no network', async () => {
  const g = await f.enroll();
  await f.store.beginRefresh(g.binding.bindingRevision,
    {expectedTokenGeneration: g.tokenGeneration});
  await f.reopen();
  assert.equal(f.store.get(f.authSource).phase, 'reauthorization-required');
  assert.equal(f.networkRequests, 0);
});
```

The fixture supplies a reversible fake protection adapter, bounded temp dataDir, injected atomic-write failures and counters; it must never read process userData. Add `project root and unrelated overlays do not change durable source identity`, `canonical global settings or native profile location change prevents enrollment reuse`, `atomic same-path settings replacement preserves enrollment provenance`, `endpoint template resolved header global ID and auth policy changes create new identity`, `header order normalized aliases and unrelated environment preserve identity`, `unreadable and future envelopes preserve exact bytes`, `failed CAS preserves unrelated grants`, `old identity remains compatible and unknown auth marker retains recovery ID`, `store limits do not evict records`, `safe DTO never contains private record marker`. Assert1MiB/100grants/64KiB/depth16/256scopes/200chars and16KiB token/client ID limits at boundary and +1.

- [ ] **Step 2: Record RED output**.

Run `node --test test/discovery-oauth-store.test.mjs test/discovery-auth-identity.test.mjs`.
Expected: tests fail for missing new exports/marker/store behavior, not fixture setup or dependency loading. Save bounded output under `artifacts/remote-oauth/task1-red.txt`.

- [ ] **Step 3: Implement private source/grant identity and safe shared validation** in the exact modules above. Private identity canonicalizes the spec's durable raw+resolved projection, separate from execution revision. Shared validation remains pure/renderer-compatible and constructs only the exact safe union. Extend existing identity functions/recovery without changing native IDs or persisting private auth details.

- [ ] **Step 4: Implement `createDiscoveryOAuthStore`** with serialized queue, bounded link-safe load, versioned complete-envelope encryption, expected file digest/generation CAS, exclusive same-directory temp/flush/rename and publish-after-commit. Preserve unreadable/unknown bytes, reject unavailable/unprotected backend. `beginRefresh` commits intent before returning private material; `completeRefresh` commits rotation before ready; failed completion leaves intent. `get` never treats persisted intent as usable after restart. No network/browser in this module.

- [ ] **Step 5: Verify focused GREEN and existing session compatibility**.

Run `node --test test/discovery-oauth-store.test.mjs test/discovery-auth-identity.test.mjs test/discovery-mcp.test.mjs test/native-session.test.mjs`.
Expected: all named files pass, including the verified existing `test/native-session.test.mjs`. Persist focused output; no full suite yet.

- [ ] **Step 6: Commit this independently testable ledger unit**.

Stage only Task1 files and the reviewed spec/plan as appropriate. Commit message `feat: persist protected discovery OAuth grants`. Record commit SHA, tests and no-runtime-wiring limitation in progress. No push or installation. Parent/assigned reviewer can approve this library unit while rejecting a later protocol/integration task.

### Task 2: Explicit authorization service with real local OAuth protocol

**Files:**
- Create `electron/discovery-oauth-flow.mjs`, `electron/discovery-oauth-callback.mjs`, `electron/discovery-oauth.mjs`.
- Create `test/discovery-oauth-flow.test.mjs`, `test/discovery-oauth-callback.test.mjs`, `test/discovery-oauth-service.test.mjs`.
- Create `test/fixtures/discovery-oauth-server.mjs` and `test/fixtures/discovery-oauth-authority.mjs`.
- Extend Task1 safe union/types only when a mismatch is found; keep agreed names consistent in Task3.

**Interfaces:**
- Consumes Task1 `Store`, AuthBinding, validated command and SafeAuthState types; reviewed remote dependency `createRemoteNetwork`/destination policy through injected networkFactory.
- Produces `createDiscoveryOAuthFlow({networkFactory,now})` with `discoverResource`, `discoverIssuer`, `register`, `authorize`, `exchange`, `refresh` exact inputs/outputs in spec Authorization section.
- Produces `createDiscoveryOAuthCallback({port,now,isCurrent,onCode,onDenied})` returning `{uri,arm({attemptId,state,issuer,issRequired,expiresAt}),close}`.
- Produces `createDiscoveryOAuth({store,flow,callbackFactory,resolveSource,getSourceSnapshot,ownerSnapshot,runtimeOwnerSnapshot,stopSourceLeases,withIdleLease,openBrowser,onSafeUpdate,now})` with `command`, `inspectSource`, `prepareConnection`, `bindSession`, `prepareTurn`, `readAccessToken`, `verifyLease`, `closeLease`, `isBusy`, `close` as spec Service section. Command union fields are fixed there; taskId/sourceRevision/attempt/review values are validated before any side effect. Selected interactive authority and keyed live-runtime authority are distinct synchronous fail-closed hooks. Preconnection is unbound until authenticated native bootstrap or verified native session/read evidence supplies the actual session ID.
- Private source resolver consumes exact main SourceRef and returns existing reviewed remote source/configuration, independently computed authSourceIdentity and safe template/origin/env facts. It checks global/remote/reviewed/disabled provenance and resolved Authorization conflicts. Current source.revision gates the attempt/lease; Store.get uses AuthSourceRef so a root-only change does not force enrollment. It never returns a raw renderer-controlled URL.

- [ ] **Step 1: Write failing real-flow/service regressions** using actual disposable HTTP resource+authorization endpoints and a main-injected fixture-only loopback auth policy.

```js
test('only reviewed Begin registers and opens browser; code PKCE mints resource token', async () => {
  const review = await f.prepareAndReview();
  assert.equal(f.authorization.registrations, 0);
  assert.equal(f.opened.length, 0);
  await f.begin(review);
  assert.equal(f.authorization.registrations, 1);
  await f.followCapturedLocalAuthorization();
  assert.equal(f.authorization.codeExchanges, 1);
  assert.equal((await f.inspect()).status, 'ready');
  assert.equal(f.authorization.lastExchange.resource, f.resolvedResource);
  assert.equal(f.authorization.pkceValid, true);
});
test('wrong and duplicate callbacks never exchange or steal the active attempt', async () => {
  await f.waitingBrowser();
  await f.callback({state:'wrong',code:'wrong'});
  assert.equal(f.authorization.codeExchanges, 0);
  assert.equal((await f.inspect()).status, 'waiting-browser');
  await f.followCapturedLocalAuthorization();
  await f.replayLastCallback();
  assert.equal(f.authorization.codeExchanges, 1);
});
```

Add named cases: `owner source or resolved env change invalidates review before registration`, `project-only execution revision change revokes lease but preserves enrollment`, `another reviewed project obtains same grant without browser registration or token exchange`, `same source name and URL in a different canonical config profile cannot reuse grant`, `endpoint header or auth policy change requires new enrollment`, `stale callback and forget cannot resurrect a grant`, `refresh rotates once before turn and failed commit retries saving locally`, `issuer metadata and callback iss mismatch send no code`, `new issuer origin needs explicit metadata review`, `cross-origin PRM challenge makes zero requests until reviewDestination`, `missing client ID reports actionable public registration`, `confidential-only or DPoP requirement is unsupported`, `SDK provider error body never reaches safe state or logs`.

- [ ] **Step 2: Run and record RED**.

Run `node --test test/discovery-oauth-flow.test.mjs test/discovery-oauth-callback.test.mjs test/discovery-oauth-service.test.mjs`.
Expected: missing new functionality failures; local fixture itself validates PKCE/state/resource and has zero external network capability. Save bounded result.

- [ ] **Step 3: Implement low-level flow public helpers and bounded purpose network**.

Use public client2.4.0 helpers named in spec; verify installed exports at the immutable baseline. Do not install another version or import SDK private paths. Keep PRM/issuer discovery separate with no guessed fallback and opaque issuer selection. Enforce spec128KiB responses/16KiBheaders/1MiBstage/12metadata/30sphase caps before parsing. Registration chooses stored/preregistered/CIMD/DCR exactly after review, uses public native metadata and no secrets. Refresh/exchange helpers make one POST with reviewed exact issuer/resource; wrap safe typed errors without printing provider body. Do not use auth()/withOAuth.

- [ ] **Step 4: Implement owned callback listener**.

Construct exact loopback callback from main port/profile, reserve before review, remain unarmed until Begin, enforce fixed Host/path/GET/query bounds and unique allowed query fields. Validate32byte state/current source+owner+review/issuer/deadline before consuming a valid callback; reject stranger requests without cancelling the real attempt. Consume before exchange; close/readers on owner/cancel/deadline. Fixed no-store/referrer/CSP page only. Implement10min attempt and30s phase bounds with injected clocks.

- [ ] **Step 5: Implement `createDiscoveryOAuth` state machine and lease methods**.

Drive prepare/reviewDestination/selectIssuer/savePublicClient/begin/status/cancel/retrySave/forget through exact safe union. Stage private metadata/client/code/verifier in memory and validate same source/owner after awaits. No browser/registration from inspect/prepare/status or metadata-origin review; no token returned through command. Durable lookup uses authSourceIdentity while every ephemeral lease binds current source.revision/owner/root/session; workspace/overlay/execution-review changes revoke only the lease, and canonical global profile/settings path or endpoint/header/global-ID/authPolicy changes require new enrollment. Durable grant commit creates new enrollment binding; same-scope pre-connection/pre-turn refresh uses Store intent. Invalid/lost refresh requires reauthorization with no retry/browser fallback. Forget validates its local inspect review digest, invalidates leases and leaves unrelated grants intact. Expose readAccessToken as local read-only capability; no refresh from it.

- [ ] **Step 6: Verify protocol, race, setup and storage-green matrix**.

Run the three Task2 files plus `test/discovery-oauth-store.test.mjs test/discovery-auth-identity.test.mjs` with `node --test`. Assert actual DCR/preregistration/CIMD selection, callback code/error/iss/state/unknown-field/path/Host/deadline bounds; source `${VAR}`/fallback/`$$` and case-folded Authorization conflicts; metadata-origin/DNS/redirect isolation to second receiver; late callback/cancel/forget/refresh races; restart intent and Retry saving perform zero repeated POST. No token appears in safe snapshots/errors/stdout; no full suite yet.

- [ ] **Step 7: Commit the independently testable authorization unit**.

Commit only Task2 files and necessary agreed shared contract changes with `feat: add explicit discovery OAuth authorization`. Record SHA, exact local protocol assertions and explicit no-UI/no-native-wiring limitation. No push/install/model request.

### Task 3: Complete shared OAuth UX, private worker leases and native/package acceptance

**Files:**
- Modify `electron/main.mjs`, `electron/preload.cjs`, `electron/security.mjs`, `electron/discovery-mcp-config.mjs`.
- Modify `src/controller/index.mjs`, `src/runtime/index.mjs`, `src/runtime/discovery-mcp.mjs`, reviewed `src/runtime/discovery-remote.mjs`, source-inspection wiring and only necessary runtime-selector declarations.
- Create `src/ui/DiscoveryAuthControls.tsx`; modify `src/ui/DiscoveryTools.tsx`, `src/shared/types.ts`, `src/preview/bridge.ts` and minimal shared styles.
- Create `test/discovery-oauth-integration.test.mjs`, `test/discovery-oauth-runtime.test.mjs`, `scripts/discovery-oauth-smoke.mjs`, `scripts/discovery-oauth-protection.mjs`, `scripts/native-discovery-oauth-contract.mjs`, `scripts/discovery-oauth-packaged-contract.mjs`.
- Extend `test/controller.test.mjs`, `test/discovery-mcp-config.test.mjs` and `test/native-session.test.mjs` for marker/owner regressions.
- Update `docs/TOOL-DISCOVERY.md`, `docs/VALIDATION-tool-discovery.md`, `docs/ROADMAP-2026-10-29.md`; create `docs/validation/2026-10-30-remote-oauth.md`. Existing dependency pins remain unchanged.

**Interfaces:**
- Consumes Task2 OAuth service exact methods; main constructs it once using stable userData and async safeStorage. Controller supplies main-derived OwnerRef and source resolver closures; no caller-supplied owner authority. Supply selected `ownerSnapshot()` for interactive attempts and required synchronous keyed `runtimeOwnerSnapshot(ownerReference)` from a live runtime/connection registry for leases/bootstrap/refresh. Register the main owner before preconnection, retain unchanged background runtime entries across navigation, and invalidate on actual close/root/epoch/connection replacement. Both hooks fail closed for absent/throwing/thenable output. Cancel an interactive attempt before navigation or immediately reconcile with auth inspection/status after selection changes; do not close another still-live runtime just because it is no longer selected.
- Add bridge `discoveryAuth(command:DiscoveryAuthCommand):Promise<SafeAuthState>` and `onDiscoveryAuthUpdate(callback:(event:{taskId:string,sourceId:string})=>void):()=>void` through trusted `musebench:discovery-auth` / `musebench:discovery-auth-update`. Do not expose through native MCP/control API or persist SafeAuthState in chat.
- Source inspection adds safe auth summary/optional authBindingRevision locally; selected identity carries that marker explicitly. `DiscoveryAuthControls({taskId,source,onChanged,disabled})` renders typed states inside shared review and resets connection consent on enrollment change.
- Extend reviewed adapter with `readAccessToken?:()=>Promise<{token:string,expiresAt:number|null}>`; token-only SDK provider, no onUnauthorized/full provider/withOAuth, scope handling throw. Private `/worker-auth-token` request `{sessionId,sourceId,sourceRevision,authBindingRevision}` uses worker authentication; broker derives leaseId. Native authentication fails this route. Static/unauth sources don't receive hook.
- Discovery lease gains `prepareTurn():Promise<void>` while `verify()` stays local-only; runtime calls prepareTurn before native turn submission, outside gateway dispatch, and checks connection epoch after await. Inject `withIdleLease` to block dispatch atomically before checking zero active requests and hold through refresh/save; it does not replace service live-entry/generation checks. Account mutation revokes provisional and established source leases, including connections held in a resolver; close invalidates awaiting pre-turn/bootstrap/token continuations before subsequent effects. Bind the unbound OAuth lease exactly once from authenticated native bootstrap or verified native session/read evidence with the real session ID. Disconnect closes auth lease and removes its keyed live owner. Existing restart fixes must preserve/recover auth marker without starting browser/model or broadening grant.

- [ ] **Step 1: Write failing integration/runtime/privacy regressions**.

```js
test('OAuth worker token route requires exact worker source session binding', async () => {
  const f = await oauthBrokerFixture();
  assert.equal((await f.nativeReadToken()).status, 409);
  assert.equal((await f.workerReadToken({sourceId:'global:other'})).status, 409);
  assert.equal((await f.workerReadToken()).status, 200);
  assert.equal(f.refreshPosts, 0); // route is read-only
  assert.doesNotMatch(JSON.stringify(f.rendererState()), f.secretPattern);
});
test('effect followed by 401 is unknown once with no refresh browser or replay', async () => {
  const f = await oauthRuntimeFixture({effectThen401:true});
  const receipt = await f.approvedCall();
  assert.equal(receipt.outcome, 'unknown');
  assert.equal(f.resource.toolCalls, 1);
  assert.equal(f.auth.refreshPosts, 0);
  assert.equal(f.openedAfterDispatch, 0);
});
```

Also assert expired-before-submit zero resource calls, native denial zero resource calls, auth marker unchanged on refresh, new enrollment blocks old resume, unknown auth marker preserves native ID, controller owner switch cancels attempt, child restart does not discard auth identity, static source compatibility and source/env change rejection. Exercise actual source inspection in two disposable projects: root/plugin-overlay-only changes invalidate the old execution lease yet retain ready enrollment; after fresh source review a new lease uses that same binding with zero browser/code exchanges, while canonical global config/profile location or endpoint/header/auth-policy/global-ID changes cannot retrieve the old grant.

Add two-live-owner navigation acceptance: selecting chat B cancels chat A's pending interactive authorization callback while A's unchanged runtime may still read/prepare a turn/refresh using its keyed owner; actual A runtime close/root/epoch/source/account/lease replacement fails closed without a new refresh invocation. Preserve deterministic held-resolver races: an awaiting connection cannot publish an old-grant lease after Prepare/Begin/Forget source invalidation, and a lease closed while pre-turn verification awaits makes zero subsequent refresh calls. Test bootstrap/token-read revocation and no save/replay if close occurs after an already authorized refresh response. These are Task2 service regressions and mandatory Task3 integration checks, not permission to wire selected-chat state as execution authority.

- [ ] **Step 2: Record RED integration output**.

Run `node --test test/discovery-oauth-integration.test.mjs test/discovery-oauth-runtime.test.mjs`.
Expected: missing private route/runtime hook/marker behavior, not unauthorized external requests. Save bounded RED receipt.

- [ ] **Step 3: Wire trusted main/controller/worker integration**.

Construct protection/store/flow/service after app ready using closures for controller authority. Add dedicated trusted IPC validation and safe invalidation event. Gate account mutations against selected source's running work and cleanup; add OAuth busy/commit to app update blockers and closeOwned. Add private worker token route and token-only adapter hook without secrets in bootstrap persisted definitions/gateway env/model schemas. Run runtime pre-turn refresh under epoch/idle gate; never refresh from broker call/error/token route. Keep `verify()` network-free. Extend saved selection marker in all controller/runtime/child restart paths.

- [ ] **Step 4: Implement compact shared review/sign-in/cancel/forget states**.

Use exact states/copy behavior from spec. Display source template/safe origins/env names/scopes/callback/public-client method, no expanded private paths. Manual setup accepts public client ID and callback port only. Clear source execution consent after success; do not connect/send/search automatically. Preview simulates all outcomes and no network. Match keyboard focus/labels at390/1280; Check status stays local. Forget copy distinguishes local credential deletion from provider/CLI/browser sign-out.

- [ ] **Step 5: Verify focused product regressions**.

Run `node --test test/discovery-oauth-integration.test.mjs test/discovery-oauth-runtime.test.mjs test/discovery-oauth-store.test.mjs test/discovery-oauth-flow.test.mjs test/discovery-oauth-callback.test.mjs test/discovery-oauth-service.test.mjs test/discovery-auth-identity.test.mjs test/discovery-mcp-config.test.mjs test/controller.test.mjs test/native-session.test.mjs`. Expected: all pass, zero fixture secret in safe state/log reports and no live provider/model request.

- [ ] **Step 6: Create and run actual safeStorage acceptance**.

`scripts/discovery-oauth-protection.mjs --local-fixture` runs under real Electron with isolated userData and fake tokens. Verify encrypted bytes exclude plaintext markers, restart decrypts same binding, two sequential rotated commits preserve other records, same dataDir survives simulated app restart/update, bad crypto/unknown schema preserve bytes, pending refresh intent blocks reuse. Run through Electron executable (use existing harness launch pattern); require report status passed and no personal userData access. Do not substitute the normal app profile.

- [ ] **Step 7: Create and run shared source UI and actual pinned-native OAuth acceptance**.

Run `node scripts/discovery-oauth-smoke.mjs` and `node scripts/discovery-oauth-smoke.mjs --desktop`.
Expected:390/1280 states/review/cancel/setup/forget/error flow pass with no renderer errors/secrets and no model call. The browser fixture must still require a token minted by its local fake authorization flow; never substitute a seeded bearer for sign-in acceptance.

Run `node scripts/native-discovery-oauth-contract.mjs --local-fixture`.
Expected: actual pinned Muse plus scripted localhost Responses, current-only and supported legacy authenticated resources; actual PKCE authorization first; approved search/call once, denied call zero; reconnect preserves same binding; new enrollment blocks saved identity; callback/socket/worker/process cleanup confirmed after failure/restart. Cap each scenario60s/32Responses/1MiBbody/2000native events; report modelInferenceRequests0 and personalCredentialsfalse.

- [ ] **Step 8: Run full unit suite and production build once focused checks pass**.

Run `npm.cmd test`, then `npm.cmd run build`.
Expected: zero failed tests and successful TypeScript/native/Vite build; keep existing nonfailure warnings honest. Do not re-run broad checks without new changes/failures. If these fail, fix the owning task and rerun necessary focused checks before broad verification.

- [ ] **Step 9: Build an isolated package and run exact ASAR acceptance**.

Use `npm.cmd exec electron-builder -- --win --dir --publish never --config.directories.output=artifacts/remote-oauth-package` after the verified build, recording actual command/output (adapt only if the existing package contract requires an equivalent isolated staging helper). Never install it. `scripts/discovery-oauth-packaged-contract.mjs --local-fixture` locates that exact executable by explicit harness argument/env and invokes the native OAuth script against its ASAR/worker/dependencies/native helper, plus real protection harness in isolated userData.

Expected: current+legacy OAuth source approved/denied once-only behavior, saved grant restart, actual async safeStorage, private route/secret scan and process/socket cleanup all pass against exact ASAR. Hash evidence identifies package and immutable source. Run shared UI harness against the same package through existing MUSEBENCH_EXECUTABLE pattern. No stale release folder or unrelated installed executable is acceptable evidence.

- [ ] **Step 10: Write truthful guide/validation/roadmap and commit complete product**.

Document user sign-in/review/forget/setup behavior, supported bearer public-client flow, explicit provider prerequisites and direct/native-token differences; preserve current/legacy transport support. Record exact source/dependency SHAs, commands, source/native/package/protection/UI reports, no-model/no-personal proof and limitations in dated validation. Commit focused integration with `feat: connect reviewed remote tools with OAuth`. Parent receives immutable commits/evidence for whole-feature independent review and final push/release; do not push/install/claim personal provider acceptance.

## Handoff and Self-Review

The standing roadmap authorization and parent-selected implementation/review process remain in force; do not add a new user design gate. Parent reviews this concrete spec/plan before dispatch. Task1->Task2->Task3 are sequential interfaces; no edits to remote-discovery worker's tree and no unrequested agents.

Before handoff verify: every spec requirement belongs to a task; shared/store/service/worker names match; all five Review Focus inputs have named tests; no fake publisher registration exists; exact current+legacy/OAuth/native/ASAR acceptance is retained; baseline dependency gate is explicit; no setup-only task or body transcript replaces a meaningful unit. Record the completed self-review and any real baseline-only API reconciliation in ignored progress receipt.


Task3 actual-native clarification (parent ruling, 30 October): pinned Muse registers session MCP during session/start but may launch its gateway only on first tool demand. Add trusted main-only `AuthLease.bindSession(actualNativeSessionId)` after adapter.open, authenticated session/read and provesAskMe succeed. Check native epoch/owner immediately before and after its await; no turn starts before successful binding. An early/eager authenticated bootstrap remains valid; both paths are idempotent only for the exact same ID and reject disagreement, including known resume identity. Tokens remain unreadable before binding. Cost: one private lease method; no renderer-supplied session authority and no wait on a lazy startup path.


Task3 enrollment replacement correction (parent ruling, 30 October): only the latest matching sourceId/authSourceIdentity binding may prepare, verify, refresh or read credentials. A successful atomic new-enrollment commit marks older matching grants reauthorization-required and removes their reusable access/refresh tokens while retaining metadata for explicit Forget. Other source/identity records remain unchanged. Failed save/authority preserves all prior bytes and usability; same-binding refresh preserves its marker. Restart and Forget-latest must never revive older tokens. This bounded correction was exposed by actual native old-marker acceptance; OAuth is unreleased, so no migration is inferred.

Task3 observed-authority correction (parent ruling, 30 October): serialize private factory inspections with failure recovery and immutable effective-environment snapshots. A private digest of observed global file/provenance/profile, referenced environment, global review and plugin facts invalidates all root snapshots on a changed observation; every gateway resolution participates. Root/overlay changes still require fresh execution review and preserve matching durable enrollment. No private digest/paths/values enter rows, and unobserved filesystem changes are not claimed atomically detected. Delayed inspection, cross-root revocation, changed environment and failure-recovery tests cover this publication boundary.


Task3 terminal-status correction (parent ruling, 30 October): capture the interactive attempt once before asynchronous source inspection and recheck exact active-attempt identity after every await. A captured failed/cancelled disposition is preserved only for the same selected owner and current synchronous source authority; stale authority projects current local safe status. Never invalidate a replacement attempt. Successful durable Forget clears only its own captured disposed attempt. Held-resolver regressions cover failure during inspect/status, replacement, cancellation, owner/source changes and Forget; fixed provider error projection and zero network retries remain unchanged.


Task3 correction round1 private mutation admission (parent ruling): replace the asynchronous `stopSourceLeases(sourceId)` service hook with required trusted synchronous `admitSourceMutation(sourceId)`. Main first checks source-wide controller busy authority across all contexts, then factory admission synchronously checks existing dispatch/idle ownership and reserves the source. Return `null` for a busy refusal or exactly a non-thenable object with own callable `{stop,release}`; absent/throwing/thenable/malformed authority fails closed. Begin derives this source only from its captured attempt ID and selected owner, never renderer fields. Obtain reservation before source lookup/Forget summary or any source-blocking mutation flag. A refusal changes no source gate, generation, lease, in-flight request, browser or exchange. Begin busy projection preserves its current attempt rather than disposing it.

An admitted reservation blocks new source factories, native dispatch and idle-turn admission synchronously across awaits. Factories capture a per-source admission epoch before their first canonical-path await and reject changed epochs even after reservation release. At the validated stop boundary, service increments account generation and revokes established/provisional leases, then awaits reservation.stop(); the factory invalidates captured registered/provisional owners synchronously and awaits their existing cleanup. Stop has no later busy-refusal check: cleanup failure remains an accepted mutation with revoked authority and honest failure, never restoration of old leases. Service releases the reservation in finally. Existing held-resolver, close-during-refresh and synchronous effect/publication guards remain required. Cost: one private reservation interface and ephemeral admission epochs; no public IPC/API/dependency change.
