# Explicit app-owned OAuth for reviewed remote discovery

Date: 30 October 2026. Authorized remaining-roadmap continuation after configured-header/no-auth remote discovery. This spec is ready for parent review; it is not implementation or provider acceptance evidence.

## Integration baseline

The managed `codex/remote-oauth` branch was created at `50417385796f52cf92d92ee9a066690391b7a249`. Task 1's isolated ledger, identity and safe contracts may start from the independently reviewed child-restart commit `1ef20666358fd59b06bd253301839f9ca7821847`: they do not depend on the new remote transport. **Before Task 2 or runtime integration**, parent integrates the final independently reviewed remote-discovery commit and records both dependency SHAs and the resulting immutable baseline in the ignored progress receipt. Do not implement against another worker's mutable tree, cherry-pick an unreviewed checkpoint, replace native Muse, or refactor either dependency's unrelated behavior.

Known transport boundary supplied by its owner: `createRemoteDiscoveryClient(source,{lookup,networkOptions})` returns `{connect({signal}),catalog({signal}),call({name,arguments},{signal}),close(cleanup=true),closed,activeRequests}`. `createRemoteNetwork(source,{lookup,onFailure,limits})` returns `{begin(signal),end(),fetch(input,init),close(),activeRequests}`. Private remote source has `id,name,revision,transport:'streamable-http',url,headers,enabledTools,disabledTools,startupMs,callMs`. Its revision already binds raw configuration, expanded URL/headers/environment and existing provenance/collisions. Use this reviewed boundary through a small OAuth adapter extension; parent must reconcile any signature changes in the final commit before dispatch.

## Product behavior

A person can sign in on this device for an already-reviewed, disabled global remote source, review the resource/issuer/scopes/public-client registration, finish in the external browser, and explicitly allow that signed-in source for a connection. A successful enrollment persists OS-protected credentials across app restart/update. Native per-call approval remains authoritative. Connecting a saved chat requires the same source and OAuth grant binding plus fresh connection consent.

Support public native-app authorization-code/PKCE using bearer tokens. No fake client ID/CIMD, confidential-client secrets, DPoP, native CLI OAuth-store access, browser-cookie import, arbitrary callbacks, optional server input fulfillment or automatic call replay. Providers requiring unsupported mechanisms receive an actionable setup/compatibility state. Configured-header/no-auth access and actual current/legacy remote support from the dependency remain intact.

## Global constraints

- Keep Muse SDK 1.4.14, MCP SDK 1.32.2 and separate stable MCP client 2.4.0 pinned; OAuth uses only public client2.4.0 exports.
- No model inference, real provider/account authorization, personal configuration/credential access, settings/grant changes or production installation in development acceptance.
- Preserve native Muse identity, exact source consent, four-source cap, ownership cleanup, saved-session recovery and shared preview/desktop UI.
- Browsing/inspection/source-selection/status is local-only; network discovery, registration, browser launch and scope expansion require their explicit source-bound review actions.
- Refresh runs only before connection/native turn submission, never from discovery tool dispatch, a transport unauthorized handler or a submitted effect's error path.
- Once submitted, tool effects, code exchanges and refresh-token exchanges are never replayed automatically; uncertain effects retain unknown receipts.
- All secrets, expanded URL paths, authorization/callback queries and raw provider errors stay out of renderer state, chat/history, model schemas, command arguments and logs.
- Store credentials only under stable app userData using available OS protection; no plaintext fallback, silent store reset, installation-directory storage or credential export.
- Parent owns dependency integration, final independent review, consolidated correction, push, CI/release/hash/install acceptance; implementers keep focused evidence and worktree.

## Modules

1. `src/shared/discovery-auth.mjs` and `.d.mts`: bounded auth-binding marker and safe IPC/state validation; no secret storage or network. Existing `src/shared/tool-discovery.mjs` gains an optional per-source `authBindingRevision` in identity/selection, with exact validation and equality. Old identities stay valid; unsupported markers preserve native identity in recovery.
2. `src/runtime/discovery-auth-identity.mjs` and `electron/discovery-oauth-store.mjs`: private durable source/grant digests plus main-only versioned encrypted ledger, atomic compare-and-swap mutations and refresh intent/crash recovery. No browser or network; private hashing code is never bundled into renderer/shared UI imports.
3. `electron/discovery-oauth-flow.mjs`: low-level public SDK operations with bounded purpose-specific network, sanitized results/errors, no implicit fallback/retry/logging.
4. `electron/discovery-oauth-callback.mjs`: owned exact loopback listener, state/issuer/owner validation and one-use callback delivery; no generic OAuth/URL router.
5. `electron/discovery-oauth.mjs`: main-only source/owner-bound authorization state machine, store transactions, trusted browser opener and private token leases.
6. `src/ui/DiscoveryAuthControls.tsx`: compact inline state/review actions, composed inside shared `DiscoveryTools`; preview simulation uses the same types.

