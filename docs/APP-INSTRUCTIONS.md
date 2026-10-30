# App-saved instruction snapshots

Memory stores personal instructions for future Muse Code requests across projects. Project context → Instructions stores instructions for that project. Saving either setting stays local and sends no request.

Every composed request includes a complete, named version 1 snapshot of both current app settings. Nonempty text is included in full, even if it has not changed. An empty setting gets an explicit empty scope. The snapshot states that it replaces earlier instances of those same app-saved personal and project settings. Clearing a field and saving therefore tells Muse on the next request that this app setting is now empty.

This applies to native continuations, restored chats, fallback conversation context, forks, side chats and queued delivery. Queued prompts use the settings current when they are delivered. An unknown outcome is never replayed automatically. Inspecting “What Muse receives” composes locally without sending anything.

The snapshot does not replace repository instruction files, skills, direct conversational requests, objectives or permission policy. It does not erase native history or guarantee compliance. The app does not infer which instructions survived native compaction and does not keep a new instruction-acceptance database.

The existing request receipt adds a versioned `instructionSnapshot` descriptor with personal/project `included` or `empty` states. Existing SHA-256 fields still identify the exact current saved text without duplicating it. Old receipts remain readable and do not acquire a fabricated descriptor. The context inspector and Session’s last prepared request use the same receipt component in browser preview and desktop.

Prompt and total context limits remain 16,000 and 64,000 characters. Saved personal and project fields retain their existing 1,500 and 4,000 character limits.
