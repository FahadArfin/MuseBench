# Controller progress delivery measurement

Local Windows / Node 22.14.0, synthetic injected runtimes; no model requests or external services. Run `node scripts/benchmark-events.mjs` from the repository root. The script creates four disposable projects and four concurrent tasks, emits 200 progress snapshots with 60 messages per task, and observes serialized controller updates. Each retained message is about 1.1 KB. It then emits all four terminal states and verifies the last task remains readable.

| Condition | Burst processing | Published snapshots | Serialized state bytes |
| --- | ---: | ---: | ---: |
| Before, commit 9346d57 (one run) | 11,443 ms | 204 | 31,864,455 |
| Coalesced progress, run 1 | 332 ms | 4 | 633,868 |
| Coalesced progress, run 2 | 342 ms | 4 | 633,868 |
| Coalesced progress, run 3 | 326 ms | 4 | 633,868 |
| Final lifecycle-aware implementation | 341 ms | 4 | 633,868 |

The benchmark identified redundant full-task persistence, repeated history metadata changes, repeated identical execution-receipt writes and full-state publication. The implementation coalesces replaceable running-state progress for at most 40 ms when the event loop is available. It retains only the latest task state, not an unbounded event queue. Native input acceptance, activity identity/status, pending input, terminal/cancellation, explicit actions and shutdown flush immediately. Source message text still enters the durable history store as it arrives. Reconnection reads authoritative full state.

The general suite initially caught missing immediate persistence for input acceptance and activity lifecycle during batching. Both were corrected; their existing restart tests now pass. New regressions cover burst coalescing, immediate final output, source history, periodic delivery and pending approval.

Limits: one pre-change sample, local filesystem/cache effects and a synchronous synthetic burst. This is not a model speed/quality result, a renderer event-to-paint measurement, an RSS bound, or proof of native-host throughput. The shared renderer still needs real-user profiling before timeline virtualization or a frontend rewrite is justified.