Existing wiring touches only main/preload/security/update shutdown, source inspection/controller/runtime, private discovery broker/worker and the remote adapter where necessary. Do not turn `src/runtime/index.mjs` or main.mjs into a second OAuth implementation.

## Identity and store contract

```ts
type SourceRef = {id:string; revision:string}; // current owner/root/overlay execution consent
type AuthSourceRef = {sourceId:string;authSourceIdentity:string}; // durable, root-independent
type OwnerRef = {taskId:string; root:string; epoch:number}; // main-derived
type AuthBinding = {
  grantId:string; sourceId:string; authSourceIdentity:string; endpoint:string;
  issuer:string; resource:string; registrationId:string; scopes:string[];
  bindingRevision:string; // digest of all preceding fields; excludes tokens/expiry
};
type AuthMarker = {authBindingRevision:string}; // 64 lowercase hex only
```

`source.revision` from reviewed remote discovery already binds native-compatible `${VAR}`, `${VAR:-default}` and `$$` expansion of URL/headers. OAuth must not add its own expander. A missing variable or changed resolved value invalidates preparation/consent. Detect competing configured Authorization case-insensitively on resolved headers; reject ambiguity without rewriting settings. Public review uses the raw URL template, safe resolved origin and referenced environment names; private binding uses the resolved URL. Never expose expanded secret-bearing paths as exact endpoints.

**Durable enrollment identity is deliberately different from execution consent revision.** Existing source.revision includes workspace root/identity and project/plugin overlays; none of those belongs in the stored credential key. Main-only `authSourceIdentity(input)` hashes this exact stable private projection, using recursively sorted object keys and lowercase sorted header names after upstream duplicate-name rejection:

```ts
{version:1,sourceId:'global:NAME',transport:'streamable-http',
 provenance:{settingsPath:canonicalGlobalSettingsPath,profilePath:canonicalNativeProfilePath},
 endpoint:{template:rawUrl,resolved:canonicalExpandedUrl},
 headers:{template:canonicalRawHeaderMap,resolved:canonicalExpandedHeaderMap},
 authPolicy:{version:1,mode:'public-native-bearer'}}
```

settingsPath is the canonical resolved global Muse settings file path selected by existing mcpSettingsPath/native profile rules; profilePath is the canonical native userProfile path used with that source, never the selected workspace or executable/install path. Normalize Windows path comparison consistently with existing main path rules. Changing XDG/global configuration location or native profile cannot reuse a coincidentally same global name/URL enrollment. Do not include settings file inode/mtime or the whole file digest: unrelated settings writes must not force sign-in, and ordinary atomic file replacement keeps its source provenance.

No workspace root, directory inode, task/owner/session, project/plugin overlays, provenance grant file revision, enabled/required flag, tool filters, timeouts, token/expiry or unrelated environment variable enters this projection. Raw header/URL templates and resulting expanded values are private; their changes produce a new authSourceIdentity even if a template's origin stays the same. Normalized transport aliases/header ordering do not create a different identity. An environment change that changes no referenced resolved value does not require new enrollment. Issuer/resource/client-registration/scopes are bound in AuthBinding after discovery/enrollment, not guessed into source identity beforehand.

The same enrolled global source/profile is usable across projects after fresh execution/source review, with no repeated browser enrollment. A workspace root/overlay/execution-review/enablement change still invalidates old leases immediately through current source.revision/eligibility/owner checks; it preserves stored account enrollment and never grants new execution. A changed global settings/profile provenance, global source ID, endpoint/header raw-or-resolved/auth policy requires new enrollment. Existing stale grants remain recoverable/forgettable, not automatically reused or deleted. Private source inspection computes both identities while raw+resolved values and canonical global paths are available; public rows need only the safe OAuth binding marker/status, not the private projection/profile paths.

GrantId is a random local enrollment identity, not verified email/subject. New browser authorization/account switch/scope increase creates a new grantId; ordinary same-scope refresh preserves it. Return no invented principal name. Canonical sorted unique scope set belongs to the binding. Scope reduction/increase invalidates leases and requires review; reject unexpected grants outside reviewed requested scope. Code responses omitting scope inherit the reviewed request; refresh responses omitting scope inherit prior granted scopes. Resource/issuer exact strings remain private and are sent verbatim where the SDK requires; URL validation must not change audience or issuer comparison semantics.

