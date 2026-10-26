import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSitesService} from '../src/sites/index.mjs';

async function fixture(options={}){
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'muse-sites-')),calls=[];let token='',remote=null,deploys=[],publishReady=true;
 const provider={identity:async()=>({id:'user-one',name:'Test user'}),teams:async()=>[{id:'team-one',slug:'test-team',name:'Test team'}],
  createSite:async value=>{calls.push(['create',value]);remote={id:'remote-one',name:value.name,url:`https://${value.name}.netlify.app`,publishedDeployId:null,accountId:value.teamId,createdAt:new Date().toISOString()};return remote;},
  getSite:async()=>remote,listSites:async()=>remote?[remote]:[],listDeploys:async()=>deploys,
  createDeploy:async(id,bundle,{title})=>{calls.push(['deploy',structuredClone(bundle)]);const d={id:`deploy-${deploys.length+1}`,state:'uploading',required:bundle.files.map(f=>f.sha1),title};deploys.push(d);return d;},
  uploadDeploy:async id=>{calls.push(['upload',id]);const d=deploys.find(x=>x.id===id);d.state=publishReady?'ready':'processing';if(publishReady)remote.publishedDeployId=id;},
  getDeploy:async(_,id)=>deploys.find(x=>x.id===id),restore:async(_,id)=>{calls.push(['restore',id]);remote.publishedDeployId=id;return remote;},unpublish:async()=>{throw Error('Unsupported');}};
 const encrypt=value=>Buffer.from('cipher:'+Buffer.from(value).toString('base64')),decrypt=value=>Buffer.from(value.toString().slice(7),'base64').toString();
 const create=()=>createSitesService({dataDir,encrypt,decrypt,providerFactory:({getToken})=>{token=getToken();return provider;},...options});
 const service=await create();return{service,dataDir,calls,provider,create,encrypt,decrypt,setReady:value=>publishReady=value};
}
const draft=s=>s.dispatch({type:'create',title:'Our studio',description:'A useful site',template:'landing'});
const connect=s=>s.connect({token:'private-token-for-tests'});

test('explicit token connection cancels a pending browser sign-in',async()=>{
 const f=await fixture({clientId:'registered-app'});let polls=0;
 f.provider.beginAuth=async()=>({id:'ticket',url:'https://app.netlify.com/authorize'});
 f.provider.checkAuth=async()=>{polls++;return{authorized:true};};
 let state=await f.service.connect({oauth:true});assert.equal(state.hosting.authPending,true);
 state=await connect(f.service);assert.equal(state.hosting.authPending,false);assert.equal(state.hosting.connected,true);
 state=await f.service.pollAuth();assert.match(state.error,/start.*sign-in/i);assert.equal(polls,0);await f.service.close();
});

test('existing names are rejected before create, and unknown create recovery requires new same-team provenance',async()=>{
 for(const mismatch of ['preexisting','team','date','production','account']){
  const f=await fixture();await draft(f.service);await connect(f.service);let state=await f.service.dispatch({type:'saveVersion'});const name=state.site.slug;
  const candidate={id:'existing-production',name,accountId:'team-one',createdAt:new Date().toISOString(),publishedDeployId:null};
  if(mismatch==='preexisting')f.provider.listSites=async()=>[candidate];
  else f.provider.createSite=async()=>{f.provider.listSites=async()=>[candidate];throw Error('Connection lost');};
  state=await f.service.dispatch({type:'publish',versionId:state.versions[0].id});assert(state.error);
  if(mismatch==='team')candidate.accountId='another-team';
  if(mismatch==='date')candidate.createdAt='2020-01-01T00:00:00.000Z';
  if(mismatch==='production')candidate.publishedDeployId='customer-live-deploy';
  if(mismatch==='account'){f.provider.identity=async()=>({id:'different-user',name:'Different account'});await connect(f.service);}
  state=await f.service.dispatch({type:'refresh'});assert.equal(state.site.remoteId,null,mismatch);assert.equal(f.calls.filter(c=>c[0]==='deploy').length,0);await f.service.close();
 }
});

