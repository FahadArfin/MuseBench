# Subscription resets

Add a compact Resets section to Usage & billing Overview. Show Meta's reported current-window and weekly reset times with countdowns, and refresh allowance at the next reset while the panel is open. A deadline passing never changes the stored percentage to 100%; only a new provider observation can change the bar.

## Provider constraint and approach

Checked 28 October 2026: [Meta subscription documentation](https://dev.meta.ai/docs/muse-code/subscriptions) offers waiting for automatic refresh or upgrading when limits are exhausted. The [official SDK schema at a45cb67](https://github.com/meta-models/muse-code-sdk/blob/a45cb67cd2e27c8b6b4b55dcbaae6e6341123ea4/schema/msp/msp.d.ts) exposes subscription window observations and reset timestamps, but no banked-reset inventory, claim or redemption operation. The native read/refresh operation refreshes the observation, not the allowance.

A functional claim/use button requires provider support. Locally inventing reset credits or refilling a percentage would misrepresent actual access. The chosen implementation therefore shows Banked resets as unavailable through Meta's current integration and provides working Refresh usage and View plans actions. Do not add a fake inventory, redemption history, speculative API, or automatic paid fallback.

## Behavior

- Use the same renderer in preview and desktop. Preview dates are explicitly sample data.
- Format remaining time and local dates; missing or invalid dates stay unavailable.
- After a deadline, show Awaiting Meta update until a new observation arrives. Retain the reported percentage without claiming a reset succeeded.
- Refresh once just after the nearest future reset, otherwise every five minutes; stale deadlines cannot create a rapid retry loop. Existing focus refresh and billing-source generation guards remain.
- API mode explains that subscription resets do not apply and hides subscription countdowns. Unknown account data never means zero banked resets or a full bar.
- No real purchase, subscription mutation, reset consumption or model request during validation.

The user requested implementation and has standing authorization to publish completed features. This document records the provider limitation and the implementation choice; no extra approval gate is needed.