Add optional `authBindingRevision` to each `{id,revision}` selection row and persist only that marker in native session toolDiscovery. No token, expiry, callback or registration data enters sessions. Existing non-OAuth markers remain compatible. A different/missing/unsupported auth binding blocks saved resume without replacing native identity; explicit Start fresh session is required for a new enrollment. A same-binding token refresh does not break resume. Enroll before creating a native session; an existing unauthenticated session cannot silently gain new signed-in authority.

Private encrypted envelope: `{version:1,generation:number,grants:Grant[]}`. Grant contains binding, public-client registration/callback profile, approved validated metadata/destinations, private bearer/refresh tokens/expiry, tokenGeneration and `phase:'ready'|'refresh-in-flight'|'reauthorization-required'`, with refresh transaction ID when relevant. No binding is reused across source ID/authSourceIdentity/endpoint/issuer/resource/registration even when another source shares the same issuer; current root-bound source.revision exists only in ephemeral execution consent/leases and native session configuration markers.

Store caps: 1MiB encrypted envelope and 1MiB plaintext; 100 grants; 64KiB per grant; depth16; 256 scope names, each at most200 characters. Token/client ID values at most16KiB; scopes reject controls/duplicates. Storage-full is an explicit error, never eviction of another enrollment.

```ts
createDiscoveryOAuthStore({dataDir,protection,fsAdapter?,now?}) -> Promise<Store>
Store.inspect() -> {status:'ready'|'unavailable'|'unsupported',generation:number}
Store.listBindings(sourceId) -> Array<{binding:AuthBinding;phase:Grant['phase']}> // private main only
Store.get(authSourceRef,bindingRevision?) -> private Grant|null
Store.commitGrant(grant,{expectedGeneration,authorityGuard?}) -> Promise<Grant>
Store.beginRefresh(bindingRevision,{expectedTokenGeneration})
  -> Promise<{transactionId:string;grant:Grant}>
Store.completeRefresh(transactionId,tokens) -> Promise<Grant>
Store.requireReauthorization(transactionId,reasonCode) -> Promise<void>
Store.forget(bindingRevision,{expectedGeneration}) -> Promise<void>
Store.close() -> Promise<void>
```

Missing store loads empty; unreadable/unsupported/symlink/nonregular/oversized/corrupt store preserves bytes and blocks mutations. Main process owns one serialized mutation queue under existing single-instance app lock. Validate bounded ciphertext/plaintext/schema before use; compare expected file digest/generation before replacement. Encrypt complete envelope, write exclusive unique same-directory temp mode0600, flush file as supported, atomic rename, then publish memory generation. Failed commit never reports ready. Preserve unrelated grants. Async safeStorage wrapper is `{available():Promise<boolean>,encrypt(text):Promise<Buffer>,decrypt(bytes):Promise<{result,shouldReEncrypt}>}`. Electron45 local declarations expose the async APIs; reject unprotected/basic_text backend and never enable plaintext fallback. On shouldReEncrypt rewrite the validated generation once; do not overwrite a later mutation. Stable userData/application protection identity survives package updates; do not read code-billing.bin or Muse credential stores.

`listBindings` validates the exact global source ID and returns at most100 cloned binding/phase projections for that source, including current and orphaned identities. It includes no tokens, registration, expiry or metadata and never relaxes `get`'s exact authSourceIdentity comparison. Trusted main uses it only to construct safe origins and opaque local Forget review; private endpoint/provenance details must never be spread into SafeAuthState. Forget still checks the current source ID, exact binding and local review before deletion. An unavailable/unsupported/closed store returns no bindings.

**Refresh transaction:** durably write refresh-in-flight before exactly one refresh POST. Commit returned rotation before use. Crash/lost response leaves an intent marker; restart requires reauthorization and must not reuse the uncertain old refresh token. If returned tokens cannot be saved, retain only the private in-memory candidate for explicit Retry saving (local-only) while the durable intent remains. Never claim old refresh material remains usable. An orphaned intent may be abandoned only through explicit reauthorization/forget. Store faults cannot silently erase a grant.

## Authorization/network/callback contracts

Use public client2.4.0 `discoverOAuthProtectedResourceMetadata`, `discoverAuthorizationServerMetadata`, `selectResourceURL`, `registerClient`, `startAuthorization`, `exchangeAuthorization`, `refreshAuthorization`, `validateAuthorizationResponseIssuer`, `computeScopeUnion`. Do not use transport-installed OAuthClientProvider, withOAuth or `auth()` recovery: they can retry/log raw errors. Do not import internal resolveAuthorizationCallbackParams. Require validated PRM and issuer metadata; do not guess resource-origin authorization after malformed metadata. Metadata may list multiple issuers: expose opaque origin choices, inspect only the explicitly reviewed choice.