test('drafts and immutable saved versions survive restart without publishing',async()=>{
 const f=await fixture();let state=await draft(f.service);assert.equal(state.site.status,'draft');assert.equal(f.calls.length,0);
 state=await f.service.dispatch({type:'saveVersion',label:'First'});const version=state.versions[0];const before=await f.service.getBundle(state.site.id,version.hash);
 state=await f.service.dispatch({type:'saveFile',path:'index.html',text:'<!doctype html><h1>New draft</h1>'});assert.notEqual(state.site.draftHash,version.hash);assert.deepEqual(await f.service.getBundle(state.site.id,version.hash),before);
 await f.service.close();const reopened=await f.create();assert.equal(reopened.getState().versions.length,1);assert.match((await reopened.readFile('index.html')).text,/New draft/);await reopened.close();
});
test('publish requires connection and saves the exact selected version, not a changed draft',async()=>{
 const f=await fixture();await draft(f.service);let state=await f.service.dispatch({type:'saveVersion'});const v=state.versions[0];
 state=await f.service.dispatch({type:'publish',versionId:v.id});assert.match(state.error,/connect/i);assert.equal(f.calls.length,0);
 await connect(f.service);await f.service.dispatch({type:'chooseTeam',teamId:'team-one'});await f.service.dispatch({type:'saveFile',path:'index.html',text:'<!doctype html><h1>Not published</h1>'});
 state=await f.service.dispatch({type:'publish',versionId:v.id});assert.equal(state.error,null);assert.equal(state.site.status,'live');assert.equal(state.site.liveVersionId,v.id);
 assert.equal(f.calls.find(x=>x[0]==='deploy')[1].hash,v.hash);assert(!JSON.stringify(state).includes('private-token-for-tests'));
 const vault=await readFile(path.join(f.dataDir,'hosting.bin'));assert(!vault.includes(Buffer.from('private-token-for-tests')));await f.service.close();
});
test('processing is not live and refreshing verifies the production deploy association',async()=>{
 const f=await fixture();f.setReady(false);await draft(f.service);await connect(f.service);let state=await f.service.dispatch({type:'saveVersion'});
 state=await f.service.dispatch({type:'publish',versionId:state.versions[0].id});assert.notEqual(state.site.status,'live');assert.equal(state.versions[0].status,'processing');
 await f.service.close();const reopened=await f.create();const refreshed=await reopened.dispatch({type:'refresh'});assert.notEqual(refreshed.site.status,'live');await reopened.close();
});
test('ambiguous remote create is reconciled by saved unique name without another create request',async()=>{
 const f=await fixture(),create=f.provider.createSite;f.provider.createSite=async arg=>{await create(arg);throw Error('Connection lost');};await draft(f.service);await connect(f.service);let state=await f.service.dispatch({type:'saveVersion'});
 state=await f.service.dispatch({type:'publish',versionId:state.versions[0].id});assert.equal(state.site.status,'unknown');assert.equal(f.calls.filter(x=>x[0]==='create').length,1);
 state=await f.service.dispatch({type:'refresh'});assert.equal(state.site.remoteId,'remote-one');assert.equal(f.calls.filter(x=>x[0]==='create').length,1);await f.service.close();
});
test('ambiguous deployment recovers its durable version marker without a duplicate deploy',async()=>{
 const f=await fixture(),deploy=f.provider.createDeploy;f.provider.createDeploy=async(...args)=>{await deploy(...args);throw Error('Connection lost');};await draft(f.service);await connect(f.service);let state=await f.service.dispatch({type:'saveVersion'});
 state=await f.service.dispatch({type:'publish',versionId:state.versions[0].id});assert.equal(state.versions[0].status,'unknown');state=await f.service.dispatch({type:'refresh'});
 assert.equal(state.error,null);assert.equal(state.site.status,'live');assert.equal(f.calls.filter(x=>x[0]==='deploy').length,1);await f.service.close();
});
test('unavailable credential encryption blocks connection before network and preserves previous state',async()=>{
 let calls=0;const f=await fixture({encrypt:()=>{throw Error('Protection unavailable');}});f.provider.identity=async()=>{calls++;return{id:'x',name:'x'};};
 const state=await connect(f.service);assert.match(state.error,/Protection unavailable/);assert.equal(calls,0);assert.equal(state.hosting.connected,false);await f.service.close();
});
test('rollback is explicit and never changes draft content',async()=>{
 const f=await fixture();await draft(f.service);await connect(f.service);let state=await f.service.dispatch({type:'saveVersion'});const first=state.versions[0];await f.service.dispatch({type:'publish',versionId:first.id});
 await f.service.dispatch({type:'saveFile',path:'index.html',text:'<!doctype html><h1>Second</h1>'});state=await f.service.dispatch({type:'saveVersion'});await f.service.dispatch({type:'publish',versionId:state.versions[0].id});
 const draftHash=f.service.getState().site.draftHash;state=await f.service.dispatch({type:'restore',versionId:first.id});assert.equal(state.site.liveVersionId,first.id);assert.equal(state.site.draftHash,draftHash);assert.equal(f.calls.filter(x=>x[0]==='restore').length,1);await f.service.close();
});
test('corrupt saved library is preserved and cannot be overwritten by a new create',async()=>{
 const f=await fixture();await f.service.close();await writeFile(path.join(f.dataDir,'library.json'),'{broken');const s=await f.create();assert(s.getState().error);const state=await draft(s);assert(state.error);assert.equal(await readFile(path.join(f.dataDir,'library.json'),'utf8'),'{broken');await s.close();
});
test('publishing cannot switch selected site during an in-flight external mutation',async()=>{
 const f=await fixture();const second=await draft(f.service);const secondId=second.site.id;await draft(f.service);await connect(f.service);let state=await f.service.dispatch({type:'saveVersion'});let release;const original=f.provider.createSite;f.provider.createSite=async value=>{await new Promise(resolve=>release=resolve);return original(value);};
 const pending=f.service.dispatch({type:'publish',versionId:state.versions[0].id});while(!release)await new Promise(r=>setImmediate(r));const blocked=await f.service.dispatch({type:'select',id:secondId});assert.notEqual(blocked.activeId,secondId);release();await pending;assert.notEqual(f.service.getState().site.id,secondId);await f.service.close();
});
test('publishing an existing ready version restores its deployment rather than creating a duplicate',async()=>{
 const f=await fixture();await draft(f.service);await connect(f.service);let state=await f.service.dispatch({type:'saveVersion'});const version=state.versions[0];await f.service.dispatch({type:'publish',versionId:version.id});state=await f.service.dispatch({type:'publish',versionId:version.id});
 assert.equal(state.error,null);assert.equal(f.calls.filter(c=>c[0]==='deploy').length,1);assert.equal(f.calls.filter(c=>c[0]==='restore').length,1);assert.equal(state.site.liveVersionId,version.id);await f.service.close();
});
test('unknown create with negative discovery can only reset after an explicit provider check',async()=>{
 const f=await fixture();f.provider.createSite=async()=>{throw Error('Lost response');};await draft(f.service);await connect(f.service);let state=await f.service.dispatch({type:'saveVersion'});const version=state.versions[0];await f.service.dispatch({type:'publish',versionId:version.id});
 state=await f.service.dispatch({type:'resetPublication',confirmed:true});assert.match(state.error,/Refresh/);state=await f.service.dispatch({type:'refresh'});assert.equal(state.recovery.canReset,true);
 state=await f.service.dispatch({type:'resetPublication',confirmed:false});assert(state.error);state=await f.service.dispatch({type:'resetPublication',confirmed:true});assert.equal(state.error,null);assert.equal(state.recovery,null);assert.equal(state.site.status,'draft');assert.equal(f.calls.length,0);await f.service.close();
});
test('tampered immutable snapshot is rejected instead of publishing changed bytes',async()=>{
 const f=await fixture();await draft(f.service);await connect(f.service);let state=await f.service.dispatch({type:'saveVersion'});const version=state.versions[0],filename=path.join(f.dataDir,'bundles',`${state.site.id}-${version.hash}.json`);const saved=JSON.parse(await readFile(filename,'utf8'));saved.files[0].data=Buffer.from('<h1>Tampered</h1>').toString('base64');await writeFile(filename,JSON.stringify(saved));
 state=await f.service.dispatch({type:'publish',versionId:version.id});assert.match(state.error,/immutable/);assert.equal(f.calls.filter(c=>c[0]==='deploy').length,0);await f.service.close();
});
