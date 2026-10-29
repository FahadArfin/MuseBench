import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {directory,readBytes,atomicWrite,checkPath} from './storage.mjs';
import {collectSite,validateBundle,bundleFromFiles,starterSite,readSiteFile,replaceSiteFile} from './files.mjs';
import {createNetlifyClient} from './netlify.mjs';
import {sitePreviewUrl} from '../../electron/sites-protocol.mjs';
import {validateArtifact,renderArtifactHtml} from '../shared/work-artifacts.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH=/^[0-9a-f]{64}$/;
const now=()=>new Date().toISOString();
const clone=structuredClone;
const label=(value,max=160,empty=false)=>{if(typeof value!=='string'||value.includes('\0')||value.length>max||(!empty&&!value.trim()))throw Error(`Use ${empty?'up to':'between 1 and'} ${max} characters.`);return value.trim();};
const validId=value=>{if(!UUID.test(value??''))throw Error('Choose a saved site or version.');return value;};
const url=value=>{try{const parsed=new URL(value);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?parsed.href:null;}catch{return null;}};
const slug=value=>{if(typeof value!=='string'||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value))throw Error('Use 3–63 lowercase letters, numbers or hyphens for the site address.');return value;};
const slugFor=(title,id)=>`${title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'my-site'}-${id.slice(0,8)}`;
const fields={create:['title','description','template'],select:['id'],saveFile:['path','text'],saveVersion:['label'],publish:['versionId'],restore:['versionId'],unpublish:[],refresh:[],resetPublication:['confirmed'],update:['title','description','slug'],disconnect:[],chooseTeam:['teamId'],fromWork:['id'],generate:['text'],stop:[],clearError:[]};