```ts
createDiscoveryOAuthFlow({networkFactory,now}) -> Flow
Flow.discoverResource({source,challenge?,signal}) -> private ResourceReview
Flow.discoverIssuer({resourceReview,issuerChoiceId,signal}) -> private IssuerReview
Flow.register({review,clientMetadata,signal}) -> private Registration
Flow.authorize({review,registration,callbackUri,state})
  -> Promise<{authorizationUrl:URL,codeVerifier:string}>
Flow.exchange({review,registration,callbackUri,code,iss,codeVerifier,signal})
  -> Promise<private Tokens>
Flow.refresh({grant,signal}) -> Promise<private Tokens>
```

NetworkFactory returns a separately owned instance of the reviewed remote network boundary for purpose `metadata|registration|token`; the effect transport cannot supply refresh endpoints/headers. All fetches carry per-stage signal/deadline and redirect refusal. Metadata requests never inherit configured resource headers/API keys, browser cookies, MCP session IDs, billing tokens or environment credentials. Main validates every newly discovered destination before network access, using the transport's pinned-resolution/IP/TLS policy. A public destination cannot rebind to private/link-local/loopback. Production OAuth endpoints require HTTPS; local HTTP fixture access exists only through a main-injected test policy, never renderer input. Purpose-specific origin/path/method allowlists cover the exact reviewed metadata/registration/token destinations. Additional origins require explicit review before first fetch. Preserve TLS validation.

Authorization attempt caps: one active attempt app-wide; overall10min; each discovery/register/exchange/refresh phase at most30s; at most12 metadata reads and one registration/code-exchange/refresh POST per authorized phase. Headers16KiB; each metadata/registration/token decompressed response128KiB; total stage network1MiB; callback request target16KiB and headers16KiB; authorization URL16KiB; callback code/state/iss each at most8KiB. Bound before parsing. Existing transport caps remain unchanged. No raw error body/URL is logged; return fixed reason codes, including registration-required, unsupported-public-client, issuer-mismatch, network-failed and storage-unavailable.

Registration uses exact stored public profile for this issuer/source, then supplied pre-registered public client ID, configured valid publisher CIMD when actually supplied/supported, or explicitly reviewed DCR. No remote registration in Prepare. DCR Begin is a remote write; display method/issuer/scopes/callback first. Request application_type native, token_endpoint_auth_method none, authorization_code and reviewed refresh capability. Reject a required confidential method; never adopt or display returned client_secret/registration-management tokens. Store only public-profile fields needed to reuse the registration. No fabricated publisher profile. DCR-created client registrations are not rolled back or falsely called revoked when a browser attempt is cancelled.

First DCR attempt may bind a free 127.0.0.1 port before displaying registration review, register that exact callback and persist its port/path. Subsequent browser sign-in reuses this profile/port; occupied port yields actionable setup, never wildcard binding or silent registration replacement. Manual public-client setup accepts `{clientId,callbackPort}` only, bounded clientId16KiB and port1024..65535, with main constructing exact `http://127.0.0.1:PORT/oauth/mcp/callback`; no arbitrary callback URL. Publisher profile can use an approved stable loopback port. Do not assume all providers accept changing loopback ports.

```ts
createDiscoveryOAuthCallback({port,now,isCurrent,onCode,onDenied})
 -> Promise<{uri:string;arm({attemptId,state,issuer,issRequired,expiresAt}):void;
              close():Promise<void>}>
```

Listener binds only127.0.0.1, exact Host/port/path and GET; never all interfaces/proxy headers. Unarmed listener returns fixed409 without changing auth state. State is cryptographically random32bytes, constant-time checked, memory only, single-use, monotonic expiry. Accept only unique code/state/iss/error/error_description/error_uri query fields; reject unknown/duplicate fields and code+error mixtures explicitly. Validate state/current owner/source/review and issuer before consuming any callback error. Correct valid callback consumes attempt before one exchange. Invalid strangers must not cancel a valid pending attempt. Late/cancelled callbacks make zero token requests. Callback success/error pages are fixed no-store, no-referrer, restrictive CSP; no code/token/provider text interpolation.

