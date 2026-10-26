# Patchlight

An independent, offline visual prototype for a novice-friendly **Muse CLI** coding workspace. All integrations are mocked. No affiliation with Meta, OpenAI, or Anthropic.

## Try it

From this directory run `npm start`, then open http://127.0.0.1:4318. No installation or model key is needed. Walk through Plan → Changes → Preview → Checks → Review. Try a failed check to see acceptance blocked.

`npm run bundle` creates `artifacts/Patchlight-Interactive-Demo.html`, a single file with no external assets or libraries. Serve that file through a local HTTP server. Direct `file://` opening was blocked by this environment's browser policy and was not verified.

With the server running, `npm test` runs the browser checks. Tests reuse the available Playwright runtime, not app code or secrets. Set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` on another environment if necessary. No dependencies are installed automatically.

## Read

- `docs/RECOMMENDATION.md`: source-grounded feasibility, overlap, naming and product thesis.
- `docs/HANDOFF.md`: architecture, official Muse protocol evidence, implementation sequence and acceptance tests.
- `docs/VALIDATION.md`: tested behavior, visual review and limitations.
- `artifacts/test-results.json`: machine-readable browser results.

The sample project files and displayed check results are illustrative. Chat input is local and escaped, and does not generate code. Project switching, extension installation, real command execution and persistence are outside this spike. Refreshing discards demo state.
