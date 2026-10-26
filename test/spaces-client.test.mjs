import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSpacesClient,parseSpaceInvitation,spaceServerUrl} from '../src/spaces/client.mjs';
import {createSpacesHub} from '../src/spaces/hub.mjs';
import {demoArtifact} from '../src/shared/work-artifacts.mjs';

const secret='a'.repeat(43),spaceId=randomUUID();
test('invitations require exact scheme, UUID, strong secret and HTTPS except loopback',()=>{
 const valid=`musebench-space://join?server=${encodeURIComponent('https://example.com')}&space=${spaceId}#${secret}`;
 assert.deepEqual(parseSpaceInvitation(valid),{url:'https://example.com',spaceId,secret});
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com/path','file:///C:/file','https://example.com/?key=x'])assert.throws(()=>spaceServerUrl(url));
 assert.equal(spaceServerUrl('http://127.0.0.1:5432/'),'http://127.0.0.1:5432');
 for(const value of [valid.replace('#'+secret,'#short'),valid.replace(spaceId,'../private'),valid.replace('join?','else?'),valid+'&unexpected'])assert.throws(()=>parseSpaceInvitation(value));
});
test('client persists encrypted membership only, snapshots never expose credentials',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-spaces-client-'));
 const snapshot={space:{id:spaceId,name:'Launch',description:'',createdAt:new Date().toISOString()},self:{id:randomUUID(),name:'Ada',role:'owner'},members:[],pages:[],invites:[]};
 const requests=[];
 const fetcher=async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify(snapshot),{headers:{'content-type':'application/json'}});};
 const encrypt=text=>Buffer.from(text).map(byte=>byte^0x55),decrypt=data=>Buffer.from(data).map(byte=>byte^0x55).toString();
 let created=0;
 const client=await createSpacesClient({dataDir:dir,encrypt,decrypt,fetcher,getLocalHub:async()=>({url:'http://127.0.0.1:4123',createSpace:async()=>{created++;return{spaceId,token:secret};}})});
 const result=await client.dispatch({type:'create',name:'Launch',description:'',displayName:'Ada'});
 assert.equal(result.snapshot.space.name,'Launch');assert.equal(created,1);assert.equal(result.spaces.length,1);
 assert(!JSON.stringify(result).includes(secret));assert(!JSON.stringify(result).includes('token'));
 assert.equal(requests[0].options.redirect,'error');assert.equal(requests[0].options.headers.Authorization,`Bearer ${secret}`);
 const bytes=await readFile(path.join(dir,'connections.bin'));assert(!bytes.toString().includes(secret));
 await client.close();
 const restored=await createSpacesClient({dataDir:dir,encrypt,decrypt,fetcher});assert.equal(restored.getState().spaces.length,1);assert.equal(restored.getState().snapshot,null);await restored.close();
});
test('revocation clears downloaded state and conflicts keep existing page with a visible error',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-spaces-client-')),pageId=randomUUID();let mode='ok';
 const snapshot={space:{id:spaceId,name:'Launch'},self:{id:randomUUID(),name:'Ada',role:'owner'},members:[],pages:[],invites:[]};
 const client=await createSpacesClient({dataDir:dir,encrypt:text=>Buffer.from(text),decrypt:b=>b.toString(),getLocalHub:async()=>({url:'http://127.0.0.1:4123',createSpace:async()=>({spaceId,token:secret})}),fetcher:async(_url,options)=>{
  const body=JSON.parse(options.body);
  if(mode==='revoked')return Response.json({error:'Access revoked',code:'FORBIDDEN'},{status:403});
  if(body.op==='savePage')return Response.json({error:'Changed by another member',code:'CONFLICT'},{status:409});
  if(body.op==='page')return Response.json({page:{id:pageId,title:'Note',type:'note',body:'Original',revision:1},comments:[],history:[]});
  return Response.json(snapshot);
 }});
 await client.dispatch({type:'create',name:'Launch',description:'',displayName:'Ada'});await client.dispatch({type:'openPage',pageId});
 let state=await client.dispatch({type:'savePage',pageId,title:'New',body:'Draft',expectedRevision:1});assert.equal(state.conflict,true);assert.equal(state.page.body,'Original');
 state=await client.dispatch({type:'refresh'});assert.equal(state.conflict,true);
 mode='revoked';state=await client.dispatch({type:'refresh'});assert.equal(state.page,null);assert.equal(state.snapshot,null);assert.match(state.error,/revoked/);await client.close();
});
test('two real clients publish, collaborate, detect conflicts, copy privately and revoke access',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-spaces-roundtrip-'));
 const hub=await createSpacesHub({dataDir:path.join(root,'hub')});
 const storage={encrypt:s=>Buffer.from(s).map(b=>b^0x55),decrypt:b=>Buffer.from(b).map(b=>b^0x55).toString()};
 const artifact=demoArtifact('dashboard','finance');let copies=0,published=0;
 const owner=await createSpacesClient({dataDir:path.join(root,'owner'),...storage,getLocalHub:async()=>hub,publishWork:async()=>{published++;return artifact;}});
 const peer=await createSpacesClient({dataDir:path.join(root,'peer'),...storage,copyToWork:async value=>{copies++;assert.deepEqual(value,artifact);}});
 try{
  let state=await owner.dispatch({type:'create',name:'Launch room',description:'Fixture space',displayName:'Owner'});assert.equal(state.error,null);
  state=await owner.dispatch({type:'savePage',title:'Brief',body:'First version'});assert.equal(state.error,null);const pageId=state.page.id;
  state=await owner.dispatch({type:'invite',role:'editor'});assert.equal(state.error,null);
  let other=await peer.dispatch({type:'join',invitation:state.invitation.text,displayName:'Editor'});assert.equal(other.error,null);assert.equal(other.snapshot.self.role,'editor');
  other=await peer.dispatch({type:'openPage',pageId});assert.equal(other.page.body,'First version');
  state=await owner.dispatch({type:'savePage',pageId,expectedRevision:1,title:'Brief',body:'Owner edit'});assert.equal(state.page.revision,2);
  other=await peer.dispatch({type:'savePage',pageId,expectedRevision:1,title:'Brief',body:'Stale edit'});assert.equal(other.conflict,true);assert.equal(other.page.body,'First version');
  other=await peer.dispatch({type:'openPage',pageId});assert.equal(other.page.body,'Owner edit');assert.equal(other.conflict,false);
  other=await peer.dispatch({type:'comment',pageId,text:'Reviewed'});assert.equal(other.comments.length,1);
  state=await owner.dispatch({type:'publishWork',workId:randomUUID()});assert.equal(state.error,null);const artifactId=state.page.id;assert.equal(published,1);assert.deepEqual(state.page.artifact,artifact);
  other=await peer.dispatch({type:'openPage',pageId:artifactId});assert.deepEqual(await peer.getArtifact(artifactId),artifact);
  other=await peer.dispatch({type:'copyToWork',pageId:artifactId,team:'finance'});assert.equal(other.error,null);assert.equal(copies,1);
  const memberId=other.snapshot.self.id;await owner.dispatch({type:'removeMember',memberId});
  other=await peer.dispatch({type:'refresh'});assert(other.error);assert.equal(other.page,null);assert.equal(await peer.getArtifact(artifactId),null);
 }finally{await owner.close();await peer.close();await hub.close();}
});

