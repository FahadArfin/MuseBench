# Local Muse Code schedules

Open **Muse Code → Scheduled → New schedule**. Choose a project, name, prompt, first run, repeat interval, maximum total attempts and per-run budget. Save, review the complete request and permissions, then explicitly **Enable schedule**.

Saving or editing leaves the schedule paused. Enabled runs use your configured Muse login/billing route. This is separate from Meta AI's hosted Scheduled page.

- MuseBench and the computer must be running and awake. The timer checks every 15 seconds. Occurrences over 60 seconds late are skipped; reopening never launches a catch-up batch.
- Repeat intervals are elapsed time, not calendar rules. For example, every 24 hours may fall at a different local clock time after a daylight-saving change. The first time is entered in the computer's local time zone and saved as an instant.
- Each occurrence gets a fresh Code chat, retaining its own native receipts and history. Your selected chat and drafts stay unchanged. Use **Open current run** or the history arrow to inspect it.
- **Pause** prevents future work while the current run continues. **Stop** targets the current occurrence and pauses future work. Approval/questions, failures and unknown outcomes pause future occurrences for review. Interrupted work is never replayed automatically.
- The selected checkout cannot overlap another active chat or project action. Such occurrences are skipped. Missing or changed project folders stop admission and pause the schedule.
- Standard/Extended/Deep budgets use the existing 3/15/45-minute and 8/32/96-step limits, with an owned controller deadline as well. An attempt counts once claimed for admission, including a connection failure; skipped occurrences do not consume attempts. Limits are totals for the schedule, not reset by editing. Increasing the total requires another explicit review.
- Keep up to 50 schedules and 100 attempts per schedule. The latest 30 outcomes are retained, plus any active occurrence. Removing a schedule removes its schedule history but retains its saved Code chats.

Scheduled connections use the existing native Muse exec transport. Full access is default-off and explicitly reviewable; approval choice remains separate. Workspace-tool opt-in is not enabled by scheduling. Ordinary native permission checks, source capture, model-option validation and execution receipts still apply. No background warming or speculative model request is made.

The browser preview uses the same interface with labeled in-memory configuration. It never executes a scheduled model request. Native MCP can open the Scheduled page for inspection using `navigate` with `target: "codeSchedules"`; it cannot create or enable a schedule.
