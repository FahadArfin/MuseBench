import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const hubModule = await import('../src/spaces/hub.mjs').catch(() => ({}));
const note = {op:'savePage',type:'note',title:'Shared plan',body:'A private draft explicitly published.'};
const artifact = {version:1,kind:'document',title:'Report',summary:'Shared result',sections:[{heading:'Finding',body:'42'}]};

async function fixture(t, options = {}) {
  assert.equal(typeof hubModule.createSpacesHub, 'function', 'the Spaces hub must be implemented');
  const dataDir = await mkdtemp(path.join(tmpdir(), 'musebench-spaces-'));
  const hubs = [];
  t.after(async () => {for (const hub of hubs) await hub.close(); await rm(dataDir,{recursive:true,force:true});});
  const start = async () => {const hub = await hubModule.createSpacesHub({dataDir,...options}); hubs.push(hub); return hub;};
  const hub = await start();
  const owner = await hub.createSpace({name:'Planning',description:'Shared research',displayName:'Alice'});
  const client = credential => async body => request(hub.url, {...body,spaceId:body.spaceId ?? credential.spaceId}, credential.token);
  return {hub,owner,client,dataDir,start};
}

async function request(url, body, token, extra = {}) {
  const response = await fetch(`${url}/v1`, {method:'POST',headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {}),...extra},body:JSON.stringify(body)});
  const result = await response.json();
  return {status:response.status,body:result,headers:response.headers};
}
function ok(result) {assert.equal(result.status,200,JSON.stringify(result.body)); return result.body;}
function denied(result, status = 403) {assert.equal(result.status,status,JSON.stringify(result.body)); assert.equal(typeof result.body.error,'string'); assert.equal(typeof result.body.code,'string');}
function rawRequest(url,body,headers={}) {
  return new Promise((resolve,reject)=>{
    const req=http.request(`${url}/v1`,{method:'POST',headers:{'Content-Type':'application/json',...headers}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const value=Buffer.concat(chunks).toString();resolve({status:res.statusCode,body:value ? JSON.parse(value) : {}});});
    });
    req.on('error',reject);req.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}
async function member(f, role = 'editor', displayName = 'Bob') {
  const invitation = ok(await f.client(f.owner)({op:'invite',role}));
  return ok(await request(f.hub.url,{op:'join',spaceId:f.owner.spaceId,secret:invitation.secret,displayName}));
}

test('independent members share pages while read exposes only public membership data', async t => {
  const f = await fixture(t), bob = await member(f), owner = f.client(f.owner), editor = f.client(bob);
  const {pageId} = ok(await editor(note));
  const snapshot = ok(await owner({op:'read'}));
  assert.equal(snapshot.space.name,'Planning');
  assert.deepEqual(snapshot.members.map(m => [m.name,m.role]), [['Alice','owner'],['Bob','editor']]);
  assert.equal(snapshot.self.role,'owner');
  assert.equal(snapshot.pages[0].id,pageId);
  assert.equal(snapshot.pages[0].revision,1);
  assert.equal(snapshot.pages[0].body,undefined);
  assert.equal(snapshot.invites.length,1);
  assert.equal(ok(await editor({op:'read'})).invites.length,0);
  const page = ok(await owner({op:'page',pageId}));
  assert.equal(page.page.body,note.body);
  assert.equal(page.page.updatedBy,'Bob');
  assert.equal(page.historyLimit,30);
  assert.doesNotMatch(JSON.stringify(snapshot),/token|secret|hash/i);
  assert.doesNotMatch(JSON.stringify(page),/token|secret|hash/i);
});

test('missing, invalid, and cross-space membership cannot read or mutate', async t => {
  const f = await fixture(t);
  const second = await f.hub.createSpace({name:'Separate',displayName:'Other'});
  for (const token of [undefined,'invalid','A'.repeat(43),f.owner.token]) {
    denied(await request(f.hub.url,{op:'read',spaceId:second.spaceId},token),401);
    denied(await request(f.hub.url,{...note,spaceId:second.spaceId},token),401);
  }
  denied(await request(f.hub.url,{op:'read'},f.owner.token),400);
  const pageId = ok(await f.client(second)(note)).pageId;
  denied(await f.client(f.owner)({op:'page',pageId}),404);
  assert.equal(ok(await f.client(f.owner)({op:'read'})).pages.length,0);
});

