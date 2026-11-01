# Features to implement in the future

## Large repository refinements

Updated October 31, 2026. The streamed, disk-backed backend is implemented
locally; see [design](superpowers/specs/2026-10-31-large-repositories.md),
[implementation plan](superpowers/plans/2026-10-31-large-repositories.md) and
[validation](validation/2026-10-31-large-repositories.md).

- **Historical object maintenance:** add reachability-based pruning with an
  explicit retention policy; never delete objects needed by task baselines,
  checkpoints or interrupted restore journals. Current roadblock: manifests
  are shared across those lifecycles, so deleting by age alone is unsafe.
- **Paged large-text comparisons:** load line ranges or bounded structural JSON
  comparisons for files above 2 MiB, including the 36 MiB Nook inventory.
  Current roadblock: the current diff engine and renderer consume whole strings;
  they need an indexed line/range protocol before lifting rendering budgets.
- **Very large change lists:** virtualize/paginate review rows and manifest
  metadata for mass asset changes. Current roadblock: review state and several
  consumers expect complete arrays; source-body memory is already bounded.
- **Scan progress and background verification:** expose bytes/files scanned and
  cancellation controls in the shared shell. Current roadblock: source capture
  is asynchronous and cancellable in the backend, but scan progress is not yet
  part of the shell state protocol. Verified scans still read all eligible bytes.
- **Binary restore and chunk deduplication:** optional captured binary assets,
  with disk quotas and safe streamed restore. Current roadblock: binaries are
  intentionally hash-only today; chunk storage and retention semantics must be
  designed before claiming backup support.

## Muse Voice Transcribe dictation

Status: Deferred pending a supported integration and billing path. Updated October 31, 2026.

### Desired feature

Use Muse Voice Transcribe for the MuseBench microphone button, transcribing speech into the editable prompt without automatically sending it. Keep the compact recording controls and retain local Windows speech recognition as an offline fallback.

### Current implementation

MuseBench uses local Windows speech recognition through its native speech helper. It does not currently call the Muse audio API.

### Current roadblocks

- **Windows support:** Meta documents that Muse Code's built-in voice input is unavailable on Windows. Meta does not document the underlying reason. This limits reuse of its built-in voice flow; it does not prevent MuseBench from capturing audio itself.
- **Subscription integration:** Muse Code subscriptions include voice mode, but subscription credentials are documented for use with Muse Code only. We have not verified a supported way for MuseBench to access subscription-covered transcription through the CLI or SDK.
- **Separate API billing:** The public Muse Voice Transcribe API supports live audio, but requires a Model API key. Additional API keys are billed pay-as-you-go; the documented transcription price is $0.18 per audio hour. Do not assume the user's Muse Code subscription covers direct audio API calls.

### Conditions for implementation

1. Recheck Windows voice support and the installed Muse CLI/SDK for a documented transcription interface.
2. Confirm whether that interface supports subscription billing from MuseBench. Do not extract or repurpose restricted credentials.
3. If only the paid public API is available, obtain explicit authorization for its billing and audio transmission before making live requests.
4. Validate microphone capture, streaming transcripts, final-text corrections, stop/cancel behavior, draft preservation, and failure recovery on Windows.

### Official references

- [Muse Code platform support](https://dev.meta.ai/docs/muse-code)
- [Muse Code voice input](https://dev.meta.ai/docs/muse-code/interactive)
- [Muse Code subscriptions and credential scope](https://dev.meta.ai/docs/muse-code/subscriptions)
- [Muse Voice Transcribe API and pricing](https://dev.meta.ai/docs/speech-to-text)

Documentation records a future feature; it does not authorize implementation or paid requests. Recheck provider support and pricing before implementation.