Dedicated trusted main opener uses shell.openExternal only for the SDK-produced authorization URL after checking reviewed issuer endpoint, redirect_uri/state/resource/client ID/scope. It is not the generic renderer external-link route and never opens error_uri/token/callback URLs. No embedded webview/cookie sharing. External browser storage/history is outside the app's promise; the app itself persists none of these URLs. Destroy code/verifier/listener when cancelled, owner changes, source changes, deadline expires or app closes. Commit rechecks authority after exchange; stale completion cannot publish enrollment.

## Service and safe UI interfaces

```ts
createDiscoveryOAuth({store,flow,callbackFactory,resolveSource,getSourceSnapshot,ownerSnapshot,runtimeOwnerSnapshot,
  stopSourceLeases,withIdleLease,openBrowser,onSafeUpdate,now}) -> OAuth
OAuth.command(input:DiscoveryAuthCommand) -> Promise<SafeAuthState>
OAuth.inspectSource(sourceRef) -> SafeAuthSummary // local-only
OAuth.prepareConnection({owner,selection}) -> Promise<AuthLease>
OAuth.bindSession({leaseId,sessionId}) -> Promise<void> // trusted native bootstrap or verified session/read only
OAuth.prepareTurn({owner,leaseId}) -> Promise<void>
OAuth.readAccessToken({leaseId,sessionId,sourceId,sourceRevision,authBindingRevision})
  -> Promise<{token:string;expiresAt:number|null}> // private, no network
OAuth.verifyLease(leaseId) -> Promise<void> // local authority only
OAuth.closeLease(leaseId) -> Promise<void>
OAuth.isBusy() -> boolean
OAuth.close() -> Promise<void>
```

Task2 parent-approved private interface clarifications (30 October): `selection` is `{sources: Array<{id,revision,authBindingRevision}>,sessionId?:string}`. PrepareConnection creates an unbound lease before native session creation; the optional known resume ID constrains the later trusted `bindSession`. Token reads fail until the actual native session is bound, and conflicting rebinding fails. `withIdleLease({leaseId,owner},operation)` is a required trusted atomic admission guard for bound-lease pre-turn checks: block new dispatch before verifying zero active requests, hold through refresh/save, release finally, fail busy without interrupt/replay. `stopSourceLeases` remains account-mutation/Forget invalidation only.

Task2 round1 owner/lifetime ruling: `ownerSnapshot()` returns the currently selected interactive chat owner. Required `runtimeOwnerSnapshot(ownerReference)` returns that exact still-live runtime's current main-derived `{taskId,root,epoch}` from a keyed registry, independently of selection. Both hooks are synchronous and fail closed on missing, invalid, throwing or thenable output. Main registers a preconnection owner before `prepareConnection`, retains it for an unchanged background runtime, and removes/replaces it on real close/root/epoch/connection ownership changes. Navigation cancels the interactive attempt and closes its callback, not an unchanged background lease; main cancels before selection changes or immediately invokes auth inspection/status to reconcile the change. A command also reconciles stale interactive ownership before rejecting an old selected task. Execution leases, bootstrap binding and refresh use keyed runtime authority, never the selected-chat snapshot.

Provisional connection leases are privately registered as non-usable before their first await, with immutable selected rows, exact owner and captured per-source account generation. Account mutation advances that source generation and revokes both provisional and established leases before awaited cleanup. Live map-entry identity, abort state, generation, pending account mutation and keyed owner are checked after resolver/admission awaits and synchronously at publication, binding, token read, refresh intent/POST and candidate-save boundaries. A rejected provisional lease is removed even when the rejection is busy. Closing/revoking a lease invalidates its initiating refresh continuation and aborts its owned refresh signal; an already authorized POST is not replayed or described as remotely rolled back. A busy read during admitted idle refresh is denied without revoking that same still-live refresh lease. Atomic outer idle admission remains required and does not replace these lifetime checks.

`getSourceSnapshot(SourceRef)` is a required synchronous trusted source-authority snapshot for enrollment's final commit guard. The awaited resolver refreshes source facts before save; the final synchronous guard checks exact source revision/identity/eligibility and owner/attempt/deadline. Absent/stale/throwing/thenable snapshots fail closed. Store guarded enrollment prepares/encrypts/writes/fsyncs/CAS-checks asynchronously, then calls `authorityGuard` (strict synchronous `true`) and performs final atomic rename plus memory publication without await/event-loop interleaving. Production uses `node:fs.renameSync`; custom filesystem adapters must explicitly inject synchronous `finalizeRename` for guarded writes and cannot accidentally bypass their adapter with the production finalizer. Invalidation before this point saves no enrollment; cancellation after it suppresses stale attempt UI/leases but preserves the completed enrollment. No compensating deletion is an authority boundary. Unobserved disk edits cannot be detected atomically by an in-memory snapshot; later selections and token reads independently re-resolve both identities, preventing an old grant from authorizing a changed source.

