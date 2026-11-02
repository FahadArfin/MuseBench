# Session tools research

Reviewed official documentation on 2026-11-02. The supplied screenshot is the visual target; these sources informed the feature choices.

- [Claude Code Desktop](https://code.claude.com/docs/en/desktop#see-session-details): a compact session details rail groups changes, running work and context. Its terminal/browser/file panes support focused inspection without leaving the session. Adopt the rail and reuse MuseBench's existing change, check, source and Sub-Agents views.
- [Claude side questions](https://code.claude.com/docs/en/desktop#ask-a-side-question-without-derailing-the-session): its side chat can read the main conversation and does not add replies back. The user explicitly chose a different boundary here: project access with a separate conversation, discarded on close.
- [Codex integrated terminal](https://learn.chatgpt.com/docs/integrated-terminal) and [Browser](https://learn.chatgpt.com/docs/browser): keeping project tools alongside the conversation reduces context switching. Add an internal browser and project Terminal/VS Code shortcuts, using existing app launch discovery.
- [Cursor Agent](https://cursor.com/docs/agent/overview#checkpoints): checkpoint inspection is useful when trying changes. Expose MuseBench's existing checkpoint view; retain its explicit restore controls. No automatic rollback or Git writes are added.

Chosen additions: Images with truthful upload/run-capture provenance; temporary read-only side chat; Browser; quick context/source, output, check and checkpoint access. The current runtime exposes live command observations but not a complete OS background-process inventory, so the rail names observed commands honestly and lists the actual managed project preview/check processes separately.

Deferred rather than simulated: arbitrary shell input embedded in the rail (Terminal opens the real project terminal), GitHub PR/CI monitoring (needs explicit repo/auth and refresh policy), agent-controlled general browser automation (this browser is a user-operated view), and model image generation (the gallery displays existing generated files and uploads, not a new paid generator).
