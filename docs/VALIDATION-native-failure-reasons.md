# Native terminal failure explanations

Validated on 29 October 2026 with Muse SDK/host 1.4.14 on Windows.

## User-visible change

A failed interactive request now keeps the explanation supplied by Muse. Open its **Failed** activity row, or its details in **Sub-Agents**, to see why it stopped. Previously, the adapter set the terminal reason to `null`, so useful required-MCP startup diagnostics disappeared before the controller could save them.

The explanation is retained with the saved request. An explicit new request clears the previous live reason; a completed request cannot inherit stale error text. No automatic retry, provider request, permission change or server restart was added.

## Diagnostic boundary

Only a nonempty string from `reason`, falling back to `error.message`, is used for failed or cancelled turns. Arbitrary error objects, stacks and retry flags are not copied into run state. The text is bounded, control characters are removed, common credential assignments and authorization values are redacted, and URL user information, query strings and fragments are removed. This is defensive display filtering, not a guarantee that arbitrary upstream prose cannot contain private information.

The existing activity UI renders the explanation as plain text. Exec diagnostics reuse the same formatter while retaining their established authentication and billing guidance. Native outcomes, ownership checks, replay guards and queue failure behavior remain in their existing paths.

## Native receipts

Seven cases used fresh isolated profiles/workspaces and the official local `echo` provider. The probe checked the actual `session/read` provider identity before each turn. No account credentials were copied and no Meta inference requests were made.

| Case | Native result |
| --- | --- |
| Required session server with missing command | Failed turn: configured command unavailable |
| Optional session server with missing command | Echo turn completed |
| Required session server rejecting initialization | Failed turn: initialization failed |
| Required project server with missing command | Failed turn: configured command unavailable |
| Required project server exceeding its one-second startup timeout | Failed turn: server did not respond during startup |
| Optional project server with missing command | Echo turn completed |
| Project/session server name collision | Session creation rejected with `session_mcp_name_conflict`; no turn submitted |

Every host exited and every fixture server process was gone. The collision case had already confirmed cleanup during failed connection setup; a later idempotent disconnect reported `not-started`, with host exit separately observed. Both states are retained in the local report.

The six submitted turns used the native protocol directly after the provider check. This proves these native startup outcomes; it does not claim a model selected or called an MCP tool. Configuration inventory still does not prove server health. The local report and fixture are in `artifacts/mcp-startup-native/` (ignored); temporary audit folders are retained.

## Regression and UI validation

The initial regressions reproduced the dropped reason through the adapter and runtime. Coverage also checks malformed fields, redaction, bounded text, terminal outcomes, duplicate notifications, no automatic replay and next-request reset. A controller test closes and reopens the saved chat and verifies the explanation and failed outcome remain.

`npm run test:native-failure` exercises the same production renderer in browser preview and isolated Electron. Both show the explanation in the conversation and Sub-Agents, preserve it across fixture reload, render script-like text inertly, and wrap it without horizontal overflow at a 520-pixel viewport. The fixture does not access a real account or submit a provider request. The validation workflow runs both variants.

Adapter/runtime/controller tests establish persistence and lifecycle behavior separately from the UI fixture. Full-suite, production build, review and release receipts are recorded with the delivery commit; a fixture screenshot alone is not native model acceptance.