test('invitations are one-use, expire, can be revoked, and cannot cross spaces', async t => {
  const f = await fixture(t), owner = f.client(f.owner);
  const invite = ok(await owner({op:'invite',role:'viewer'}));
  assert.match(invite.secret,/^[A-Za-z0-9_-]{43}$/);
  const results = await Promise.all(['One','Two'].map(displayName => request(f.hub.url,{op:'join',spaceId:f.owner.spaceId,secret:invite.secret,displayName})));
  assert.deepEqual(results.map(r => r.status).sort(),[200,401]);
  const revoked = ok(await owner({op:'invite',role:'editor'}));
  ok(await owner({op:'revokeInvite',inviteId:revoked.id}));
  denied(await request(f.hub.url,{op:'join',spaceId:f.owner.spaceId,secret:revoked.secret,displayName:'No'}),401);
  const expired = ok(await owner({op:'invite',role:'commenter'}));
  const db = new DatabaseSync(path.join(f.dataDir,'spaces.sqlite'));
  try {db.prepare('UPDATE invites SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',expired.id);} finally {db.close();}
  denied(await request(f.hub.url,{op:'join',spaceId:f.owner.spaceId,secret:expired.secret,displayName:'Late'}),401);
  const separate = await f.hub.createSpace({name:'Separate',displayName:'Other'});
  const fresh = ok(await owner({op:'invite',role:'viewer'}));
  denied(await request(f.hub.url,{op:'join',spaceId:separate.spaceId,secret:fresh.secret,displayName:'Wrong space'}),401);
  ok(await request(f.hub.url,{op:'join',spaceId:f.owner.spaceId,secret:fresh.secret,displayName:'Correct space'}));
  denied(await owner({op:'invite',role:'owner'}),400);
});

test('viewers cannot write, commenters can only comment, and owner operations are enforced', async t => {
  const f = await fixture(t), owner = f.client(f.owner);
  const viewer = f.client(await member(f,'viewer')), commenter = f.client(await member(f,'commenter')), editor = f.client(await member(f));
  const {pageId} = ok(await owner(note));
  for (const client of [viewer,commenter]) {
    denied(await client(note));
    denied(await client({...note,pageId,expectedRevision:1}));
    denied(await client({op:'restorePage',pageId,revision:1,expectedRevision:1}));
  }
  denied(await viewer({op:'comment',pageId,text:'No'}));
  ok(await commenter({op:'comment',pageId,text:'Comment permitted'}));
  for (const client of [viewer,commenter,editor]) for (const body of [{op:'invite',role:'viewer'},{op:'removeMember',memberId:'unused'},{op:'revokeInvite',inviteId:'unused'}]) denied(await client(body));
  ok(await editor({...note,pageId,expectedRevision:1,body:'Editor update'}));
  const self = ok(await owner({op:'read'})).self;
  denied(await owner({op:'removeMember',memberId:self.id}),400);
});

test('concurrent page edits conflict atomically and history restore adds a new revision', async t => {
  const f = await fixture(t), owner = f.client(f.owner), editor = f.client(await member(f));
  const {pageId} = ok(await owner(note));
  const results = await Promise.all([owner({...note,pageId,expectedRevision:1,body:'Owner edit'}),editor({...note,pageId,expectedRevision:1,body:'Editor edit'})]);
  assert.deepEqual(results.map(r => r.status).sort(),[200,409]);
  assert.equal(results.find(r => r.status === 409).body.code,'CONFLICT');
  denied(await owner({...note,pageId}),409);
  denied(await owner({...note,pageId,expectedRevision:0}),409);
  denied(await owner({op:'restorePage',pageId,revision:1,expectedRevision:1}),409);
  ok(await owner({op:'restorePage',pageId,revision:1,expectedRevision:2}));
  let data = ok(await owner({op:'page',pageId}));
  assert.equal(data.page.revision,3); assert.equal(data.page.body,note.body);
  assert.deepEqual(data.history.map(r => r.revision),[3,2,1]);
  for (let revision=3;revision<33;revision++) ok(await owner({...note,pageId,expectedRevision:revision,body:`Revision ${revision+1}`}));
  data = ok(await owner({op:'page',pageId}));
  assert.equal(data.history.length,30);
  assert.deepEqual(data.history.map(r => r.revision),Array.from({length:30},(_,i)=>33-i));
  denied(await owner({op:'restorePage',pageId,revision:1,expectedRevision:33}),404);
  assert.equal(ok(await owner({op:'page',pageId})).page.revision,33);
});

