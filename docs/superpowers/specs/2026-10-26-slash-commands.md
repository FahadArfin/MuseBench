# Muse Code slash commands

User-approved target: the two supplied Codex composer screenshots. Keep the current desktop app, login and sandbox. Add the rounded, full-composer-width floating command list with small line icons, selected row, descriptions, chevrons, scrolling, and a Skills group. No image assets required; use existing Lucide icons.

Typing / at the start of an empty line opens the picker; filtering, mouse hover/click, Up/Down, Enter/Tab, Escape, submenus and narrow/light layouts work. Recognized commands are handled locally before chat submission; unknown slash commands show guidance and are never accidentally sent to the model. Paths and URLs in normal prose are unaffected. Choosing a skill creates an editable prompt, never an automatic request.

Native actions include reasoning, approval access, optional plan mode, low-effort fast preset, new/resume/search/side/fork chat drafts, changes/preview/checks, settings/theme, connection/status/usage, copy/export/rename, persistent per-chat objective, app memory instructions, and real installed Muse skills. Side/fork creates a separate draft with bounded copied context; no parallel or ephemeral-runtime claim. Goal instructions persist across requests; no autonomous background-run claim. Usage errors are shown honestly. Model display uses actual runtime identity and explains that this validated connection uses the provider default.

Provider-/terminal-specific features are searchable entries with precise capability explanations, not fake toggles or raw slash text passed into exec. Do not change the validated process arguments, runtime sandbox, web authentication, or native helpers. New CLI information calls are read-only, fixed argv, bounded, hidden, and never run a shell. New controller actions are validated and idle-only.

Approach: a data-driven command catalog/parser, a focused React palette, existing app actions, a small native command-info service, and durable goal/memory fields. Avoid separate implementations of existing settings.
