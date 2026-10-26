# Sandboxed project commands

The user requested direct Muse project-command execution while keeping the sandbox enabled. Extend the existing native Windows `exec` adapter. Keep the installed version pin, Ask me profile, configuration checks, curated environment, run/output bounds and authoritative completion checks. Never fall back to an ordinary host shell or disable approval/sandbox enforcement.

The selected approach is Muse's managed platform shell, enabled by omitting `--disable-shell`. It uses the native sandbox and permission policy. A separate host command bridge would add an unsandboxed execution path, and the existing Windows `serve` adapter remains unavailable. If the managed shell needs a supported compatibility setting, prove it against the actual installed build before selecting it. Preserve failures rather than silently switching execution methods.

Show bounded native shell results distinctly from agent prose. A native tool outcome is not a MuseBench project-check pass; the existing inspected revision, explicit check and acceptance gates stay intact. Headless approval requests stop without automatic approval. Each prompt remains an independent bounded run.

Before enabling the feature, verify actual sandbox identity, correct working directory, an inside-workspace project test and an outside-write refusal using disposable fixtures. Investigate command cancellation/descendant lifetime. Unsupported commands and native sandbox problems must be actionable and visible. Preserve user's active project/data during packaging and app restart.