test('comments resolve by immutable author identity or editor and reject foreign page identifiers', async t => {
  const f = await fixture(t), owner = f.client(f.owner), author = f.client(await member(f,'commenter','Same')), impostor = f.client(await member(f,'commenter','Same')), editor = f.client(await member(f));
  const {pageId} = ok(await owner(note)), otherPage = ok(await owner({...note,title:'Other'})).pageId;
  const {commentId} = ok(await author({op:'comment',pageId,text:'Please review'}));
  assert.equal(ok(await author({op:'page',pageId})).comments[0].canResolve,true);
  assert.equal(ok(await impostor({op:'page',pageId})).comments[0].canResolve,false);
  assert.equal(ok(await editor({op:'page',pageId})).comments[0].canResolve,true);
  denied(await impostor({op:'resolveComment',pageId,commentId,resolved:true}));
  denied(await author({op:'resolveComment',pageId:otherPage,commentId,resolved:true}),404);
  ok(await author({op:'resolveComment',pageId,commentId,resolved:true}));
  assert.equal(ok(await owner({op:'page',pageId})).comments[0].resolved,true);
  ok(await editor({op:'resolveComment',pageId,commentId,resolved:false}));
  assert.equal(ok(await owner({op:'page',pageId})).comments[0].resolved,false);
  denied(await author({op:'resolveComment',pageId,commentId,resolved:'true'}),400);
});

test('member removal immediately rejects the old token without erasing shared work', async t => {
  const f = await fixture(t), bob = await member(f), owner = f.client(f.owner), editor = f.client(bob);
  const {pageId} = ok(await editor(note));
  ok(await editor({op:'comment',pageId,text:'History remains'}));
  const memberId = ok(await editor({op:'read'})).self.id;
  ok(await owner({op:'removeMember',memberId}));
  denied(await editor({op:'read'}),401);
  denied(await editor({...note,pageId,expectedRevision:1}),401);
  denied(await editor({op:'comment',pageId,text:'Not permitted'}),401);
  assert.equal(ok(await owner({op:'read'})).members.length,1);
  assert.equal(ok(await owner({op:'page',pageId})).comments[0].text,'History remains');
});

test('members, pages, comments, invite lifecycle and hashed credentials survive restart', async t => {
  const f = await fixture(t), owner = f.client(f.owner), bob = await member(f);
  const invite = ok(await owner({op:'invite',role:'viewer'})), used = ok(await owner({op:'invite',role:'viewer'}));
  const removed = ok(await request(f.hub.url,{op:'join',spaceId:f.owner.spaceId,secret:used.secret,displayName:'Removed'}));
  const removedId = ok(await f.client(removed)({op:'read'})).self.id;
  ok(await owner({op:'removeMember',memberId:removedId}));
  const {pageId} = ok(await f.client(bob)(note));
  ok(await f.client(bob)({op:'comment',pageId,text:'Persistent comment'}));
  await f.hub.close();
  const reopened = await f.start();
  const page = ok(await request(reopened.url,{op:'page',spaceId:f.owner.spaceId,pageId},bob.token));
  assert.equal(page.page.body,note.body); assert.equal(page.comments[0].text,'Persistent comment'); assert.equal(page.history.length,1);
  denied(await request(reopened.url,{op:'read',spaceId:f.owner.spaceId},removed.token),401);
  denied(await request(reopened.url,{op:'join',spaceId:f.owner.spaceId,secret:used.secret,displayName:'Replay'}),401);
  ok(await request(reopened.url,{op:'join',spaceId:f.owner.spaceId,secret:invite.secret,displayName:'New viewer'}));
  for (const name of await readdir(f.dataDir)) {
    const bytes = await readFile(path.join(f.dataDir,name));
    for (const secret of [f.owner.token,bob.token,removed.token,invite.secret,used.secret]) assert.equal(bytes.includes(Buffer.from(secret)),false,`plaintext credential in ${name}`);
  }
});

