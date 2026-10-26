# MuseBench Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Track completed work here.

**Goal:** Deliver a runnable Windows application around the supplied Muse adapter and evidence workflow.

**Architecture:** Electron main process calls a local controller and official Muse SDK adapter; a sandboxed React renderer uses narrow IPC. Sample and real projects share the evidence pipeline.

**Tech Stack:** Electron, React, TypeScript, Vite, Node test runner, SQLite, @muse-code/sdk pinned to 1.4.13.

**Spec:** ../specs/2026-10-25-musebench-design.md

## Global Constraints
Muse only; original inputs preserved; no paid/model calls during implementation; no credentials in renderer or logs; no publish/push/global installs; main process owns operations; checkpoint is local acceptance only.

## Review Focus
1. Concurrent file changes must invalidate preview, check and acceptance records.
2. Malicious paths/symlinks must not escape selected roots.
3. Failed/terminated commands and disconnected runtime must remain explicit.
4. Preview navigation must not acquire main-process privileges.
5. Saved tasks/checkpoints must survive restarts without claiming interrupted work passed.

## Tasks
- [x] Scaffold dependencies, typed bridge contract, and isolated Electron shell.
- [x] Controller: write behavior tests, implement snapshot/diff, SQLite persistence, project/task lifecycle, real test/preview execution and checkpoint gates.
- [x] Runtime: use preserved adapter, inspect official SDK, implement discovery/connect/streaming, request handling if supported, and safe cleanup tests.
- [x] Renderer: project/task flow, original polished visual system, plan/changes/preview/checks/review panels, runtime settings, accessible interactions.
- [x] Integrate, run contract/controller/build/Electron interaction checks, inspect screenshots, fix review findings.
- [x] Produce runnable Windows artifact, quick start and exact validation/limitations record.

## Execution rulings
The supplied handoff is the design basis and the current user request authorizes implementation. Routine reversible choices are being made within that scope. This is a new folder with no Git repository, so no existing branch/worktree needs isolation. Independent implementation tasks use distinct owned paths and a shared API contract.

## Final evidence
The user confirmed Windows desktop. Final local verification: 84/84 Node tests, TypeScript/Vite build, Windows directory packaging, 11/11 source Electron checks, and 11/11 checks against the exact packaged executable. Both independent reviews have no open findings. Artifact hashes and code manifest: ../../../artifacts/validation.json. Native Muse is unavailable here: live auth, host/sandbox behavior and model execution remain unverified. Direct Vite dev preview only; build-output previews are intentionally refused without build provenance. No publish or paid call was made.
