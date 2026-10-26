# Shared implementation contract

UI state and commands: src/shared/spaces-types.ts. Parent owns Electron integration, main-process client, App integration and Work copy.

## Backend ownership

src/spaces/hub.mjs and optional store.mjs; test/spaces-hub.test.mjs; scripts/spaces-server.mjs; docs/SPACES-SERVER.md.

`await createSpacesHub({dataDir,host='127.0.0.1',port=0,publicUrl,adminToken})` returns `{url,createSpace({name,description,displayName}),close()}`. `url` is loopback URL when no publicUrl provided. `createSpace` is internal bootstrap, returns `{spaceId,token}` owner credential. Standalone hub has optional authenticated admin create endpoint, without public unauthenticated signup.

HTTP POST /v1 body `{op,...}`; membership token in Authorization Bearer. All authorized operations require explicit `spaceId` and authorize token against it. Error `{error,code}` with appropriate status; conflict 409 code CONFLICT. No CORS, reject Origin. No redirects, host allowlist from listen/public address, requests <=800KiB. JSON response <=8MiB.

- `join`: no Authorization, `{spaceId,secret,displayName}` -> `{spaceId,token}`. One-use invite 48h; secret256bit stored hash, atomic consume.
- `read`: `{spaceId}` -> SpaceSnapshot (no private hashes/tokens); only owner sees invites. Up to100pages,100members,200invites per space; per-op caps errors not silent overflow.
- `page`: `{spaceId,pageId}` -> `{page:SpacePage,comments:SpaceComment[],history:SpaceRevision[]}`.
- `savePage`: `{spaceId,pageId?,expectedRevision?,title,type:'note'|'artifact',body?,artifact?}` -> `{pageId}`. Owner/editor. Note <=100k chars, artifact existing validateArtifact. Require exact priorrevision for update; new page starts1. History kept at most30 revisions; expose this limit.
- `comment`: `{spaceId,pageId,text}` -> `{commentId}`. Non-viewer. Text<=4000; max200comments/page. `resolveComment`: same identifiers +resolved:boolean, allowed author/owner/editor.
- `restorePage`: `{spaceId,pageId,revision,expectedRevision}` -> `{pageId}`. New revision, never overwrite history.
- `invite`: `{spaceId,role:'viewer'|'commenter'|'editor'}` -> `{id,secret,expiresAt}`. Owner only.
- `revokeInvite`: `{spaceId,inviteId}`. `removeMember`: `{spaceId,memberId}`, owner-only and cannot remove self. Return `{ok:true}`.

Additions after review: `page.comments[].canResolve` is computed server-side from immutable member identity and role, never display-name equality. Hosted admin creation returns a one-use owner setup secret; `claimOwner` consumes it and rotates the provisional owner credential. Native Join accepts `musebench-space://owner?...#secret`. Owned local connections verify their hub is running at its saved origin before forwarding credentials. Credential protection and storage are checked before exchanging one-use secrets.

## UI ownership

src/ui/SpacesWorkspace.tsx, src/ui/spaces.css only. Export `useSpaces(active:boolean)` -> `{state:SpacesState|null,command:(value:SpacesCommand)=>Promise<void>}` from window.musebench.spacesState()/spaces()/onSpacesState(). No direct network or tokens. 5sec active refresh without overlapping sends, preserve drafts on background refresh/conflict. Main state errors propagated (command throws), no unhandled rejection.

`SpacesSidebar({state,onSelect,onHome,selected}: {state:SpacesState|null;onSelect:(id:string)=>void|Promise<void>;onHome:()=>void;selected:boolean})` shows Spaces heading/create entry and saved spaces.

`SpacesWorkspace({active,state,command,workItems,onOpenWork,modeSwitch,onNavigationOpen,preferences}: {active:boolean;state:SpacesState|null;command:(value:SpacesCommand)=>Promise<void>;workItems:WorkItem[];onOpenWork:()=>void;modeSwitch:ReactNode;onNavigationOpen:()=>void;preferences:Preferences})` native full workspace, activefalse returnsnull. Parent places adjacent Work workspace, personal browser hidden. Home local page state unless select activeId; create/join forms; a home button.

Artifact preview use existing custom protocol `musebench-artifact://preview/<pageId>?rev=<revision>&theme=dark|light`; parent resolves only current authorized shared page. iframe sandbox allow-scripts only. Page editor note Markdown (rawHTMLoff), artifact read-only until copy to private Work. PublishWork selection may target current artifactpage with exact revision or create newpage. Private copy callback on success navigate private Work. No auto publish or auto model request. Invitation shown only after action; copy button uses navigator.clipboard or narrow trusted bridge provided by parent. Explain local invite works on this computer only; deployed HTTPS hubs support other computers. Comment identity self-declared. Preserve local drafts, manual conflicts, errors, keyboard and responsive layouts.
