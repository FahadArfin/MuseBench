# Model settings implementation plan

> Use superpowers:executing-plans task by task.

**Goal:** Make requested versus observed native settings clear in the composer and commands.

**Spec:** `docs/superpowers/specs/2026-10-29-model-settings-design.md`

### Task 1: Shared provenance and compact controls

- [x] Add failing tests for evidence-gated model status and requested-only effort.
- [x] Implement the shared presentation helper, composer status/menu and command dialog using the existing runtime evidence.
- [x] Preserve idle-only settings mutations and disable active selection while allowing status inspection.
- [x] Verify component browser/Electron behavior, build, relevant runtime regressions and full suite.
- [x] Independent review, fix findings, record evidence, commit and push.

### Task 2: Published acceptance

- [ ] Verify exact release and installed sources/UI separately from source checks.