test('owned hub credentials are not sent when its local listener cannot be started',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-spaces-owned-'));let unavailable=false,requests=0;
 const client=await createSpacesClient({dataDir:dir,encrypt:s=>Buffer.from(s),decrypt:b=>b.toString(),getLocalHub:async()=>{if(unavailable)throw Error('Saved local port is in use');return{url:'http://127.0.0.1:4123',createSpace:async()=>({spaceId,token:secret})};},fetcher:async()=>{requests++;return Response.json({space:{id:spaceId,name:'Room'},self:{id:randomUUID(),name:'Owner',role:'owner'},members:[],pages:[],invites:[]});}});
 await client.dispatch({type:'create',name:'Room',description:'',displayName:'Owner'});assert.equal(requests,1);unavailable=true;
 const state=await client.dispatch({type:'refresh'});assert.match(state.error,/port is in use/);assert.equal(requests,1);await client.close();
});

test('switching to a new space removes the previously generated invitation',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-spaces-invitation-')),hub=await createSpacesHub({dataDir:path.join(root,'hub')});
 const client=await createSpacesClient({dataDir:path.join(root,'client'),encrypt:s=>Buffer.from(s),decrypt:b=>b.toString(),getLocalHub:async()=>hub});
 try{await client.dispatch({type:'create',name:'First',description:'',displayName:'Owner'});await client.dispatch({type:'invite',role:'viewer'});assert(client.getState().invitation);const state=await client.dispatch({type:'create',name:'Second',description:'',displayName:'Owner'});assert.equal(state.error,null);assert.equal(state.invitation,null);}finally{await client.close();await hub.close();}
});

test('unavailable credential protection prevents create and invite exchange before either is committed',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-spaces-protection-'));let calls=0;
 const client=await createSpacesClient({dataDir:dir,encrypt:()=>{throw Error('Protection unavailable');},decrypt:b=>b.toString(),getLocalHub:async()=>{calls++;throw Error('Should not run');},fetcher:async()=>{calls++;throw Error('Should not run');}});
 let state=await client.dispatch({type:'create',name:'Room',description:'',displayName:'Owner'});assert.match(state.error,/Protection unavailable/);
 state=await client.dispatch({type:'join',invitation:`musebench-space://join?server=${encodeURIComponent('https://example.com')}&space=${spaceId}#${secret}`,displayName:'Guest'});assert.match(state.error,/Protection unavailable/);assert.equal(calls,0);await client.close();
});