Flow's main-only metadata continuation additionally accepts `reviewedDestinations` (exact URL strings) and `discoveryContext` (shared deadline/read/byte counters), with a retained private challenge. A pending ResourceReview contains one opaque `pendingDestination:{id,url,purpose:'metadata'}`. ReviewDestination binds that exact URL/purpose to the existing source/owner/attempt/review; resuming never resets the metadata budget. The renderer sees only the existing safe opaque choice/origin. `networkFactory({purpose,url,limits})` returns a separately owned reviewed network; only disposable fixtures set the trusted function's `allowInsecureLoopback=true` property and still restrict all requests to explicitly created 127.0.0.1 origins. This property is not an IPC option. These clarifications add no renderer command, secret surface or external provider prerequisite.

DiscoveryAuthCommand is the following exact discriminated union; unknown fields are rejected, identifiers are bounded, source/binding/review digests are64lowercasehex, attempt/choice IDs are unguessable opaque main values:

```ts
type SourceCommand = {taskId:string;sourceId:string;sourceRevision:string};
type AttemptCommand = {taskId:string;attemptId:string};
type Reviewed = {reviewRevision:string;reviewed:true};
type DiscoveryAuthCommand =
 | (SourceCommand & {type:'inspect'})
 | (SourceCommand & {type:'prepare';reviewedEndpoint:true})
 | (AttemptCommand & Reviewed & {type:'reviewDestination';destinationChoiceId:string})
 | (AttemptCommand & Reviewed & {type:'selectIssuer';issuerChoiceId:string})
 | (AttemptCommand & Reviewed & {type:'savePublicClient';clientId:string;callbackPort:number})
 | (AttemptCommand & Reviewed & {type:'begin'|'retrySave'})
 | (AttemptCommand & {type:'status'|'cancel'})
 | (SourceCommand & Reviewed & {type:'forget';bindingRevision:string});
```

No command accepts URL/header/code/token/scope strings. Store/owner/source checks derive main facts; renderer cannot choose its owner/root/epoch. Forget targets bindingRevision plus current reviewed source ID; it may remove an orphaned stored grant for that source after configuration changes, but never a different source's record. Local inspect returns a local forget-review digest for an existing/orphaned binding; Forget validates it against the same current record and source.

SafeAuthState contains source ID/revision, finite status, credentialAvailable, bindingRevision when ready/stored, safe origins/template/environment names, bounded approved scope labels, opaque issuer choices/reviewRevision/attemptId, deadline, capability booleans and fixed reason text. Never any private path/header/registration response/provider error/client secret/token/state/code/verifier. Dedicated `musebench:discovery-auth` IPC validates trustedSender and exact bounded union; `musebench:discovery-auth-update` carries only task/source invalidation IDs. Do not add these commands to native-control actions/MCP. Preload/types/preview use the same contract.

Status transitions: not-configured -> discovering -> issuer-review/review-required or registration-required -> waiting-browser -> exchanging -> saving -> ready. Additional states: refreshing, scope-review-required, needs-sign-in, storage-unavailable, save-recovery, cancelled, failed, forget-review. Local status never polls provider. Sign-in success clears source execution consent; user explicitly reselects/reviews before Connect. It starts no native session/search/model turn. Unknown account identity copy is Signed in on this device; no guessed email/name.

Prepare authorizes bounded unauthenticated resource discovery only. If a challenge points PRM at another origin, stop before fetch and return a safe destination choice/review digest; reviewDestination authorizes that metadata read without registration/browser. Each subsequent new metadata origin is likewise reviewed before first request; selectIssuer authorizes metadata reads for one displayed advertised issuer. Begin approves registration/browser for the exact metadata digest/resource/scopes/callback and reviewed registration/token destination origins. Scope step-up may use a privately retained challenge from the same source, but cannot be launched by model/tool error; user initiates new review. Explicitly review offline_access if requested; no SDK implicit widening. Active source connections must disconnect/cleanup before account mutation/forget. Busy/in-flight native work prevents mutation; changing selected task/root invalidates attempts without claiming remote effect rollback.

Forget removes this app's saved grant after source lease invalidation, never claims provider revocation, CLI logout, DCR deletion or browser sign-out. A protected unreadable envelope is preserved; no routine command silently resets the whole store.

## Runtime/broker integration and no replay