test('artifact publishing whitelists data and malformed or oversized content is rejected', async t => {
  const f = await fixture(t), owner = f.client(f.owner);
  const hostile = '</script><script>globalThis.compromised=true</script>';
  const {pageId} = ok(await owner({op:'savePage',type:'artifact',title:'Report',artifact:{...artifact,script:hostile,localPath:'PRIVATE',sections:[{heading:'Finding',body:hostile,html:hostile}]},sourceFiles:['PRIVATE'],token:'PRIVATE'}));
  const data = ok(await owner({op:'page',pageId}));
  assert.equal(data.page.artifact.sections[0].body,hostile);
  assert.equal(data.page.artifact.script,undefined); assert.equal(data.page.artifact.sections[0].html,undefined);
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE/); assert.equal(globalThis.compromised,undefined);
  for (const content of [{...artifact,kind:'html'}, {...artifact,sections:[]}, {...artifact,sections:[{heading:'Finding',body:{html:hostile}}]}]) denied(await owner({op:'savePage',type:'artifact',title:'Bad',artifact:content}),400);
  denied(await owner({...note,body:'x'.repeat(100001)}),400);
  denied(await owner({op:'comment',pageId,text:'x'.repeat(4001)}),400);
  denied(await owner({...note,type:'executable'}),400);
  assert.equal(ok(await owner({op:'read'})).pages.length,1);
});

test('HTTP refuses browser origins, unknown hosts, credential URLs, oversized or invalid bodies', async t => {
  const f = await fixture(t), body = {op:'read',spaceId:f.owner.spaceId};
  denied(await request(f.hub.url,body,f.owner.token,{Origin:'https://untrusted.invalid'}));
  denied(await rawRequest(f.hub.url,body,{Authorization:`Bearer ${f.owner.token}`,Host:'untrusted.invalid'}));
  denied(await request(f.hub.url,body,f.owner.token,{'Content-Type':'text/plain'}),415);
  denied(await request(f.hub.url,{...note,spaceId:f.owner.spaceId,body:'x'.repeat(800*1024)},f.owner.token),413);
  for (const suffix of ['/v1?token=never','/','/health']) assert.equal((await fetch(f.hub.url+suffix)).status,404);
  assert.equal((await fetch(f.hub.url+'/v1')).status,405);
  const malformed = await fetch(f.hub.url+'/v1',{method:'POST',headers:{'Content-Type':'application/json'},body:'{no'});
  assert.equal(malformed.status,400);
  const response = await f.client(f.owner)({op:'read'});
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  // Declared length is rejected before the body arrives, rather than waiting for an upload.
  const status = await new Promise((resolve,reject) => {
    const req=http.request(f.hub.url+'/v1',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':900000}},res=>{res.resume();resolve(res.statusCode);});
    req.on('error',reject);req.flushHeaders();req.on('response',()=>req.destroy());
  });
  assert.equal(status,413);
});

test('all headers inside the byte limit are checked so a late Origin cannot bypass the policy', async t => {
  const f=await fixture(t), body={op:'read',spaceId:f.owner.spaceId}, headers={Authorization:`Bearer ${f.owner.token}`,Host:new URL(f.hub.url).host,'Content-Length':Buffer.byteLength(JSON.stringify(body))};
  for(let i=0;i<40;i++) headers[`X-Padding-${i}`]='padding';
  headers.Origin='https://untrusted.invalid';
  denied(await rawRequest(f.hub.url,body,headers));
});

test('streamed oversized bodies fail and an interrupted request does not stop subsequent clients', async t => {
  const f=await fixture(t);
  const result=await new Promise((resolve,reject)=>{
    const req=http.request(f.hub.url+'/v1',{method:'POST',headers:{'Content-Type':'application/json','Transfer-Encoding':'chunked',Authorization:`Bearer ${f.owner.token}`}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));
    });
    req.on('error',reject);req.write('{"padding":"');req.write('x'.repeat(810*1024));req.end('"}');
  });
  denied(result,413);
  await new Promise(resolve=>{
    const req=http.request(f.hub.url+'/v1',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':100}});
    req.on('error',()=>{});req.on('close',resolve);
    req.on('socket',socket=>socket.once('connect',()=>{req.write('{');setTimeout(()=>req.destroy(),20);}));
  });
  assert.equal(ok(await f.client(f.owner)({op:'read'})).space.id,f.owner.spaceId);
});

