# Spaces upload rejection reliability

The history-storage release for `52756b096252e42334f01ec75e548f2a930d73f0` exposed an existing Windows transport race in the Spaces hub's oversized-request test. The same failure had occurred during the earlier motion validation. Storage code did not touch this path.

## Diagnosis and correction

The hub wrote a `Connection: close` error and immediately ended the response while the client was still sending an oversized body. A 200-request local probe reproduced 8 `ECONNRESET` failures instead of a readable rejection. A new 150-request real HTTP regression failed with three resets before correction; no retries were added to the client or test.

For a rejected request still in progress, the hub now writes the complete, length-delimited error immediately, discards incoming bytes without retaining them, and ends the response after the request completes or aborts. A fixed 10-second timer destroys a stalled upload even if it continues sending bytes. The existing request-size, connection-count, host/origin and authentication checks remain unchanged. Completed requests retain immediate response completion.

This uses the documented distinction between writing response data and completing a response: [Node 22 HTTP response API](https://nodejs.org/download/release/v22.14.0/docs/api/http.html#responsewritechunk-encoding-callback). The diagnosis comes from the local reproduction, not an assumption about a particular upstream client issue.

## Verification

- Original 200-request workload after correction: 200 readable 413 errors, zero resets; hub remained responsive.
- Header-only oversized request now checks that the full JSON rejection arrives without waiting for body bytes.
- Regression covers active uploads and a raw TCP client that continues sending after rejection; the connection must close within the fixed deadline and the hub must remain usable.
- Focused Spaces suite: 22 passed, including the fixed-deadline raw TCP case. Complete final suite: 1,142 passed. Production build passed.
- Independent review found no production defect and caught one test portability issue: deliberate deadline closure can report `ECONNABORTED` on a pending Windows write. The test permits only the expected reset/abort/broken-pipe closure errors after receiving `BODY_TOO_LARGE`, retains full reply/deadline/responsiveness assertions, and clears its heartbeat on closure. The full suite passed after this correction.
- External TLS proxy behavior and load beyond the existing 128-connection limit were not tested. This patch establishes the reproduced direct HTTP rejection behavior; release and installed-binary identity are separate delivery gates.

Evidence: ignored `artifacts/history-storage/ci-release-failure.log`, `spaces-upload-probe.json`, `spaces-rejection-red.log`, `spaces-upload-after.json`, and final test logs. No real account, model or billing requests were used.
