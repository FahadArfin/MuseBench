# Sites internal contract

Types: src/shared/sites-types.ts. Parent owns this contract, main service, App, Electron IPC.

## Files module (src/sites/files.mjs)
Export constants LIMITS {files:200,totalBytes:26214400,fileBytes:5242880} and functions:
- collectSite(directory) -> Promise<Bundle>; native absolute folder only, recursively guarded.
- validateBundle(value) -> Bundle; revalidate stored/read bundle (hashes computed, never trusted).
- bundleFromFiles(array of {path,data:Buffer|string}) -> Bundle.
- starterSite(template,title,description) -> Bundle.
- readSiteFile(bundle,path) -> string for allowed UTF8 editable type, error otherwise.
- replaceSiteFile(bundle,path,text) -> Bundle (only existing editable file; max same limits).
- writeSiteDirectory(bundle,directory) -> Promise<void> safely write bundle to managed public directory; reject links.
Bundle = {files:[{path,bytes,sha1,mime,data:base64}],hash:sha256,totalBytes}. Paths slash relative. No hidden entries, dot traversal, links/junctions, env/private/config files or server scripts. index.html required. Block source maps and unsupported types; explicit errors, never silently publish sensitive files. Hard cap files/bytes. Imported folder only copied, never execute build commands.

## Preview module (electron/sites-protocol.mjs)
Export sitePreviewUrl(siteId,hash,path='index.html') and isSitePreviewUrl(url), createSitePreviewHandler({getBundle}) -> async(request)=>Response. getBundle(siteId,hash) only returns current local draft if exact hash or selected saved snapshot authorized by service. Scheme musebench-site, exact validated host UUID.SHA256.preview and paths /index.html or /assets/file.ext; unique hosts allow ordinary relative and root-relative assets without rewriting generated HTML/JS. Opaque sandbox iframe and response CSP sandbox allow-scripts; CSP denies network/frames/forms/workers/popups and allows only that site's local resources and inline JS. No bypassCSP privilege or renderer bridge. CORS wildcard enables module/font subresources from the opaque origin, while connect-src remains none. App allows only isSitePreviewUrl matches at frame navigation. Public URLs never loaded inside app-owned renderer.

## Provider (src/sites/netlify.mjs)
createNetlifyClient({getToken,fetcher=fetch,clientId=''}) returns:
identity() -> {id,name}; teams() -> [{id,slug,name}]; createSite({name,teamId}) -> sanitizedRemote;
getSite(id) -> sanitizedRemote; listSites() -> sanitizedRemote[] (bounded recovery discovery); createDeploy(siteId,bundle,{title}) -> {id,state,required:string[],url?}; uploadDeploy(deployId,bundle,required) -> void; getDeploy(siteId,deployId) -> {id,state,error?,url?}; restore(siteId,deployId) -> sanitizedRemote; unpublish(siteId) -> sanitizedRemote.
sanitizedRemote={id,name,url:string|null,publishedDeployId:string|null,accountId?:string,createdAt?:string}; URLs HTTPS only; use official site ssl_url. Main persists IDs before uploads. Client no automatic remote mutation retries. request body/content limit and timeout. Use official API https://api.netlify.com/api/v1 only (injected fetcher for tests, not configurable host). Ambiguous site creation recovery requires preflight absence, persisted user/team identity, creation timestamp within the attempt window and no production deployment. A name match alone cannot adopt an existing site. Unpublish throws UNSUPPORTED without a request; availability management opens the official dashboard.
OAuth: beginAuth()->{id,url}; checkAuth(id)->{authorized:boolean}; finishAuth(id)->{token:string}; clientId is app-provided public registration ID, never use another app's identity. Read official OpenAPI to verify ticket flow; if unsupported mark clearly and report to parent. Token returned only inside main process.

## Generator (src/sites/generator.mjs)
createSitesGenerator({dataDir,projectsDir,runtime,onGenerated}) -> {getState(),subscribe(fn),select(siteId),generate({siteId,title,text,bundle}),stop(),close()}. SiteId UUID. Managed per-site public directory separate from app/provider data. Use files module to copy bundle; createController with own task per site, persist task mapping. onGenerated(siteId,bundle) callback after completed native run; never publish. getState matches SiteGeneration. Prompt instructs static output public/ and native file tools; no terminal needed for plain site. Use provided runtime (existing ExecRuntime, sandbox unchanged). Stop must reach runtime during connect; late connection cannot submit. Preserve original user prompts when exposing task. select no model request. Generated content invalid -> expose error keep previous good preview. Callback awaited/queue safe. generation busy prevents site selection/import/publishing until finished.

## UI bridge (parent implements)
sitesState(), sites(command), onSitesState(callback); sitesImport() native folder picker -> SitesState; sitesReadFile(path)->{text:string}; sitesConnect({token?:string,oauth?:boolean})->SitesState; sitesAuthPoll()->SitesState; sitesOpen(target:'live'|'dashboard'|'domains'|'analytics'|'tokens'|'oauthSetup')->void; sitesCopyUrl()->void. No arbitrary URL/path execution, token never returned. Optional clientId from build/runtime env MUSEBENCH_NETLIFY_CLIENT_ID; token fallback personal use.

## UI (src/ui/SitesWorkspace.tsx and sites.css)
Exports useSites(active) -> {state,command,importFolder,connect,pollAuth}; SitesSidebar({state,selected,onHome,onSelect}); SitesWorkspace({active,state,command,importFolder,connect,pollAuth,workItems,workBusy,modeSwitch,onNavigationOpen,preferences,home,onHomeChange}). Parent wires siblings with Spaces and Work. Home/library native dark/light, search; create starter, import folder, fromWork; studio Preview (desktop/mobile), Files (read/save), Versions(save/publish/restore), Settings(metadata, hosting,publicurl/providerlinks/unpublish). Native prompt generator via generate; actual task messages/activity, Stop while busy. Publish dialog explicitly Public and selected version file count/bytes, one confirmation is click authorization. No fake private access/customdomain analytics settings. On backend unknown operation show refresh/recover, no automatic duplicate mutation. Draft editor keyed by site/file, retains unsaved across navigation. Exact preview URL from state; iframe sandbox allow-scripts only; no srcdoc with base privileges. Existing Modal can be reused.
