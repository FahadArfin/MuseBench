# Native Muse sidebar implementation plan

**Goal:** Put the user's rendered Muse chats, ideas, and goals into native searchable sidebar lists.
**Architecture:** Bounded rendered-DOM reader and finite item activation; main-process in-memory catalog; native React groups over retained official views.
**Tech stack:** Existing Electron 45, React 19, TypeScript; no new dependencies.
**Spec:** ../specs/2026-10-25-native-muse-sidebar-design.md

## Contract

PersonalState.library has chats/ideas/goals groups {status:idle|loading|ready|unavailable,items:[{id,kind:chat|idea|goal,title}]} and selectedId:string|null. Commands: refreshLibrary, selectItem{id}, newMuseChat. Selection IDs are opaque and resolved only by the main process.

DOM adapter exports readPersonalCollection(contents,section) -> {status:ready|loading|unavailable|signed-out,items:[{key,title,target:{type:main|link|title,value:string}}],selectedKey:string|null,selectionKnown:boolean}; activatePersonalItem(contents,section,item) -> boolean; preparePersonalCollection(contents,section) -> boolean. Sections are chats|ideas|goals. Sanitization stays in the adapter/main process, never trusts remote strings as selectors or URLs without validation. Retained chat views resolve validated catalog links, while the root bot view remains the chats collection source. Known absent preview markers clear selection; unknown markers preserve explicit selection.

## Tasks

- [x] DOM adapter: tests for origin, bounded metadata, item target validation; implement scoped readers, safe finite navigation and late hydration support. Verify against real rendered lists and offline fixtures.
- [x] Controller/policy: test missing IDs, stale reads, sign-out, teardown, retention; add catalog, background collection preparation, limited refresh timer, and validated commands. Preserve existing session, sandbox, and popup behavior.
- [x] UI: native grouped lists, local filtering, empty/loading states, selected title, New Muse chat and refresh; wire App.tsx and shared types. Preserve narrow overlays and keyboard navigation.
- [x] Integration: extend fixture/smoke for titles, filtering, selection, updated/removed items and lifecycle; full unit/build/source/packaged checks, saved session proof, package byte verification, reopen app, update validation.

## Review focus

Account changes must clear old titles; stale reads must not publish into a new document; ambiguous item titles must not select a different item; hidden collection views must not steal selection; only observed rendered collections count as data, including empty and partially rendered lists.

Work proceeds within the user's implementation request. This folder has no Git repository; no commit or worktree is created.
