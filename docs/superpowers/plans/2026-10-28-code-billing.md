# Muse Code billing implementation

Spec: ../specs/2026-10-28-code-billing-design.md. Execute inline within the user's existing implementation and push authorization.

1. Align the pinned SDK/host/schema with installed Muse 1.4.14; verify exact handshake, echo transport and compatibility tests. Keep historical evidence annotations unchanged.
2. Add a main-process billing-source service with safeStorage-protected API credentials, official account/usage probes and allowlisted purchase destinations. Test privacy, busy switching, no fallback and failed persistence before implementation.
3. Wire credential environments into Code runtimes and model discovery, close idle Code connections on explicit source changes, and guard queued/active work. Existing Work/Sites services keep their original credential policy. Test both native transports and retained conversation IDs.
4. Add compact Overview billing-source controls and a Plans tab. Add Meta checkout windows and API payment entry points. Share components with preview, clearly mark sample data, and display route-specific usage and sync provenance.
5. Validate unit suite, TypeScript/build, preview and isolated desktop behavior. Save research findings on native skills/rules and community projects. Review the diff, commit and push the feature; report CI/build separately from local verification.

Review focus: API secrets never enter app snapshots/logs/argv; source changes cannot reroute running work; a delayed usage response cannot relabel another source; unsupported native account/allowance remains unknown; opening checkout is never reported as a successful purchase.
