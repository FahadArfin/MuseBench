# Task 2 fix round 1 scoped review

Reviewer /root/code_relations_ui_rereview, base6675fdc head32b72c3.

Both original Important findings ADDRESSED: related transcripts use actual messages, preview14/Electron13 cover side forks; snapshot-owned index/cache and memoized projection replace repeated scans, helper28/28 covers mixed graphs/scale. Deferred minor backlink ADDRESSED naturally: sides use final main and forks direct provenance.

New Important breakage at App.tsx:478: legitimate manual initial requests disappear from forks. App.tsx378-386 manual submission stores initial request only in task.request (controller443), while fork copies only original.messages. Blanket !task.chatRelation condition hides genuine initial request retained outside messages; a source displaying its request can fork to a view with no user prompt. Preserve real initial-request identity while excluding side placeholders; add actual manual-source fork regression.

No out-of-scope findings. Evidence/diff and named callsites inspected, no tests rerun/files changed. Fix round remains open for the new transcript regression.
