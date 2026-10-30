# Native context usage

The pinned official SDK 1.4.14 exports `SessionContextUsageParams` and `SnapshotState.contextUsage`. MuseBench previously ignored both and displayed blanket unavailable text. The new projection uses only admitted events and supported anchored snapshots, not cumulative billing usage or a model-name limit lookup. [Official event contract](https://meta-models.github.io/muse-code-sdk/next/generated/msp/notifications/session-contextusage/) explains the occupancy-floor semantics; the installed pinned declarations were inspected independently of the rolling documentation.

One normalized reading is retained per owning chat. Missing/invalid counts do not become zero, optional windows stay unknown, pressure uses only the native vocabulary, cursor conflicts stop admission and obsolete connection callbacks are ignored. Saved readings remain stale after restart or reconnect without evidence. The durable chat row wins over an older app snapshot after an interrupted write.

## Verification

- Initial RED: eight failing feature checks for absent projection and normalization. GREEN: 217 focused normalizer, adapter, runtime and controller tests. Lower/over-window counts, replay conflicts across turns, buffered opening events, anchored restore, malformed/foreign readings, disconnected/old callbacks, deleted chat successors and crash recovery are covered.
- Floor rounding regression: a 1/6 occupancy floor must display 16.6%, not round upward to 16.7%. RED/GREEN recorded.
- Shared preview RED: Context chip absent. GREEN: six checks including connected, saved, unavailable, unknown-window and over-window states, history, keyboard/narrow layout and chat isolation.
- Source Electron GREEN: five checks with isolated profile and blocked external network; saved native reading, exact window, pressure, bounded meter, guarded compaction, history and narrow layout. Reviewed `artifacts/context-history/desktop-twqait/context-usage-narrow.png`.
- Full source suite: **1,678 passed, one pre-existing optional skip**; production TypeScript/Vite/native bridge build passed. Existing bundle-size warning remains. No new serial CI stage; the existing chats group runs the expanded shared smoke.
- No provider inference, billing, permissions or personal account changes. Event/snapshot injection proves projection and ownership, not live provider acceptance. Exact release and installation acceptance follows review.

## Decisions

The prior completion audit was too broad: native occupancy is already supported. Retention configuration and background-summary replacement remain separate research prerequisites. Native reasoning-effort reporting is the next audit, not included here. Preview uses the shared implementation with explicit fixture data; normal preview startup does not invent a native reading.

Review and correction evidence is preserved under `.superpowers/sdd/2026-10-30-native-context-usage/` in the attached worktree.