Extend the remote adapter options with `readAccessToken?:()=>Promise<{token:string,expiresAt:number|null}>`. It supplies minimal SDK `{token:...}` only, no onUnauthorized/full provider/middleware; onInsufficientScope remains throw. Missing/expired token fails before downstream submission; valid token is sent solely to the reviewed resource. Configuration Authorization conflicts are rejected before adding the hook. No token is persisted in a source definition or gateway environment.

`prepareConnection` resolves selection/binding and refreshes before native session creation if needed. An unexpired opaque token lacking trustworthy expiry may be used until rejected; never parse unverified JWT identity. `prepareTurn` runs before native turn submission, with no active source request and a lease gate preventing concurrent use. It may refresh the same reviewed enrollment with no browser fallback; invalid_grant goes to needs-sign-in. No timer/browser activity on app startup or inspection. A long turn may expire and fail closed rather than refreshing from an effect dispatch.

Each private AuthLease maps admitted source IDs to `{sourceRevision,authSourceIdentity,authBindingRevision}` plus its captured main-only account generation and binds keyed runtime owner/root/connection/session. verifyLease re-resolves current execution revision/eligibility and recomputes the durable identity, then rechecks that exact lease remains live after awaits. A different project obtains a new explicitly reviewed lease referencing the same ready enrollment; the previous project's lease cannot be transplanted. Root/overlay changes invalidate a lease without mutating durable enrollment. Endpoint/header/authPolicy changes prevent lease acquisition until a new matching enrollment is explicitly authorized. Selection navigation alone does not replace a still-live runtime owner.

Main factory captures OwnerRef derived by controller/runtime. Main-to-worker bootstrap carries source auth markers; leaseId remains main-only and is derived by the broker, with no credentials in bootstrap. Worker-authenticated `/worker-auth-token` route accepts only `{sessionId,sourceId,sourceRevision,authBindingRevision}` and main derives leaseId. The existing native broker token cannot access it; source must belong to that immutable lease/session. Route performs readAccessToken only, never refresh. Gateway/native/model never sees returned token. Changed owner/source/binding or forget closes lease; token rotation alone changes tokenGeneration, not binding/session identity.

Pre-submission unavailable tokens produce fixed failed/submitted:false receipts with no resource call. After possible effect submission,401/403/404/stream loss/abort/timeout stays unknown, closes the source selection and never refreshes/replays/opens browser. Separate safe auth attention state lets user reauthorize/reconnect, inspect effects and deliberately request another approved operation. Native denial sends zero resource calls, even with valid credentials. Local socket cleanup does not prove remote effect cancellation.

## Acceptance and completion

Use actual disposable current2026-07-28-only and supported legacy HTTP/POST-SSE resource servers plus local authorization endpoints. The resource accepts only tokens minted by the tested PKCE authorization flow; pre-seeding bearer fixtures is not OAuth acceptance. Explicit test-only local HTTP policy/injected opener never enters product IPC.

Prove DCR/preregistration/CIMD selection and missing-client-ID setup; one-use callback/PKCE/issuer/resource/scope checks; separate metadata origins/header isolation; correct expansion/raw+resolved revision invalidation; project/root/overlay-only execution changes revoke old leases while retaining enrollment and allowing fresh reviewed lease without new browser sign-in; canonical global settings/native profile location changes and endpoint/header/authPolicy/global source ID changes require new enrollment; encrypted storage restart/update continuity and failed-write/unknown-schema/symlink limits; refresh intent crash recovery/rotation/save retry; once-only arbitrary effects with401/403/drop; owner/source/cancel/forget races. Scan every safe UI/history/report for fixture secret markers. Test actual Electron45 safeStorage with fake secrets in isolated userData, not only fake crypto unit tests.

Exercise full shared preview/Electron controls at390px and1280px; real pinned Muse with scripted localhost Responses approved/denied OAuth-backed calls; exact ASAR worker/private broker/credential store loading; native identity restore and preserved unsupported auth recovery; confirmed callback/socket/process cleanup after source/auth failure and child restart. Native fixture cap60s per scenario,32 scripted Responses requests,1MiB Responses body,2000 native notifications. No real model/provider inference or personal authorization.

Run focused regressions, full unit suite, production build, source/shared UI/native/package acceptance; record exact immutable source/dependency SHAs and honest fixture/live boundaries. Parent independent review and release acceptance remain separate. No provider sign-in/tool compatibility is claimed from local proof.

## Production prerequisites and primary sources

No external account blocks implementation/local acceptance. A provider lacking usable DCR may need a preregistered public client ID/admin approval or a real publisher HTTPS CIMD with accepted callback. None is supplied here; show exact actionable setup, do not fabricate one. Entitlement/TLS/network/PKCE/public-client requirements remain provider-specific. This spec intentionally chooses conservative saved-grant identity and no confidential-client/DPoP support; those are not unresolved design questions.

