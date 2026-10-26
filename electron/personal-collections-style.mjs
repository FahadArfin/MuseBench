import { resolvePersonalAppearance } from './personal-appearance.mjs';

// Observed rendered collection hooks, not a second copy of account data.
// No DOM replacement, navigation, fetching, input handling or action invocation.
export function personalCollectionsCSS(appearance = {}) {
  const {theme,color,size,font,systemFont,reducedMotion} = resolvePersonalAppearance(appearance);
  const scope='body:has([data-hatch-full-page-shell]):has([class~="@container/ideas"],#hatch-goals-create)';
  const root=`${scope} [data-hatch-full-page-shell] div:has(> header):has([class~="@container/ideas"],#hatch-goals-create)`;
  const columns=`${root} :is([class~="@container/ideas"],div:has(> section #hatch-goals-create))`;
  const ideaRow=`${root} [role="listitem"] > div:has(> [data-pel-click="idea_group_row_click"])`;
  const goalCard=`${root}:has(#hatch-goals-create) section :is(button,a):has(h3)`;
  const dialog=`${scope} :is([data-slot="content-area-dialog-surface"]:has([data-pel-impression="idea_preview_dialog_impression"]),[data-slot="dialog-surface"]:has([data-slot="dialog-description"]))`;
  return `
${scope} {
  --mb-collection-bg:${color.bg}; --mb-collection-surface:${color.surface}; --mb-collection-hover:${color.hover};
  --mb-collection-border:${color.border}; --mb-collection-text:${color.text}; --mb-collection-muted:${color.muted};
  --mb-collection-accent:${color.accent}; --mb-collection-action:${color.action}; --mb-collection-on-action:${color.onAction}; --mb-collection-size:${size}; --mb-collection-font:${font}; --mb-collection-system:${systemFont};
  --color-bg-primary:${color.bg}; --color-bg-secondary:${color.bg}; --color-fill-primary:${color.surface};
  --color-fill-secondary:${color.surface}; --color-fill-secondary-elevated:${color.hover}; --color-fill-divider:${color.border};
  --color-fill-blur-thick:${color.surface}; --color-text-primary:${color.text}; --color-text-secondary:${color.muted};
  --color-hatch-accent:${color.accent}; --color-hatch-primary-action-background:${color.action}; --color-hatch-primary-action-foreground:${color.onAction};
  color-scheme:${theme}; background:var(--mb-collection-bg) !important; color:var(--mb-collection-text) !important;
  font-family:var(--mb-collection-system) !important; -webkit-font-smoothing:antialiased;
}
${root} { background:var(--mb-collection-bg) !important; color:var(--mb-collection-text) !important; font-family:var(--mb-collection-system) !important; }
${root} > header { background:var(--mb-collection-bg) !important; }
${root} > header > div:has([data-testid="hatch-route-header-content"]), ${root} > div:has(> [class~="@container/ideas"]), ${root} > div:has(> div > section #hatch-goals-create) { padding-inline:32px !important; }
${root} [data-testid="hatch-route-header-content"], ${columns} { width:100% !important; max-width:900px !important; min-width:0 !important; margin-inline:auto !important; box-sizing:border-box !important; }
${columns} { gap:28px !important; padding-block:12px 32px !important; }
${root} h1 { font:600 24px/1.3 var(--mb-collection-system) !important; letter-spacing:-.025em; color:var(--mb-collection-text) !important; }
${root} h2 { font:600 14px/1.5 var(--mb-collection-system) !important; color:var(--mb-collection-muted) !important; margin-block:0 12px !important; }
${root} .hatch-route-header-description { font:var(--mb-collection-size)/1.65 var(--mb-collection-font) !important; color:var(--mb-collection-muted) !important; }
${root} [data-pel-impression="idea_group_card_impression"] > [role="list"] { display:flex !important; flex-direction:column !important; gap:8px !important; }
${ideaRow} {
  margin-inline:0 !important; padding:16px !important; gap:14px !important;
  border:1px solid var(--mb-collection-border) !important; border-radius:12px !important;
  background:var(--mb-collection-surface) !important; min-width:0 !important; height:auto !important;
}
${ideaRow}:hover { background:var(--mb-collection-hover) !important; }
${root} [data-pel-click="idea_group_row_click"] { background:transparent !important; border:0 !important; padding:0 !important; color:var(--mb-collection-text) !important; font-family:var(--mb-collection-system) !important; }
${root} [data-pel-click="idea_group_row_click"] h3 { font:500 var(--mb-collection-size)/1.5 var(--mb-collection-system) !important; color:var(--mb-collection-text) !important; margin:0 0 4px !important; overflow-wrap:anywhere; }
${root} [data-pel-click="idea_group_row_click"] p { font:var(--mb-collection-size)/1.65 var(--mb-collection-font) !important; color:var(--mb-collection-muted) !important; margin:0 !important; overflow-wrap:anywhere; }
${root} [data-pel-click="idea_menu_click"], ${root} [data-testid="hatch-route-header-side-chat-toggle"] { color:var(--mb-collection-muted) !important; background:transparent !important; border-color:transparent !important; }
${root} [data-pel-click="idea_menu_click"]:hover { background:var(--mb-collection-hover) !important; color:var(--mb-collection-text) !important; }
${root} [data-pel-impression="goals_null_state_impression"] { gap:8px !important; }
${root} [data-pel-click="goals_null_state_category_click"], ${goalCard} {
  background:var(--mb-collection-surface) !important; color:var(--mb-collection-text) !important;
  border:1px solid var(--mb-collection-border) !important; border-radius:12px !important;
  padding:16px !important; margin-inline:0 !important; min-width:0 !important;
  font:var(--mb-collection-size)/1.5 var(--mb-collection-system) !important; overflow-wrap:anywhere;
}
${root} [data-pel-click="goals_null_state_category_click"]:hover:not(:disabled), ${goalCard}:hover:not(:disabled) { background:var(--mb-collection-hover) !important; }
${goalCard} h3 { font:500 var(--mb-collection-size)/1.5 var(--mb-collection-system) !important; color:var(--mb-collection-text) !important; }
${goalCard} p:not([role="alert"]) { font:var(--mb-collection-size)/1.65 var(--mb-collection-font) !important; }
${dialog} { border:1px solid var(--mb-collection-border) !important; border-radius:16px !important; background:var(--mb-collection-surface) !important; color:var(--mb-collection-text) !important; font-family:var(--mb-collection-system) !important; box-shadow:0 18px 60px #00000030 !important; }
${dialog} h2 { font:600 20px/1.4 var(--mb-collection-system) !important; color:var(--mb-collection-text) !important; overflow-wrap:anywhere; }
${dialog} :is([data-pel-impression="idea_preview_dialog_impression"] p,[data-slot="dialog-description"]) { font:var(--mb-collection-size)/1.7 var(--mb-collection-font) !important; color:var(--mb-collection-muted) !important; }
${dialog} button[aria-label="Close"], ${dialog} [data-slot="dialog-close"], ${dialog} [data-pel-click="idea_menu_click"] { background:var(--mb-collection-hover) !important; color:var(--mb-collection-text) !important; border-color:transparent !important; }
${dialog} .bg-hatch-primary-action-background { border-radius:8px !important; background:var(--mb-collection-action) !important; color:var(--mb-collection-on-action) !important; border-color:transparent !important; font:500 13px/1.5 var(--mb-collection-system) !important; }
${scope} [data-slot="dropdown-menu-content"] { background:var(--mb-collection-surface) !important; color:var(--mb-collection-text) !important; border-color:var(--mb-collection-border) !important; border-radius:10px !important; font:13px/1.5 var(--mb-collection-system) !important; }
${root} :is(button,a):focus-visible, ${dialog} button:focus-visible { outline:2px solid var(--mb-collection-accent) !important; outline-offset:3px !important; }
@media(max-width:700px) {
  ${root} > header > div:has([data-testid="hatch-route-header-content"]), ${root} > div:has(> [class~="@container/ideas"]), ${root} > div:has(> div > section #hatch-goals-create) { padding-inline:16px !important; }
  ${ideaRow} { padding:12px !important; gap:10px !important; }
  ${root} h1 { font-size:22px !important; }
}
${reducedMotion?`${root} *, ${dialog} * { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; scroll-behavior:auto !important; }`:''}
`;
}
