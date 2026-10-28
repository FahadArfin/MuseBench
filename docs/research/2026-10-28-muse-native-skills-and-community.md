# Muse instructions, skills and community integrations

Research checked 28 October 2026. Repository audit plus official documentation, public GitHub sources and read-only native CLI probes. No community package was installed and no model request was sent. Initial installed CLI was 1.4.13; the launcher subsequently updated to 1.4.14-R7309.1 during this work. Version-specific claims need that distinction.

## What helps most

1. **A project instruction inspector.** Show the actual applicable AGENTS.md / CLAUDE.md hierarchy, trust status and byte cost, with an optional `muse init --dry-run` preview. Native instructions stop at the nearest Git boundary. MuseBench currently fingerprints additional file names for trust review; that does not prove Muse loads them as instructions. Avoid creating competing MUSE.md or CODEX.md files as a supposed optimization. [Official configuration](https://dev.meta.ai/docs/muse-code/configuration)
2. **A skill context inspector.** The native catalog loads summaries first, then skill bodies on demand. The local read-only snapshot returned 25 bundled skills and no diagnostics, including plan, grill, git, doctor, taste, visual-coding, browser-app-delivery, workflow-authoring, create-skill and resume-codex. The composer already shows individual estimated costs and diagnostics; Customize currently discards some of that metadata. Preserve it there and show aggregate startup cost. Do not enable thousands of imported skill bodies in every request. [Official skills](https://meta-models.github.io/muse-code-sdk/next/guides/extend/skills/)
3. **Reviewed memory, not duplicate automatic recall.** Native Muse already has memory scopes and recall observers. Build on the existing MuseBench lesson-review UI with evidence, applicability and deletion rather than a second unconditional context injection loop. [Configuration](https://dev.meta.ai/docs/muse-code/configuration), [native observers](https://dev.meta.ai/docs/muse-code/extending)
4. **Correct model and billing visibility.** Muse Wonder Full is a distinct subscription offering, not a reasoning setting. Discover actual model IDs and supported efforts from the selected native credential route. Spark is the documented fit for quicker/high-volume subtasks; Wonder for difficult multi-file work. Keep user control and never silently switch to paid API usage at a plan limit. [Models](https://dev.meta.ai/docs/models), [subscriptions](https://dev.meta.ai/docs/muse-code/subscriptions)

## Community candidates

| Project | Useful idea | Recommendation |
|---|---|---|
| [hypery11/oh-my-musecode](https://github.com/hypery11/oh-my-musecode) | Context-cost reporting, diagnostics, small task-specific skills, ownership-aware uninstall | Adapt the inspection UX. Review individual skills; do not replace user AGENTS.md/settings wholesale. Its routed-skill experiments used older native versions. |
| [siddicky/oh-my-musecode](https://github.com/siddicky/oh-my-musecode) | Explicit planning, trace/evidence and bounded workflow stages | Selectively adapt useful instructions to existing MuseBench workflows. Its library workflow runtime is not an automatically integrated native MCP service. |
| [cbuntingde/muse-code-memory](https://github.com/cbuntingde/muse-code-memory) | Local searchable memory with review, scopes, expiry and deduplication | Promising design reference. Verify license and current Windows behavior before importing code. Automatic capture/file creation should not be enabled by default. Author test claims were not independently rerun. |
| [danny-hines/muse-code-bridge](https://github.com/danny-hines/muse-code-bridge) | Explicit account/API choice and no credential fallback | Good routing principle. MuseBench uses its own native runtime and encrypted local key storage; this bridge is not needed as another runtime layer. |
| [ReARCLabs/sparkguard](https://github.com/ReARCLabs/sparkguard) | Tool/file restrictions with provenance and undo | Evaluate deterministic rules first. Its model-based policy routing can add latency and billable calls, so it is not a free speed improvement. |
| [aicodedecode/awesome-muse-skills](https://github.com/aicodedecode/awesome-muse-skills) | Broad skill discovery | Useful optional catalog source; many entries target personal Muse chat and imported content has separate licenses. Quantity is not evidence of Code compatibility or quality. |
| [metacpp/awesome-muse-code](https://github.com/metacpp/awesome-muse-code) | Index of native/community projects | Discovery feed only. Verify each upstream repository and platform independently. |

Excluded [Akshay2695/muse_autoskill](https://github.com/Akshay2695/muse_autoskill): its documented engine is an OpenAI/GPT wrapper, not Meta Muse. A similar project name is not compatibility evidence.

## Measurement and remaining work

The existing bounded paired experiment in `native-comparison-2026-10-27.md` did not demonstrate a quality or token-saving improvement from the tested extra context. More instructions should therefore earn their cost through measured task outcomes. No new paid comparison was run; the previous 12-run authorization is exhausted.

Implemented in the initial change: explicit Code account/API source selection, route-specific usage, subscription discovery and Meta-owned desktop checkout, and the matching 1.4.14 SDK contract. Follow-up work added the native skill-cost inspector (released in 0.2.116; see `docs/VALIDATION-skill-context.md`) and the bounded project instruction inspector (see `docs/VALIDATION-project-instructions.md`). The latter reports documented filesystem selection, not a live session context capture, and does not broaden trust. The optional `muse init` preview and community memory changes remain recommendations. Payment completion, API-key entitlement and subscription allowance must be confirmed by Meta; local tests cannot establish those account facts.