test('response ceiling returns a structured error if stored content exceeds the transport bound', async t => {
  const f=await fixture(t), owner=f.client(f.owner), {pageId}=ok(await owner(note));
  // Simulate out-of-band database corruption; normal validated writes are much smaller.
  const db=new DatabaseSync(path.join(f.dataDir,'spaces.sqlite'));
  try {db.prepare('UPDATE pages SET body=? WHERE id=?').run('x'.repeat(8*1024*1024),pageId);} finally {db.close();}
  denied(await owner({op:'page',pageId}),413);
  const snapshot=ok(await owner({op:'read'}));
  assert.equal(snapshot.pages.length,1);assert.equal(snapshot.pages[0].body,undefined);
});

test('space caps return explicit errors without silently dropping saved entries', async t => {
  const f = await fixture(t), owner = f.client(f.owner);
  const {pageId} = ok(await owner(note));
  for (let i=1;i<100;i++) ok(await owner({...note,title:`Page ${i}`}));
  denied(await owner({...note,title:'Overflow'}),409);
  for (let i=0;i<200;i++) ok(await owner({op:'comment',pageId,text:`Comment ${i}`}));
  denied(await owner({op:'comment',pageId,text:'Overflow'}),409);
  for (let i=0;i<200;i++) ok(await owner({op:'invite',role:'viewer'}));
  denied(await owner({op:'invite',role:'viewer'}),409);
  const snapshot = ok(await owner({op:'read'}));
  assert.equal(snapshot.pages.length,100); assert.equal(snapshot.invites.length,200);
  assert.equal(ok(await owner({op:'page',pageId})).comments.length,200);
});

test('membership cap does not consume an invite and foreign invite/member ids cannot mutate another space', async t => {
  const f = await fixture(t), owner = f.client(f.owner);
  for (let i=0;i<99;i++) await member(f,'viewer',`Viewer ${i}`);
  const pending = ok(await owner({op:'invite',role:'viewer'}));
  denied(await request(f.hub.url,{op:'join',spaceId:f.owner.spaceId,secret:pending.secret,displayName:'Overflow'}),409);
  let snapshot = ok(await owner({op:'read'}));
  assert.equal(snapshot.members.length,100); assert.equal(snapshot.invites.find(i=>i.id===pending.id).used,false);
  const other = await f.hub.createSpace({name:'Other',displayName:'Other'});
  const otherId = ok(await f.client(other)({op:'read'})).self.id;
  denied(await owner({op:'removeMember',memberId:otherId}),404);
  denied(await f.client(other)({op:'revokeInvite',inviteId:pending.id}),404);
  ok(await owner({op:'removeMember',memberId:snapshot.members[1].id}));
  ok(await request(f.hub.url,{op:'join',spaceId:f.owner.spaceId,secret:pending.secret,displayName:'Now fits'}));
});

test('remote creation is disabled by default and optional admin bearer does not grant membership', async t => {
  const f = await fixture(t), body={op:'createSpace',name:'Created remotely',displayName:'Admin'};
  denied(await request(f.hub.url,body),401);
  denied(await request(f.hub.url,body,f.owner.token),401);
  const adminToken='B'.repeat(43), g=await fixture(t,{adminToken});
  denied(await request(g.hub.url,body,'C'.repeat(43)),401);
  const result=ok(await request(g.hub.url,body,adminToken));
  assert.equal(ok(await request(g.hub.url,{op:'read',spaceId:result.spaceId},result.token)).self.name,'Admin');
  denied(await request(g.hub.url,{op:'read',spaceId:result.spaceId},adminToken),401);
  await assert.rejects(hubModule.createSpacesHub({dataDir:f.dataDir,publicUrl:'http://public.example'}),/https/i);
  await assert.rejects(hubModule.createSpacesHub({dataDir:f.dataDir,publicUrl:'https://public.example/path'}),/origin|path/i);
});

