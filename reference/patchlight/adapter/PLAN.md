# Muse adapter implementation plan

Goal: add an isolated credential-free adapter boundary for the verified Muse CLI session protocol; preserve every existing prototype artifact.

Architecture: a product adapter consumes the official SDK Connection interface from a separately owned, initialized host. A small SDK bridge owns startup and closure when explicitly invoked later. Contract tests inject a fixture connection; no downloaded code is executed. Review evidence stays product-owned and revision-bound.

Spec: the user's continuation request and `../docs/HANDOFF.md`. User authorization covers this bounded implementation; no additional design approval is needed. No installs, login, keys, model calls, original-app edits, publish, or outreach. No git repository is initialized or modified.

1. [x] Pin source evidence and test compatibility rejection. Create `compatibility.mjs`, `test/compatibility.test.mjs`; check SDK/host versions, schema version/fingerprint, sandbox availability. Test the unmodified official transcript's mismatched fingerprint honestly.
2. [x] Test then implement `session-adapter.mjs`. Use verified Connection `command`, `request`, notification/request/error callbacks. Start one session; submit one turn; normalize streamed messages; separate acknowledgement from completion; reject uncertain, malformed and foreign outcomes; no automatic retry or approval.
3. [x] Test then implement `review.mjs`. Plan version, revision-specific preview/check evidence, explicit local acceptance. Agent text cannot set test outcomes; new revision invalidates evidence.
4. [x] Test then implement `sdk-bridge.mjs`. Default unavailable without explicit invocation authorization and injected SDK; pin preflight, bounded handshake/cleanup, sandbox gate, host-exit propagation. Do not install/import unknown packages or spawn Muse here.
5. [x] Provide an offline fixture demo, evidence matrix and home setup steps. Run the full adapter suite and original UI suite. Package separately as v2, retaining the original delivered files.

Review focus: stale fixture fingerprints; side effects before a refused compatibility check; duplicate events; acknowledgements mistaken for completion; arbitrary agent prose mistaken for evidence. Use a fresh review after tests per executing-plans skill; findings must be addressed or documented.

Ruling: the original standalone visual spike remains untouched. This boundary is not wired into that HTML because doing so would imply live transport support the environment cannot exercise.
