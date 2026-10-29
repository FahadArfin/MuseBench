# MCP request metadata compatibility

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the workspace gateway accept standard MCP request metadata, including Muse's call correlation, without changing its navigation permissions or bounds.

**Architecture:** Accept the optional `_meta` object on `tools/list` and `tools/call`. Treat metadata as opaque transport context; never merge it into tool arguments, forward it to the semantic worker, echo it in results, or interpret it as authorization. Preserve the existing closed argument schemas, fixed root and frame/queue/result limits.

**Tech Stack:** Node.js/Electron, JSONL MCP, built-in test runner, existing TypeScript semantic worker.

**Spec:** [Workspace MCP contract](../../WORKSPACE-MCP.md), [MCP request schema](https://modelcontextprotocol.io/specification/2025-11-25/schema#calltoolrequestparams), and [Muse 1.4.9 release notes](https://dev.meta.ai/docs/muse-code/changelog) documenting `_meta.callId` on every tool call.

## Global constraints

- No model request is needed to reproduce or verify this wire-format defect.
- Metadata is untrusted and provides no execution or path authority.
- Reject a present `_meta` that is not an object; preserve all other request and argument checks.
- Do not claim model-issued tool acceptance from direct protocol tests.
- Use the already authorized main/preview/release flow, preserving the running profile.

## Review focus

- Metadata cannot override the root, operation, command, path or arguments.
- Absent metadata and ordinary clients retain compatibility.
- Malformed and oversized metadata preserve existing failure/cleanup behavior.
- Native-style calls work under both Node and Electron Node mode.
- Neither a valid metadata envelope nor a successful direct call establishes native model use or dynamic tool registration.

## Task 1: Accept opaque request metadata

- [ ] Add regression cases in `test/workspace-mcp.test.mjs` for discovery, search, invocation, malformed metadata, isolation and frame limits. Add native-style metadata to real Node and Electron subprocess navigation checks.
- [ ] Run the focused suites before editing production code; require metadata-bearing requests to reproduce `-32602`.
- [ ] Make the minimal envelope change in `src/runtime/workspace-mcp.mjs` and rerun those suites.
- [ ] Extend `scripts/workspace-mcp-probe.mjs` with discovery/search/navigation metadata and an explicit verified flag. Update `docs/WORKSPACE-MCP.md` with the evidence and remaining limit.
- [ ] Run the native zero-model registration probe, build, full test suite, and fresh review. Commit and push the verified fix.
- [ ] Await terminal CI/release, verify and install the exact artifact, reopen, and validate native health. Preview continues using the shared source.

Further model acceptance is a separate prepared experiment requiring a new explicit usage budget; the previous 12-run allowance is exhausted.
