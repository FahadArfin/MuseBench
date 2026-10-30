# Native tool contract verification

Continue OC03 under the user's standing implementation authorization. Fresh offline schema export and isolated settings inspection on Muse 1.4.14 still expose no native deferred-tool search/call or context-retention setting. The direct Meta API supports tool search, but changing the execution backend would not preserve native permissions and sessions. Those parts remain open.

An isolated scripted local Responses endpoint exposed a concrete model-selection defect: native `model/list` legitimately returns `configCatalog`, which is present in the pinned SDK enum, but MuseBench rejects it. Accept this source with the same provider/profile/model/effort validation as the other admitted sources. Preserve the source in the projected catalog and continue rejecting fake, unresolved and unknown sources. This does not create a provider picker, edit settings, or change credentials.

## Approach

Use a credential-free, loopback-only scripted endpoint to drive the actual pinned Muse executable and app runtime. A temporary profile declares the exact fixture model and endpoint with auth none; no personal settings, login or permissions are read or changed. The scripted response is test data, not model inference. Prefer this over a paid model probe for reproducible protocol and approval checks. It does not prove a real model chooses the tools or that arbitrary third-party schemas can be deferred.

The acceptance runner must use the production connect/send/one-time approval path, the real app-owned workspace MCP process, and a tiny temporary TypeScript project. Verify search, definition resolution and a bounded analysis batch through observed native tool receipts and returned outputs. Verify an explicitly denied fixture call does not execute. Match exact fixture session, tool, call and arguments before approving once. Never grant persistent access. Observer requests, if any, receive a scripted no-reminder decision only when that exact tool is declared. Bound requests, output, time and cleanup; unknown routes or tools fail the test.

The native probe also exposed `toolCall.status: rejected`, which the workspace activity projection had classified as an interruption. Project that exact status as a failed activity with “Tool request was not approved.” Do not infer a refusal by parsing arbitrary tool-output text. The denial check requires the native rejected item and the matching provider-bound denial output; successful parent completion is not tool success.

Keep the shared model picker unchanged in layout, and exercise the configured catalog in the browser and Electron checks. Record native host proof separately from scripted provider behavior and live Meta acceptance. Refresh the roadmap's stale release labels using existing exact delivery records without promoting fixture checks to personal provider acceptance.

## Acceptance

Regression tests must first reproduce configured-catalog rejection and retain all existing filters. The native runner must fail for missing/failed tool receipts or unconfirmed shutdown; a completed parent turn alone is insufficient. An independent review covers catalog scope, local endpoint containment, approval matching, no replay and evidence wording before commit/push. No paid requests are authorized.