test('admin owner setup is one-use, atomic, rotates the provisional owner token, and survives restart', async t => {
  const adminToken='E'.repeat(43), f=await fixture(t,{adminToken});
  const result=ok(await request(f.hub.url,{op:'createSpace',name:'Hosted space',displayName:'Provisioner'},adminToken));
  assert.match(result.ownerSetupSecret,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(f.owner.ownerSetupSecret,undefined);
  assert.ok(Date.parse(result.ownerSetupExpiresAt)>Date.now()+47*60*60*1000);
  await f.hub.close();
  const reopened=await f.start(), claim={op:'claimOwner',spaceId:result.spaceId,secret:result.ownerSetupSecret,displayName:'Native owner'};
  const claims=await Promise.all([request(reopened.url,claim),request(reopened.url,claim)]);
  assert.deepEqual(claims.map(r=>r.status).sort(),[200,401]);
  const owner=ok(claims.find(r=>r.status===200));
  denied(await request(reopened.url,{op:'read',spaceId:result.spaceId},result.token),401);
  const snapshot=ok(await request(reopened.url,{op:'read',spaceId:owner.spaceId},owner.token));
  assert.equal(snapshot.self.name,'Native owner');assert.equal(snapshot.self.role,'owner');assert.equal(snapshot.members.length,1);
  denied(await request(reopened.url,claim),401);
  denied(await request(reopened.url,{...claim,spaceId:f.owner.spaceId}),401);
  for (const name of await readdir(f.dataDir)) assert.equal((await readFile(path.join(f.dataDir,name))).includes(Buffer.from(result.ownerSetupSecret)),false);
});

test('expired owner setup cannot rotate the provisional credential or create extra owners', async t => {
  const adminToken='F'.repeat(43), f=await fixture(t,{adminToken});
  const result=ok(await request(f.hub.url,{op:'createSpace',name:'Hosted space',displayName:'Provisioner'},adminToken));
  const db=new DatabaseSync(path.join(f.dataDir,'spaces.sqlite'));
  try {db.prepare('UPDATE owner_setups SET expires_at=? WHERE space_id=?').run('2000-01-01T00:00:00.000Z',result.spaceId);} finally {db.close();}
  denied(await request(f.hub.url,{op:'claimOwner',spaceId:result.spaceId,secret:result.ownerSetupSecret,displayName:'Late'}),401);
  const snapshot=ok(await request(f.hub.url,{op:'read',spaceId:result.spaceId},result.token));
  assert.equal(snapshot.self.name,'Provisioner');assert.equal(snapshot.members.length,1);
});

test('native form bounds accept 100-character identities and reject overlong names or page titles', async t => {
  const f=await fixture(t);
  const owner=await f.hub.createSpace({name:'N'.repeat(100),displayName:'D'.repeat(100)});
  assert.equal(ok(await request(f.hub.url,{op:'read',spaceId:owner.spaceId},owner.token)).self.name.length,100);
  assert.throws(()=>f.hub.createSpace({name:'N'.repeat(101),displayName:'Owner'}),/100/);
  assert.throws(()=>f.hub.createSpace({name:'Space',displayName:'D'.repeat(101)}),/100/);
  denied(await f.client(f.owner)({...note,title:'T'.repeat(161)}),400);
});

test('standalone runner starts configured storage, exposes the API, and logs no admin credential', {timeout:15000}, async t => {
  const dataDir=await mkdtemp(path.join(tmpdir(),'musebench-spaces-server-')), adminToken='D'.repeat(43);
  const child=spawn(process.execPath,['scripts/spaces-server.mjs'],{cwd:path.resolve('.'),env:{...process.env,SPACES_DATA_DIR:dataDir,SPACES_HOST:'127.0.0.1',SPACES_PORT:'0',SPACES_PUBLIC_URL:'',SPACES_ADMIN_TOKEN:adminToken},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  const exited=new Promise(resolve=>child.once('close',code=>resolve(code)));
  t.after(async()=>{child.kill();await exited;await rm(dataDir,{recursive:true,force:true});});
  const url=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(`Server did not start: ${output}`)),8000);
    child.stdout.on('data',()=>{const match=output.match(/Spaces hub ready: (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    child.once('close',code=>{clearTimeout(timer);reject(Error(`Server exited ${code}: ${output}`));});
  });
  const owner=ok(await request(url,{op:'createSpace',name:'Standalone',displayName:'Operator'},adminToken));
  assert.equal(ok(await request(url,{op:'read',spaceId:owner.spaceId},owner.token)).space.name,'Standalone');
  assert.equal(output.includes(adminToken),false);
  assert.equal(output.includes(owner.token),false);
});
