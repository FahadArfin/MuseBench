# MuseBench Chat / Work implementation plan

**Goal:** Add a native Work mode alongside personal Chat, inspired by the supplied Claude Dashboards/Motion video and ChatGPT Work page. Preserve existing browser sessions, Code projects, and native Muse sandbox.

**Approach:** A persistent local work library with six team collections (finance, operations, marketing, sales, analytics, engineering), four output types (dashboard, motion, document, slides), source-file attachments, conversational iteration, native activity, safe artifact previews and exports. Work uses a separate controller/database and a separate instance of the existing Muse runtime; visiting Work never switches the selected Code project. Files remain local until the user sends a Muse request. No model call on template selection or file attachment. Provider connections/cloud collaboration are outside this change; sources are explicit local snapshots.

**Research:** Video https://www.youtube.com/watch?v=en0GuyhieQk is the Claude Dashboards/Motion launch. Official walkthrough https://claude.com/resources/articles/dashboards-and-motion describes data dashboards with visible calculation provenance and code-built animated explainers. https://openai.com/chatgpt-work/ supplies team categories and work/output patterns. Current docs: https://learn.chatgpt.com/use-cases . Implement corresponding local capabilities, not branded provider services or implied live SQL/CRM connections.

## Contract

Artifact v1 is validated JSON, never executable model code: `{version:1,kind,title,summary,sources:[{name,detail}],metrics:[{label,value,change?,detail?}],charts:[{title,type:'bar'|'line',labels:string[],values:number[],unit?,calculation?,source?}],table?:{columns:string[],rows:(string|number)[][]},sections:[{heading,body}],scenes:[{title,body,kicker?,duration:number}]}`. Optional arrays default empty. At least one relevant output block per kind. Unknown executable content never runs; all rendered content is escaped. Limits: title160, summary4000, sources20, metrics12, charts8 with at most120 finite points, table200x12, sections30, scenes12 with duration2..15 and total<=120 seconds. Body limits keep total JSON below512KiB.

`src/shared/work-types.ts`: WorkTeam, WorkKind, WorkItem `{id,title,team,kind,projectId,taskId,createdAt,updatedAt,sources:WorkSource[],demo:boolean}`, WorkSource `{id,name,path,bytes,addedAt}`, WorkState `{items,activeId,item,task,runtime,busy,error,artifact,artifactError,artifactUpdatedAt,capabilities:{mp4:boolean}}`. WorkCommand: create `{team,kind,title,brief,runOptions?,demo?}`; select `{id}`; send `{text}`; stop; refresh; saveArtifact `{artifact}`; clearError. Renderer paths are never accepted for source import or export.

`createWorkService({dataDir,projectsDir,runtime})` -> async `{getState,subscribe,dispatch,addSources(paths),getArtifact(id),close}`. Uses controller in dataDir/controller, workspaces under projectsDir. Native picker passes selected file paths directly to addSources, limited UTF-8 CSV/JSON/TXT/MD. Dispatch create prepares saved draft and real Muse task, but never sends. send reads current artifact/source manifest and builds request instructing native Muse to write work-artifact.json; controller sendMessage executes existing sandbox. Stop calls disconnectMuse. Refresh parses artifact, retains last valid artifact on errors, observes native completion to refresh automatically. Safe reads/writes reject symlinks and path escapes. Restore interrupted work honestly.

Bridge `workState():Promise<WorkState>`, `work(command):Promise<WorkState>`, `onWorkState(callback)`, `workImport():Promise<WorkState>`, `workExport(format:'html'|'json'|'md'|'csv'|'pdf'|'mp4'):Promise<{status:string}>`. All main handlers use existing trustedSender. Custom artifact protocol serves only validated generated HTML by saved id, sandboxed iframe (scripts only, no same-origin, forms, popups or IPC). HTML CSP prohibits network and external scripts. PDF and MP4 exports use a hidden sandboxed renderer; MP4 uses installed FFmpeg and deterministic Motion frames. User chooses destination through native picker.

## Tasks

- [x] Artifact validation, preview generation, example content and prompt contract with adversarial and output tests.
- [x] Independent Work service, persisted library, attachments, sandboxed generation/iteration, cancellation and safe artifact refresh tests.
- [x] Native team/output launcher, saved work sidebar, chat/preview/editor controls, sources, status, exports, responsive layout.
- [x] Chat/Work segmented switch integration; trusted IPC, artifact protocol, exports and lifecycle.
- [x] UI and actual Muse live workflow checks, regression suite, review, package and reopen.

Implementation is split by file ownership under dispatching-parallel-agents. Parent owns integration and tests after the shared interfaces are fixed. No changes to native permission arguments or browser login partitions.
