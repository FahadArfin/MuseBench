// Presentation only. These selectors were observed on Muse's rendered chat UI.
// Keep its real message nodes, composer, approvals and event handlers in place.
import { resolvePersonalAppearance } from './personal-appearance.mjs';

export function personalChatCSS(appearance = {}) {
  // No renderer-supplied CSS, font name, length or color reaches insertCSS.
  const {theme,color,size,font,systemFont,monoFont} = resolvePersonalAppearance(appearance);
  const scope = 'body:has([data-hatch-full-page-shell]):has([data-hatch-chat-content])';
  const log = `${scope} [role="log"][data-hatch-chat-column]`;
  const composer = `${scope} [data-hatch-composer-chrome]`;
  return `
${scope} {
  --mb-chat-bg:${color.bg}; --mb-chat-surface:${color.surface}; --mb-chat-hover:${color.hover};
  --mb-chat-border:${color.border}; --mb-chat-text:${color.text}; --mb-chat-muted:${color.muted};
  --mb-chat-accent:${color.accent}; --mb-chat-action:${color.action}; --mb-chat-on-action:${color.onAction}; --mb-chat-code:${color.code}; --mb-chat-size:${size};
  --mb-chat-font:${font}; --mb-chat-system:${systemFont}; --mb-chat-mono:${monoFont};
  --color-bg-primary:${color.bg}; --color-bg-secondary:${color.bg};
  --color-fill-primary:${color.surface}; --color-fill-secondary:${color.surface};
  --color-fill-divider:${color.border}; --color-text-primary:${color.text};
  --color-text-secondary:${color.muted}; --color-hatch-accent:${color.accent};
  --hatch-agent-bubble-bg:${color.surface};
  color-scheme:${theme}; background:${color.bg} !important; color:${color.text} !important;
  font-family:${systemFont} !important; -webkit-font-smoothing:antialiased;
}
${scope} [data-hatch-full-page-shell],
${scope} [data-hatch-chat-content],
${scope} [data-hatch-pane-frame="chat"],
${scope} [data-hatch-status-panel-card] {
  background:var(--mb-chat-bg) !important; color:var(--mb-chat-text) !important;
  border-color:var(--mb-chat-border) !important; font-family:var(--mb-chat-system) !important;
}
${scope} [data-hatch-chat-column] { max-width:800px !important; min-width:0 !important; box-sizing:border-box !important; }
${log} { padding-inline:28px !important; color:var(--mb-chat-text) !important; font-family:var(--mb-chat-font) !important; font-size:var(--mb-chat-size) !important; line-height:1.7 !important; }
${log} [data-message-item] { color:var(--mb-chat-text) !important; font-family:var(--mb-chat-font) !important; }
${log} [data-hatch-assistant-message-body] { max-width:calc(100% - 44px) !important; min-width:0 !important; }
${log} [data-message-role="assistant"] .hatch-chat-groupable-bubble {
  background:transparent !important; border:0 !important; border-radius:0 !important;
  box-shadow:none !important; padding:0 !important; min-height:0 !important; color:var(--mb-chat-text) !important;
}
${log} [data-message-role="user"] .hatch-chat-groupable-bubble {
  background:var(--mb-chat-hover) !important; color:var(--mb-chat-text) !important;
  border-radius:18px !important; padding:12px 18px !important; box-shadow:none !important;
}
${log} [data-message-role="user"] .hatch-chat-groupable-bubble p,
${log} .prose { font:inherit !important; font-family:var(--mb-chat-font) !important; font-size:var(--mb-chat-size) !important; line-height:1.7 !important; color:var(--mb-chat-text) !important; }
${log} .prose { max-width:100% !important; overflow-wrap:anywhere; }
${log} .prose :is(p,li,ul,ol,blockquote) { font-size:inherit !important; line-height:1.7 !important; color:inherit !important; }
${log} .prose :is(p,ul,ol) { margin-block:0 12px !important; }
${log} .prose :is(h1,h2,h3,h4,h5,h6) { color:var(--mb-chat-text) !important; font-family:var(--mb-chat-font) !important; line-height:1.4 !important; margin-block:20px 10px !important; }
${log} .prose :is(strong,b) { color:inherit !important; }
${log} .prose a { color:var(--mb-chat-accent) !important; text-decoration:underline; text-underline-offset:3px; }
${log} .prose code { font-family:var(--mb-chat-mono) !important; font-size:.9em !important; background:var(--mb-chat-surface) !important; color:var(--mb-chat-text) !important; border-radius:4px; }
${log} .prose pre { box-sizing:border-box !important; max-width:100% !important; overflow-x:auto !important; white-space:pre !important; padding:16px !important; margin-block:14px !important; background:var(--mb-chat-code) !important; color:var(--mb-chat-text) !important; border:1px solid var(--mb-chat-border) !important; border-radius:8px !important; font-family:var(--mb-chat-mono) !important; }
${log} .prose pre code { background:transparent !important; padding:0 !important; font-size:12px !important; line-height:1.7 !important; }
${log} .prose table { display:block; max-width:100%; overflow-x:auto; border-collapse:collapse; }
${log} .prose :is(th,td) { padding:8px 12px !important; border:1px solid var(--mb-chat-border) !important; color:var(--mb-chat-text) !important; }
${log} .prose th { background:var(--mb-chat-surface) !important; }
${log} .prose blockquote { border-inline-start:3px solid var(--mb-chat-border) !important; padding-inline-start:16px !important; }
${log} :is(img,video) { max-width:100%; }
${scope} [data-hatch-shell-composer-layer] { padding-inline:28px !important; }
${scope} [data-hatch-composer-root] { font-family:var(--mb-chat-system) !important; }
${composer} {
  background:var(--mb-chat-surface) !important; color:var(--mb-chat-text) !important;
  border:1px solid var(--mb-chat-border) !important; border-radius:16px !important;
  backdrop-filter:none !important; box-shadow:0 3px 12px #00000014 !important;
}
${composer}:focus-within { border-color:color-mix(in srgb,var(--mb-chat-muted) 55%,var(--mb-chat-border)) !important; }
${composer} > div:has(> div > :is(textarea,[contenteditable="true"])) { padding:14px 16px 50px !important; }
${composer} div:has(> :is(textarea,[contenteditable="true"])) { padding-inline:0 !important; align-items:flex-start !important; }
${composer} :is(textarea,[contenteditable="true"]) {
  box-sizing:border-box !important; min-height:52px !important; max-height:180px !important;
  padding:0 !important; margin:0 !important; width:100% !important; background:transparent !important;
  color:var(--mb-chat-text) !important; caret-color:var(--mb-chat-text) !important;
  font-family:var(--mb-chat-system) !important; font-size:13px !important; line-height:1.7 !important;
  overflow-y:auto !important; resize:none !important;
}
${composer} div:has(> [data-hatch-composer-placeholder-label]) { inset-inline:0 !important; top:0 !important; bottom:auto !important; min-height:22px !important; }
${composer} [data-hatch-composer-placeholder-label] { color:var(--mb-chat-muted) !important; font:13px/1.7 var(--mb-chat-system) !important; }
${composer} button { color:var(--mb-chat-muted) !important; background-color:transparent !important; border-color:transparent !important; }
${composer} button:hover:not(:disabled) { background:var(--mb-chat-hover) !important; color:var(--mb-chat-text) !important; }
${composer} [data-pel-click="chat_send_message"] {
  width:30px !important; height:30px !important; min-width:30px !important; border-radius:50% !important;
  background:var(--mb-chat-action) !important; color:var(--mb-chat-on-action) !important;
}
${composer} [data-pel-click="chat_send_message"]:hover:not(:disabled) { background:var(--mb-chat-action) !important; color:var(--mb-chat-on-action) !important; filter:brightness(.9); }
${composer} [data-pel-click="chat_send_message"]:disabled { background:var(--mb-chat-hover) !important; color:var(--mb-chat-muted) !important; }
${composer} :is(button,[contenteditable="true"]):focus-visible { outline:2px solid var(--mb-chat-accent) !important; outline-offset:2px !important; }
${scope} [data-hatch-status-panel-card] { font-size:13px !important; }
${scope} [data-hatch-status-panel-card] button {
  color:var(--mb-chat-text) !important; background-color:var(--mb-chat-surface) !important;
  border-color:var(--mb-chat-border) !important;
}
${scope} [data-hatch-status-panel-card] button:hover:not(:disabled) { background-color:var(--mb-chat-hover) !important; }
@media (max-width:700px) {
  ${log} { padding-inline:20px !important; }
  ${scope} [data-hatch-shell-composer-layer] { padding-inline:16px !important; }
  ${log} [data-hatch-assistant-message-body] { max-width:calc(100% - 36px) !important; }
}
${appearance?.reducedMotion === true ? `${scope} [data-hatch-chat-content] *, ${composer} * { animation-duration:0.01ms !important; animation-iteration-count:1 !important; transition-duration:0.01ms !important; scroll-behavior:auto !important; }` : ''}
`;
}
