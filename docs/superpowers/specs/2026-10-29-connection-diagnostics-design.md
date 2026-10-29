# Connection and extension diagnostics

Authorized by the continuing roadmap request. No extra approval or provider request is needed for read-only diagnostics and fixture validation.

## Behavior

Connection settings offer a compact diagnostic summary of executable discovery, observed connection/permission state, pending input, recovery and prior completed-request evidence. Disconnected, uncertain and simulated states are explicit. A copy action emits only an allowlisted report: no paths, conversation text, account data, tokens, server URLs or raw errors. Reports state that availability and billing were not probed.

Customize offers a collapsed readiness summary of configured plugins, MCP servers and skill inventory. It distinguishes disabled, invalid, review-needed and configured items; configuration is never called healthy or signed in. Existing review/setup controls remain the recovery actions. No background process, OAuth flow or periodic refresh is introduced.

The session MCP panel keeps its last successful rows while a same-session refresh is pending or fails. Old sign-in facts carry an explicit last-snapshot warning. A new task/session/connection or unavailable permission state hides old rows and invalidates late responses. Only an explicit open or refresh reads inventory; one request may be outstanding for an identity. Server names are escaped text, errors are generic and an unknown state remains unknown.

## Acceptance

Unit tests cover unavailable, uncertain, simulated, known-ready and pending-input state; extension configuration/review counts; and copied-report privacy. Shared browser/Electron checks exercise successful reads, stable rows during refresh/error, retry, stale completion across sessions, duplicate prevention, keyboard/collapse and narrow layout. Existing controller inventory ownership tests remain required. Build and focused regressions precede independent review and publication; installed acceptance is separate.