- [MCP current version](https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning), [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration).
- [Client2.4.0 registry](https://registry.npmjs.org/@modelcontextprotocol%2fclient/2.4.0), [public exports](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v2.4.0/packages/client/src/index.ts), [OAuth helper implementation](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v2.4.0/packages/client/src/client/auth.ts), [typed OAuth errors](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v2.4.0/packages/client/src/client/authErrors.ts).
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage); pinned local Electron45 declarations verify async APIs. Existing app atomic-store pattern: electron/code-billing.mjs.
- [Official redirect-leak advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6prh-2h8m-c8cw). Native1.4.4 URL/header expansion was independently verified by parent and is part of the reviewed remote dependency.


Task3 actual-native clarification (parent ruling, 30 October): pinned Muse registers session MCP during session/start but may launch its gateway only on first tool demand. Add trusted main-only `AuthLease.bindSession(actualNativeSessionId)` after adapter.open, authenticated session/read and provesAskMe succeed. Check native epoch/owner immediately before and after its await; no turn starts before successful binding. An early/eager authenticated bootstrap remains valid; both paths are idempotent only for the exact same ID and reject disagreement, including known resume identity. Tokens remain unreadable before binding. Cost: one private lease method; no renderer-supplied session authority and no wait on a lazy startup path.


Task3 enrollment replacement correction (parent ruling, 30 October): only the latest matching sourceId/authSourceIdentity binding may prepare, verify, refresh or read credentials. A successful atomic new-enrollment commit marks older matching grants reauthorization-required and removes their reusable access/refresh tokens while retaining metadata for explicit Forget. Other source/identity records remain unchanged. Failed save/authority preserves all prior bytes and usability; same-binding refresh preserves its marker. Restart and Forget-latest must never revive older tokens. This bounded correction was exposed by actual native old-marker acceptance; OAuth is unreleased, so no migration is inferred.

Task3 observed-authority correction (parent ruling, 30 October): serialize private factory inspections with failure recovery and immutable effective-environment snapshots. A private digest of observed global file/provenance/profile, referenced environment, global review and plugin facts invalidates all root snapshots on a changed observation; every gateway resolution participates. Root/overlay changes still require fresh execution review and preserve matching durable enrollment. No private digest/paths/values enter rows, and unobserved filesystem changes are not claimed atomically detected. Delayed inspection, cross-root revocation, changed environment and failure-recovery tests cover this publication boundary.


Task3 terminal-status correction (parent ruling, 30 October): capture the interactive attempt once before asynchronous source inspection and recheck exact active-attempt identity after every await. A captured failed/cancelled disposition is preserved only for the same selected owner and current synchronous source authority; stale authority projects current local safe status. Never invalidate a replacement attempt. Successful durable Forget clears only its own captured disposed attempt. Held-resolver regressions cover failure during inspect/status, replacement, cancellation, owner/source changes and Forget; fixed provider error projection and zero network retries remain unchanged.


Task3 correction round1 private mutation admission (parent ruling): replace the asynchronous `stopSourceLeases(sourceId)` service hook with required trusted synchronous `admitSourceMutation(sourceId)`. Main first checks source-wide controller busy authority across all contexts, then factory admission synchronously checks existing dispatch/idle ownership and reserves the source. Return `null` for a busy refusal or exactly a non-thenable object with own callable `{stop,release}`; absent/throwing/thenable/malformed authority fails closed. Begin derives this source only from its captured attempt ID and selected owner, never renderer fields. Obtain reservation before source lookup/Forget summary or any source-blocking mutation flag. A refusal changes no source gate, generation, lease, in-flight request, browser or exchange. Begin busy projection preserves its current attempt rather than disposing it.

An admitted reservation blocks new source factories, native dispatch and idle-turn admission synchronously across awaits. Factories capture a per-source admission epoch before their first canonical-path await and reject changed epochs even after reservation release. At the validated stop boundary, service increments account generation and revokes established/provisional leases, then awaits reservation.stop(); the factory invalidates captured registered/provisional owners synchronously and awaits their existing cleanup. Stop has no later busy-refusal check: cleanup failure remains an accepted mutation with revoked authority and honest failure, never restoration of old leases. Service releases the reservation in finally. Existing held-resolver, close-during-refresh and synchronous effect/publication guards remain required. Cost: one private reservation interface and ephemeral admission epochs; no public IPC/API/dependency change.
