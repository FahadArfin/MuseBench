# On-demand MCP tool discovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose reviewed disabled global stdio tools through a bounded native-approved search/invoke gateway without duplicate direct processes.

**Architecture:** Main-only safe source inspection and ephemeral source-bound consent feed a trusted session gateway. The gateway owns downstream process trees, filtered schema catalogs and exact invocation receipts. Existing native connection/restore guards and shared compact connection controls retain authority.

**Tech Stack:** Node.js, existing MCP SDK1.32.2, Muse SDK/CLI1.4.14, existing Windows job/process ownership, React/TypeScript, browser/Electron fixtures.

**Spec:** `../specs/2026-10-30-tool-discovery-design.md`

## Global constraints

- No model inference/personal credentials/settings/grant changes in tests. No new persistent execution grant in product.
- Four explicitly reviewed disabled global stdio sources maximum; enabled/project/plugin/HTTP/OAuth sources excluded, no silent configuration writes.
- Retain saved native identity and require fresh matching source consent on reconnect.
- Catalog/source maxima:200tools/512KiB, schema32KiB/depth16; search8matches/64KiBencoded; arguments64KiBencoded; output128KiBencoded. Startup<=30s, call<=300s; limits finite and disclosed where capped.
- Fully encoded bounds, exact source/catalog checks, no arbitrary-effect batching/retry/sampling/elicitation/tasks; uncertain downstream effect is unknown, not rolled back.

## Review focus

- A formerly disabled source becoming enabled or acquiring a project/plugin overlay must fail before a duplicate or unreviewed process starts.
- Reconnect/restore must not forget tool-source identity or silently execute without fresh consent.
- Schema/filter/source changes between search, review and dispatch must never execute an old or hidden tool.
- Cancellation, malformed/oversized frames and grandchildren must not leak processes or retry an uncertain effect.
- Tool names/descriptions/schema/payloads are untrusted; do not leak env values or allow coercion, remote refs or unsafe main-loop validation.

### Task 1: Usable reviewed on-demand tool gateway

**Files:** New `src/runtime/discovery-mcp.mjs`, source/transport/validation helpers as needed, `electron/discovery-mcp-config.mjs`, focused `test/discovery-mcp*.test.mjs`, native/packaged/UI smoke scripts and guide/validation docs. Integrate native runtime/controller/factory/API types/IPC, `src/shared/native-session.mjs`, shared `RuntimeDialog` in `src/ui/WorkspacePanels.tsx`, preview behavior and run activity only where required. Keep gateway/source responsibilities separate from controller UI wiring. No release workflow changes except adding the completed focused smoke to its existing relevant validation group if needed.

**Interfaces:** Safe source rows `{id,name,revision,address,cwd,environmentKeys,eligible,reason}` never include private values. Explicit connect selection `{toolDiscovery:{sources:[{id,revision}],reviewed:true}}` is bound server-side to current owner/workspace and consumed for one connection. Factory creates the trusted required sessionMcp configuration; not caller-supplied command/args. Gateway search({query}) returns bounded source/catalogRevision/schema facts; call({sourceId,catalogRevision,tool,arguments}) validates/forwards once and returns source/tool/outcome receipts. Exact internal names must be consistent and exported declarations updated. Runtime revalidates selection on sends and preserves restoration markers.

- [ ] Write failing eligibility/consent/restore tests and protocol tests for filters, malformed schemas/args, encoded limits and source/catalog mutation.
- [ ] Implement source-bound factory and owned gateway transport/validation with actual fixture-server invocations, cancellation, unknown outcome/no retry and child/grandchild shutdown proof.
- [ ] Integrate fresh connection review, saved identity/reconnect guards and compact shared controls; verify no startup during inspection or stale owner selection.
- [ ] Run browser/Electron smoke and actual production native scripted search/call/denial, proving one downstream process and no original direct process. Verify packaged ASAR compatibility in an isolated package or exact extracted bundle environment.
- [ ] Run relevant runtime/controller/native-session/security tests, full unit suite and production build. Record evidence and excluded source types honestly.
- [ ] Commit complete feature for independent review; parent integrates/pushes each completed feature and performs exact release acceptance.
