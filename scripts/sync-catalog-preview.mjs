// Refresh the public metadata used by the isolated browser preview. No packages
// are downloaded, executed or installed. Desktop discovery stays live.
import {writeFile} from 'node:fs/promises';
import {createExtensionCatalog} from '../electron/extension-catalog.mjs';
const revisions=new Map(),resolving=new Map();
async function revision(repo){
 if(!resolving.has(repo))resolving.set(repo,(async()=>{
  const response=await fetch(`https://api.github.com/repos/${repo}/commits/main`,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error(`Cannot pin ${repo}: HTTP ${response.status}`);
  const {sha}=await response.json();if(!/^[a-f0-9]{40}$/.test(sha))throw Error(`Invalid revision for ${repo}`);
  revisions.set(repo,sha);return sha;
 })());return resolving.get(repo);
}
const catalog=createExtensionCatalog({fetch:async(input,options)=>{
 const url=new URL(input),match=url.hostname==='raw.githubusercontent.com'?url.pathname.match(/^\/([^/]+\/[^/]+)\/main\//):url.hostname==='api.github.com'?url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/git\/trees\/main$/):null;
 if(match){const sha=await revision(match[1]);url.pathname=url.pathname.replace('/main/',`/${sha}/`).replace(/\/main$/,`/${sha}`);}
 return fetch(url,options);
}});
const snapshot={fetchedAt:new Date().toISOString(),sources:'Public GitHub manifests/trees at the recorded commits and the official MCP Registry. Metadata only; no compatibility certification.',sourceRevisions:{},entries:[]};
for(const kind of ['skills','plugins','mcp','hooks']){
 let cursor;const seen=new Set();let entries=[];
 do{
  const page=await catalog.search({kind,source:'community',cursor});
  if(page.errors.length||page.offline||page.stale)throw Error(`${kind}: incomplete upstream snapshot: ${page.errors.join('; ')}`);
  for(const entry of page.entries)if(!seen.has(entry.id)){seen.add(entry.id);entries.push(entry);}
  if(page.nextCursor===cursor&&cursor)throw Error('Repeated upstream cursor');cursor=page.nextCursor;
 }while(cursor&&entries.length<1000);
 entries=entries.slice(0,1000);snapshot.entries.push(...entries);console.log(`${kind}: ${entries.length}`);
}
function pinnedUrl(value){
 const url=new URL(value);if(url.hostname!=='github.com')return value;
 const match=url.pathname.match(/^\/([^/]+\/[^/]+)(?:\/(blob|tree)\/main(\/.*)?)?$/),sha=match&&revisions.get(match[1]);
 return sha?`https://github.com/${match[1]}/${match[2]??'tree'}/${sha}${match[3]??''}`:value;
}
for(const entry of snapshot.entries){
 entry.homepage=pinnedUrl(entry.homepage);entry.provenance.url=pinnedUrl(entry.provenance.url);
 const source=entry.provenance.url.match(/^https:\/\/github.com\/([^/]+\/[^/]+)\/(?:blob|tree)\/([a-f0-9]{40})/);
 if(source)entry.provenance.ref=source[2];
 if(entry.package?.ref==='main'&&revisions.has(entry.package.repo))entry.package.ref=revisions.get(entry.package.repo);
}
snapshot.sourceRevisions=Object.fromEntries(revisions);
await writeFile('src/preview/community-catalog.json',JSON.stringify(snapshot));
