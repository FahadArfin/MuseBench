# Coding workspace implementation plan

**Goal:** Deliver the requested Codex/Claude-style coding experience in the existing MuseBench Windows app.

**Architecture:** Keep the Electron security boundary and Muse runtime. Add task-history actions to the controller, isolate the existing review/connection components, and replace the renderer shell. Persist appearance independently from task evidence.

**Tech stack:** Electron 45, React 19, TypeScript, Vite, SQLite, existing Lucide icons.

**Spec:** ../specs/2026-10-25-coding-workspace-design.md

## Constraints and review focus

Keep sandbox enabled; retain exact-revision gates and explicit sends. Preserve saved data. Test project/task switching, stale revision evidence, restart recovery, keyboard focus, cancellation access and responsive overflow. Use react-markdown 10.1.0 and remark-gfm 4.0.1 for safe Markdown/code rendering, without raw HTML or remote image loading. Workspace is not a Git repository; reversible source backups are under artifacts/redesign-baseline.

## Tasks

- [x] Add durable task summaries/project association, safe selectTask, and conservative legacy recovery in controller/types/IPC; test restoration and evidence invalidation.
- [x] Extract existing review and runtime panels into focused components, retaining all permission and review behavior.
- [x] Build dark desktop shell, sidebar/chat history/search, conversation/composer, command palette and responsive review panel.
- [x] Implement persistent settings and functional Customize prompt starters.
- [x] Verify controller/unit tests, build, existing tutorial and additional Electron interactions; independently review code and compare rendered references.
- [x] Package the exact verified application, run packaged workflow checks, record evidence and reopen normal user application.

Execution uses independent agents for controller, panels and research while the parent implements the shell and integrates. User supplied the visual direction and authorized the implementation; routine reversible choices proceed without extra approval.