export async function createSitesService({dataDir,encrypt,decrypt,providerFactory=createNetlifyClient,clientId='',workArtifact,generatorFactory,openExternal}={}){
 await directory(dataDir);const bundleDir=await directory(path.join(dataDir,'bundles')),manifestFile=path.join(dataDir,'library.json'),vaultFile=path.join(dataDir,'hosting.bin');
 let records=new Map(),activeId=null,readable=true,error=null,notice=null,busy=false,operation=null,closed=false,closing=false,pending=Promise.resolve();
 let credentials=null,teamId=null,authTicket=null,providerToken=null;
 const listeners=new Set();
 const redact=err=>{let text=String(err?.message??err).slice(0,1800);for(const secret of [credentials?.token,providerToken,authTicket?.id])if(secret)text=text.split(secret).join('[redacted]');return text;};
 const provider=providerFactory({getToken:()=>providerToken??credentials?.token??'',clientId});
 let generator=null;
 const bundlePath=(id,hash)=>{validId(id);if(!HASH.test(hash??''))throw Error('Invalid saved site revision.');return path.join(bundleDir,`${id}-${hash}.json`);};
 const saveBundle=async(id,value)=>{const bundle=validateBundle(value);await atomicWrite(bundlePath(id,bundle.hash),JSON.stringify(bundle));return bundle;};
 const loadBundle=async(id,hash)=>{const bundle=validateBundle(JSON.parse((await readBytes(bundlePath(id,hash),38*1024*1024)).toString('utf8')));if(bundle.hash!==hash)throw Error('Saved site content no longer matches its immutable version.');return bundle;};
 let currentBundle=null;
 try{
  const saved=JSON.parse((await readBytes(manifestFile,4*1024*1024)).toString('utf8'));
  if(saved.version!==1||!Array.isArray(saved.sites)||saved.sites.length>50)throw Error('Unsupported Sites library.');
  for(const record of saved.sites){
   const item=record?.item;validId(item?.id);label(item.title);label(item.description,2000,true);slug(item.slug);
   if(!HASH.test(item.draftHash)||!Array.isArray(record.versions)||record.versions.length>30||records.has(item.id))throw Error('Invalid Sites library record.');
   for(const version of record.versions){validId(version.id);if(!HASH.test(version.hash)||!Number.isInteger(version.number)||version.number<1)throw Error('Invalid saved version.');}
   item.url=url(item.url);records.set(item.id,record);
  }
  activeId=records.has(saved.activeId)?saved.activeId:null;teamId=typeof saved.teamId==='string'?saved.teamId:null;
  if(activeId)currentBundle=await loadBundle(activeId,records.get(activeId).item.draftHash);
 }catch(caught){if(caught.code!=='ENOENT'){readable=false;error=`Saved Sites data could not be opened. The original files were preserved. ${redact(caught)}`;records.clear();activeId=null;}}
 try{
  const saved=JSON.parse(await decrypt(await readBytes(vaultFile,128*1024)));
  if(typeof saved.token!=='string'||!saved.token||saved.token.length>4096||typeof saved.id!=='string'||!Array.isArray(saved.teams))throw Error('Invalid saved hosting connection.');credentials=saved;
 }catch(caught){if(caught.code!=='ENOENT')error=`The hosting connection could not be opened. Reconnect in Sites settings. ${redact(caught)}`;}
 const record=()=>{const value=records.get(activeId);if(!value)throw Error('Create or choose a site first.');return value;};
 const persist=async()=>{if(!readable)throw Error('The saved Sites library could not be read. Its original files are preserved.');await atomicWrite(manifestFile,JSON.stringify({version:1,activeId,teamId,sites:[...records.values()]}));};
 const requireIdle=()=>{if(generator?.getState().busy)throw Error('Finish or stop the Muse request before changing or publishing this site.');};
 const requireConnection=record=>{if(!credentials)throw Error('Connect your hosting account in Sites settings before publishing.');const owner=record?.remote?.userId??record?.pending?.userId;if(owner&&owner!==credentials.id)throw Error('Connect the same hosting account that created this site.');};
 function getState(){
  const value=records.get(activeId);return clone({items:[...records.values()].map(r=>r.item).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),activeId,site:value?.item??null,files:(currentBundle?.files??[]).map(({path,bytes,sha1,mime})=>({path,bytes,sha1,mime})),versions:value?[...value.versions].reverse():[],previewUrl:value&&currentBundle?sitePreviewUrl(value.item.id,currentBundle.hash):null,
   hosting:{connected:!!credentials,accountName:credentials?.name??null,teams:credentials?.teams??[],teamId,oauthAvailable:!!clientId,authPending:!!authTicket},busy,operation,error,notice,recovery:value?.pending?.notFound?{canReset:true,message:'No matching hosting operation was found. Check Netlify before resetting this pending action.'}:null,generation:generator?.getState()??null});
 }
 function getUpdateState(){return{busy,site:{title:records.get(activeId)?.item?.title??null},generation:generator?generator.getUpdateState():null};}
 const emit=()=>{if(closed||closing)return;for(const listener of listeners)try{listener(getState());}catch{}};
 const setOperation=(phase,message)=>{operation={phase,message};emit();};
 async function execute(action,{allowGeneration=false}={}){
  if(closed||closing)return getState();
  if(busy){error='Another Sites action is still running.';emit();return getState();}
  busy=true;error=null;notice=null;emit();
  const work=(async()=>{try{if(!readable)throw Error('The saved Sites library is unreadable. Its original file was preserved.');if(!allowGeneration)requireIdle();await action();}catch(caught){error=redact(caught);}finally{busy=false;operation=null;emit();}return getState();})();pending=work;return work;
 }
 async function create(value,bundle,source){
  if(records.size>=50)throw Error('This library has reached its 50 site limit.');
  const id=randomUUID(),createdAt=now(),title=label(value.title),description=label(value.description??'',2000,true);bundle=await saveBundle(id,bundle);
  const item={id,title,description,slug:slugFor(title,id),createdAt,updatedAt:createdAt,source,draftHash:bundle.hash,liveVersionId:null,url:null,remoteId:null,remoteName:null,status:'draft'};
  records.set(id,{item,versions:[],remote:null,pending:null});activeId=id;currentBundle=bundle;await persist();await generator?.select(id);notice='Draft created. Nothing has been published.';
 }
 async function saveDraft(value,bundle,source){bundle=await saveBundle(value.item.id,bundle);value.item.draftHash=bundle.hash;value.item.updatedAt=now();if(source)value.item.source=source;if(activeId===value.item.id)currentBundle=bundle;await persist();}
 async function safeCredentialStore(value){
  if(typeof encrypt!=='function')throw Error('Windows credential protection is unavailable.');
  const bytes=await encrypt(JSON.stringify(value));if(!bytes?.length)throw Error('Windows credential protection is unavailable.');
  await atomicWrite(vaultFile,bytes);
 }
 async function credentialPreflight(token){
  if(typeof token!=='string'||token.length<10||token.length>4096||/[\s\x00-\x1f]/.test(token))throw Error('Enter a valid hosting token in this app, not in chat.');
  if(typeof encrypt!=='function')throw Error('Windows credential protection is unavailable.');
  const testFile=path.join(dataDir,`.connection-${randomUUID()}.tmp`);try{await atomicWrite(testFile,await encrypt(token));}finally{await checkPath(testFile,{missing:true});await fs.unlink(testFile).catch(()=>{});}
 }
 async function connectToken(token){
  authTicket=null;
  await credentialPreflight(token);providerToken=token;
  try{const identity=await provider.identity(),teams=await provider.teams();if(!identity?.id||!Array.isArray(teams)||teams.length>100)throw Error('Hosting account could not be verified.');const value={token,id:identity.id,name:identity.name,teams};await safeCredentialStore(value);credentials=value;if(!teams.some(t=>t.id===teamId))teamId=teams.length===1?teams[0].id:null;await persist();notice='Hosting connected. Publish a saved version when you are ready.';}finally{providerToken=null;}
 }
 const marker=(value,version)=>`MuseBench ${value.item.id} ${version.id} ${randomUUID()}`;
 function adoptRemote(value,remote){
  if(!remote?.id||typeof remote.name!=='string')throw Error('The host returned an invalid site.');
  if(value.remote?.id&&value.remote.id!==remote.id)throw Error('The hosting response belongs to another site.');
  const expectedTeam=value.remote?.teamId??value.pending?.teamId??teamId;
  if(expectedTeam&&remote.accountId&&remote.accountId!==expectedTeam)throw Error('The hosting response belongs to another team.');
  value.remote={id:remote.id,userId:credentials.id,teamId:expectedTeam,publishedDeployId:remote.publishedDeployId??null};value.item.remoteId=remote.id;value.item.remoteName=remote.name;value.item.url=url(remote.url);
 }
 async function confirmDeploy(value,version){
  const result=await provider.getDeploy(value.remote.id,version.deployId);if(result.id!==version.deployId)throw Error('The host returned a different deployment.');
  if(['error','failed','rejected'].includes(result.state)){version.status='failed';version.error=label(String(result.error||'Hosting deployment failed.'),1800);value.pending=null;await persist();throw Error(version.error);}
  if(result.state==='ready'){
   const remote=await provider.getSite(value.remote.id);adoptRemote(value,remote);version.status='ready';version.error=null;
   if(remote.publishedDeployId===version.deployId){value.item.liveVersionId=version.id;value.item.status='live';value.pending=null;notice=`Version ${version.number} is live.`;}
   else{value.item.status=remote.publishedDeployId?'unknown':'unpublished';value.item.liveVersionId=value.versions.find(v=>v.deployId===remote.publishedDeployId)?.id??null;value.pending=null;notice='The deployment is ready, but the host has not made it the production version. Check hosting settings.';}
  }else{version.status='processing';notice='The host is processing this version. Refresh to check its status.';}
  await persist();
 }
 async function upload(value,version){
  const bundle=await loadBundle(value.item.id,version.hash);setOperation('uploading',`Uploading version ${version.number}…`);
  const existing=await provider.getDeploy(value.remote.id,version.deployId);
  if(['ready','error','failed','rejected'].includes(existing.state)){await confirmDeploy(value,version);return;}
  if(existing.state==='preparing'){version.status='processing';await persist();notice='Preparing the deployment. Refresh in a moment.';return;}
  if(Array.isArray(existing.required))await provider.uploadDeploy(version.deployId,bundle,existing.required);
  else if(version.required)await provider.uploadDeploy(version.deployId,bundle,version.required);
  setOperation('processing','Checking the published version…');await confirmDeploy(value,version);
 }
 async function publish(value,version){
  requireConnection(value);if(value.pending)throw Error('The previous hosting action needs a status refresh before publishing again.');
  const bundle=await loadBundle(value.item.id,version.hash);
  if(version.status==='ready'&&version.deployId){value.pending={type:'restore',versionId:version.id};await persist();setOperation('restoring',`Publishing saved version ${version.number}…`);try{await provider.restore(value.remote.id,version.deployId);await confirmDeploy(value,version);}catch(caught){value.item.status='unknown';await persist();throw caught;}return;}
  if(!value.remote){
   if(credentials.teams.length>1&&!teamId)throw Error('Choose a hosting team in Settings first.');
   if((await provider.listSites()).some(site=>site.name===value.item.slug))throw Error('That address already belongs to a site in this account. Choose another address in Settings.');
   value.pending={type:'create',name:value.item.slug,versionId:version.id,userId:credentials.id,teamId,startedAt:now(),absentBeforeCreate:true};await persist();setOperation('creating','Creating your hosted site…');
   try{const remote=await provider.createSite({name:value.item.slug,teamId});adoptRemote(value,remote);value.pending=null;await persist();}catch(caught){if(caught.outcomeUnknown===false){value.pending=null;await persist();throw caught;}value.item.status='unknown';await persist();throw Error(`The site creation outcome needs a refresh. ${redact(caught)}`);}
  }
  value.pending={type:'deploy',versionId:version.id,title:marker(value,version)};version.deployId=null;delete version.required;version.status='uploading';version.error=null;await persist();
  try{
   setOperation('uploading',`Publishing saved version ${version.number}…`);
   const deploy=await provider.createDeploy(value.remote.id,bundle,{title:value.pending.title});if(!deploy?.id)throw Error('Hosting did not return a deployment ID.');
   version.deployId=deploy.id;version.required=deploy.required??[];await persist();
   if(deploy.state==='ready')await confirmDeploy(value,version);else{await provider.uploadDeploy(deploy.id,bundle,deploy.required??[]);await confirmDeploy(value,version);}
  }catch(caught){if(caught.outcomeUnknown===false&&!version.deployId){version.status='failed';value.pending=null;}else if(version.status!=='failed')version.status='unknown';version.error=redact(caught);await persist();throw Error(`${value.pending?'Publication needs a status refresh.':'Publication failed.'} ${redact(caught)}`);}
 }
 async function refresh(value){
  if(!value.remote&&!value.pending)return;
  requireConnection(value);setOperation('checking','Checking hosting status…');
  if(value.pending?.type==='create'){
   const attempt=value.pending,matches=(await provider.listSites()).filter(s=>s.name===attempt.name);
   const started=Date.parse(attempt.startedAt),candidate=matches[0],created=Date.parse(candidate?.createdAt);
   const ownedNewSite=matches.length===1&&attempt.absentBeforeCreate===true&&attempt.userId===credentials.id&&!!attempt.teamId&&candidate.accountId===attempt.teamId&&Number.isFinite(started)&&created>=started-1000&&created<=started+5*60*1000&&!candidate.publishedDeployId;
   if(!ownedNewSite){value.pending.notFound=matches.length===0;await persist();throw Error('The previous site creation could not be safely confirmed as a new site in your chosen team. Check Netlify before trying again.');}
   adoptRemote(value,matches[0]);value.pending=null;value.item.status='draft';await persist();notice='Hosted site recovered. Publish the saved version when ready.';
  }
  if(value.pending?.type==='deploy'){
   const version=value.versions.find(v=>v.id===value.pending.versionId);if(!version)throw Error('Saved deployment version is missing.');
   if(!version.deployId){const matches=(await provider.listDeploys(value.remote.id)).filter(d=>d.title===value.pending.title);if(matches.length!==1){value.pending.notFound=matches.length===0;await persist();throw Error('The previous deployment could not be confirmed. Check Netlify before starting another deployment.');}version.deployId=matches[0].id;value.pending.notFound=false;await persist();}
   await upload(value,version);return;
  }
  const remote=await provider.getSite(value.remote.id);adoptRemote(value,remote);
  const live=value.versions.find(v=>v.deployId===remote.publishedDeployId);
  value.item.liveVersionId=live?.id??null;value.item.status=remote.publishedDeployId?'live':'unpublished';if(live)live.status='ready';value.pending=null;await persist();
 }
 if(generatorFactory){generator=await generatorFactory({onGenerated:async(id,bundle)=>{const value=records.get(id);if(!value||closing||closed)return;await saveDraft(value,bundle,'muse');notice='Muse updated the local draft. Save a version to publish it.';emit();}});generator.subscribe(emit);if(activeId)await generator.select(activeId);}
 async function perform(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(fields,value.type)||Object.keys(value).some(key=>key!=='type'&&!fields[value.type].includes(key)))throw Error('Unsupported Sites command.');
  switch(value.type){
   case 'clearError':error=null;notice=null;return;
   case 'create':{const title=label(value.title),description=label(value.description??'',2000,true);if(!['landing','portfolio','blank',undefined].includes(value.template))throw Error('Choose a supported starter.');await create({title,description},starterSite(value.template??'landing',title,description),'starter');return;}
   case 'select':{validId(value.id);if(!records.has(value.id))throw Error('Saved site not found.');const bundle=await loadBundle(value.id,records.get(value.id).item.draftHash);await generator?.select(value.id);activeId=value.id;currentBundle=bundle;await persist();return;}
   case 'saveFile':{await saveDraft(record(),replaceSiteFile(currentBundle,value.path,value.text));notice='Local draft saved. Your published site is unchanged.';return;}
   case 'saveVersion':{const r=record();if(r.versions.length>=30)throw Error('This site has reached its 30 saved version limit.');if(r.versions.at(-1)?.hash===r.item.draftHash){notice='These files already have a saved version.';return;}const bundle=await loadBundle(r.item.id,r.item.draftHash);r.versions.push({id:randomUUID(),number:r.versions.length+1,label:label(value.label??'',160,true)||`Version ${r.versions.length+1}`,createdAt:now(),hash:bundle.hash,fileCount:bundle.files.length,bytes:bundle.totalBytes,deployId:null,status:'saved'});r.item.updatedAt=now();await persist();notice='Version saved locally. Publish it when ready.';return;}
   case 'publish':{const r=record(),v=r.versions.find(v=>v.id===validId(value.versionId));if(!v)throw Error('Choose a saved version from this site.');await publish(r,v);return;}
   case 'restore':{const r=record(),v=r.versions.find(v=>v.id===validId(value.versionId));requireConnection(r);if(!v?.deployId||v.status!=='ready')throw Error('Choose a previously published version.');if(r.pending)throw Error('Refresh the previous hosting operation first.');r.pending={type:'restore',versionId:v.id};await persist();setOperation('restoring',`Restoring version ${v.number}…`);try{await provider.restore(r.remote.id,v.deployId);await confirmDeploy(r,v);}catch(caught){r.item.status='unknown';await persist();throw caught;}return;}
   case 'unpublish':throw Error('Manage site availability in the official hosting dashboard. MuseBench cannot verify a takedown through the supported API.');
   case 'refresh':await refresh(record());return;
   case 'resetPublication':{const r=record();requireConnection(r);if(value.confirmed!==true||!r.pending?.notFound)throw Error('Refresh the hosting status and check the provider before resetting a pending action.');const v=r.versions.find(v=>v.id===r.pending.versionId);if(v&&!v.deployId){v.status='failed';v.error='Pending publication reset after a provider check.';}r.pending=null;r.item.status=r.remote?.publishedDeployId?'live':r.remote?'unpublished':'draft';await persist();notice='Pending action reset. Check the host for late deployments before publishing again.';return;}
   case 'update':{const r=record(),nextSlug=slug(value.slug);if(r.remote&&nextSlug!==r.item.slug)throw Error('Manage the published site address in Netlify.');r.item.title=label(value.title);r.item.description=label(value.description,2000,true);r.item.slug=nextSlug;r.item.updatedAt=now();await persist();notice='Site settings saved.';return;}
   case 'chooseTeam':if(!credentials?.teams.some(t=>t.id===value.teamId))throw Error('Choose one of your connected hosting teams.');teamId=value.teamId;await persist();return;
   case 'disconnect':await checkPath(vaultFile,{missing:true});await fs.unlink(vaultFile).catch(caught=>{if(caught.code!=='ENOENT')throw caught;});credentials=null;teamId=null;authTicket=null;await persist();notice='Hosting disconnected. Published sites remain online.';return;
   case 'fromWork':{if(!workArtifact)throw Error('Private Work is unavailable.');const artifact=validateArtifact(await workArtifact(validId(value.id)));await create({title:artifact.title,description:'Published from a private Work artifact.'},bundleFromFiles([{path:'index.html',data:renderArtifactHtml(artifact,{exportMode:true,theme:'light'})}]),'work');notice='Artifact copied to a local site draft. Its source annotations are included; private chat and source attachments are not.';return;}
   case 'generate':{if(!generator)throw Error('Muse generation is unavailable.');const r=record();await generator.generate({siteId:r.item.id,title:r.item.title,text:label(value.text,12000),bundle:await loadBundle(r.item.id,r.item.draftHash)});return;}
  }
 }
 return{
  getState,getUpdateState,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  dispatch(value){if(value?.type==='stop'){error=null;return Promise.resolve(generator?.stop()).then(()=>{emit();return getState();},caught=>{error=redact(caught);emit();return getState();});}return execute(()=>perform(value),{allowGeneration:value?.type==='clearError'});},
  connect(value){return execute(async()=>{if(value?.oauth){if(!clientId)throw Error('A registered MuseBench OAuth application is needed for browser sign-in.');await credentialPreflight('connection-storage-preflight');authTicket=await provider.beginAuth();authTicket.createdAt=Date.now();await openExternal?.(authTicket.url);notice='Finish signing in on the official Netlify page, then check the connection.';}else await connectToken(value?.token);});},
  pollAuth(){return execute(async()=>{if(!authTicket)throw Error('Start the hosting sign-in first.');if(Date.now()-authTicket.createdAt>10*60*1000){authTicket=null;throw Error('Sign-in timed out. Start again.');}const result=await provider.checkAuth(authTicket.id);if(!result.authorized){notice='Waiting for confirmation on the official Netlify page.';return;}const {token}=await provider.finishAuth(authTicket.id);authTicket=null;await connectToken(token);});},
  importFolder(folder,{replaceId=null}={}){return execute(async()=>{const bundle=await collectSite(folder);if(replaceId){const r=record();if(r.item.id!==replaceId)throw Error('The selected site changed. Choose the folder again.');await saveDraft(r,bundle,'folder');notice='Files replaced in the local draft. Published versions are unchanged.';}else await create({title:path.basename(folder),description:''},bundle,'folder');});},
  async readFile(file){if(!currentBundle)throw Error('Choose a site first.');return{text:readSiteFile(currentBundle,file)};},
  async getBundle(id,hash){if(closed||closing||!UUID.test(id??'')||!HASH.test(hash??''))return null;const r=records.get(id);if(!r||id!==activeId||(hash!==r.item.draftHash&&!r.versions.some(v=>v.hash===hash)))return null;return loadBundle(id,hash);},
  async close(){if(closing)return pending;closing=true;await generator?.close();await pending;closed=true;listeners.clear();},
 };
}
