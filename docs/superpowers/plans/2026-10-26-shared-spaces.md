# Shared Spaces implementation plan

**Goal:** Native collaborative spaces for pages and Work artifacts, with a real local testable hub and deployable HTTPS service.
**Architecture:** Independent SQLite hub, main-process client and encrypted credentials, React native UI. Reuse validated artifacts and private Work generation; never reuse provider authentication for collaboration.
**Tech stack:** Existing Electron, React/TypeScript, Node HTTP/SQLite. No new package dependency.
**Spec:** ../specs/2026-10-26-shared-spaces-design.md

## Global constraints

Preserve private Code and Work state, login partitions and sandbox. Explicit publish only. No cloud availability claims. Roles enforced server-side. No silent overwrite. Main-process client only.

## Review focus

Cross-space access, revoked token caching, stale editor drafts during polling, server restart origins, shared artifact copying without private sources.

## Tasks

- [x] Hub store/server: tests first for memberships, invite lifecycle, revisions, comments, role enforcement, concurrency, durability; implement bounded authenticated HTTP and standalone hosting command.
- [x] Main client/integration: encrypted membership vault, validated invite/HTTPS endpoints, bounded timed requests, safe snapshot state, local hub, IPC and lifecycle. Add explicit artifact publish/private-copy path.
- [x] Native Spaces UI: sidebar, create/join, pages, members, comments/history, roles, unsaved conflict state, refresh, responsive layout. All mutations explicit.
- [x] Verify two-client service and packaged UI workflows, preserve private state and sandbox, independent code review, build/package, reopen and document exact evidence/hosting limitation.
