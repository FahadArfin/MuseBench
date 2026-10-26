import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {validateArtifact} from '../shared/work-artifacts.mjs';

const REQUEST_BYTES = 800 * 1024, RESPONSE_BYTES = 8 * 1024 * 1024;
const INVITE_MS = 48 * 60 * 60 * 1000, REQUEST_MS = 10_000;
const LIMITS = Object.freeze({pages:100,members:100,invites:200,commentsPerPage:200,history:30,noteCharacters:100000,artifactBytes:512*1024});
const digest = value => createHash('sha256').update(value).digest('hex');
const credential = () => randomBytes(32).toString('base64url');
const now = () => new Date().toISOString();
const loopback = host => ['127.0.0.1','localhost','::1','[::1]'].includes(host.toLowerCase());
const authority = (host,port) => `${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}:${port}`;

class HubError extends Error {
  constructor(status,code,message) {super(message); this.status=status; this.code=code;}
}
function fail(status,code,message) {throw new HubError(status,code,message);}
function text(value,label,max,{optional=false,empty=false}={}) {
  if (value === undefined && optional) return '';
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400,'INVALID_INPUT',`${label} must be ${empty ? '' : 'non-empty '}text of at most ${max} characters.`);
  return value;
}
function identifier(value,label) {
  text(value,label,100);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail(400,'INVALID_INPUT',`${label} is invalid.`);
  return value;
}
function integer(value,label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(400,'INVALID_INPUT',`${label} must be a positive integer.`);
  return value;
}
function roleAllowed(member,roles) {if (!roles.includes(member.role)) fail(403,'FORBIDDEN','Your role does not permit this action.');}
function limit(count,max,label) {if (count >= max) fail(409,'LIMIT_REACHED',`This space has reached its limit of ${max} ${label}.`);}
function bearer(header) {return typeof header === 'string' && /^Bearer [A-Za-z0-9_-]{43,256}$/.test(header) ? header.slice(7) : null;}
function publicOrigin(value) {
  if (value === undefined) return null;
  let parsed;
  try {parsed = new URL(value);} catch {throw Error('The public URL must be a valid HTTPS origin.');}
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw Error('The public URL must be an origin without a path, credentials, query, or fragment.');
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback(parsed.hostname))) throw Error('Non-loopback public URLs require HTTPS.');
  return parsed;
}
function readJson(req) {
  return new Promise((resolve,reject) => {
    let bytes=0, chunks=[], finished=false;
    const finish = (failure,value) => {
      if (finished) return;
      finished=true; clearTimeout(timer);
      req.removeListener('data',data); req.removeListener('end',end); req.removeListener('error',error); req.removeListener('aborted',aborted);
      if (failure) {req.resume(); reject(failure);} else resolve(value);
    };
    const data = chunk => {
      bytes += chunk.length;
      if (bytes > REQUEST_BYTES) {chunks=[];finish(new HubError(413,'BODY_TOO_LARGE','Request exceeds 800 KiB.'));} else chunks.push(chunk);
    };
    const end = () => {
      let value;
      try {value=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {return finish(new HubError(400,'INVALID_JSON','Request must contain valid JSON.'));}
      if (!value || typeof value !== 'object' || Array.isArray(value)) return finish(new HubError(400,'INVALID_INPUT','Request must be a JSON object.'));
      finish(null,value);
    };
    const error = () => finish(new HubError(400,'INCOMPLETE_BODY','Request body was interrupted.'));
    const aborted = error;
    const timer = setTimeout(() => finish(new HubError(408,'REQUEST_TIMEOUT','Request timed out.')),REQUEST_MS);
    timer.unref();
    req.on('data',data); req.once('end',end); req.once('error',error); req.once('aborted',aborted);
  });
}
function respond(res,status,value) {
  let body=JSON.stringify(value);
  if (Buffer.byteLength(body) > RESPONSE_BYTES) {status=413;body=JSON.stringify({error:'Response exceeds 8 MiB.',code:'RESPONSE_TOO_LARGE'});}
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Connection':'close'});
  res.end(body);
}

/** A standalone, persistent hub. Only the trusted host process can call createSpace directly. */
export async function createSpacesHub({dataDir,host='127.0.0.1',port=0,publicUrl,adminToken}={}) {
  if (typeof dataDir !== 'string' || !dataDir) throw Error('A Spaces dataDir is required.');
  if (typeof host !== 'string' || !host || /[\s\/@?#]/.test(host)) throw Error('A valid bind host is required.');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Port must be an integer between 0 and 65535.');
  const external = publicOrigin(publicUrl);
  if (!loopback(host) && external?.protocol !== 'https:') throw Error('A non-loopback bind requires a public HTTPS origin and a TLS reverse proxy.');
  if (adminToken !== undefined && (typeof adminToken !== 'string' || !/^[A-Za-z0-9_-]{43,256}$/.test(adminToken))) throw Error('Admin token must be a random base64url secret of at least 43 characters.');
  const adminHash = adminToken ? digest(adminToken) : null;
  adminToken=undefined;
  await mkdir(dataDir,{recursive:true,mode:0o700});
  const db = new DatabaseSync(path.join(dataDir,'spaces.sqlite'));
  let closed=false, closing=null;
  try {
    db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS spaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','editor','commenter','viewer')),token_hash TEXT NOT NULL UNIQUE,joined_at TEXT NOT NULL,revoked_at TEXT);
      CREATE INDEX IF NOT EXISTS members_space ON members(space_id);
      CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),role TEXT NOT NULL CHECK(role IN ('editor','commenter','viewer')),secret_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,used_at TEXT,revoked_at TEXT);
      CREATE INDEX IF NOT EXISTS invites_space ON invites(space_id);
      CREATE TABLE IF NOT EXISTS owner_setups(space_id TEXT PRIMARY KEY REFERENCES spaces(id),member_id TEXT NOT NULL UNIQUE REFERENCES members(id),secret_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,used_at TEXT);
      CREATE TABLE IF NOT EXISTS pages(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),title TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('note','artifact')),body TEXT,artifact TEXT,revision INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES members(id));
      CREATE INDEX IF NOT EXISTS pages_space ON pages(space_id);
      CREATE TABLE IF NOT EXISTS revisions(page_id TEXT NOT NULL REFERENCES pages(id),revision INTEGER NOT NULL,title TEXT NOT NULL,type TEXT NOT NULL,body TEXT,artifact TEXT,by TEXT NOT NULL REFERENCES members(id),at TEXT NOT NULL,PRIMARY KEY(page_id,revision));
      CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,page_id TEXT NOT NULL REFERENCES pages(id),text TEXT NOT NULL,by TEXT NOT NULL REFERENCES members(id),created_at TEXT NOT NULL,resolved INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS comments_page ON comments(page_id);
    `);
  } catch (error) {db.close(); throw error;}
  const get = (sql,...args) => db.prepare(sql).get(...args);
  const all = (sql,...args) => db.prepare(sql).all(...args);
  const run = (sql,...args) => db.prepare(sql).run(...args);
  const transaction = fn => {
    if (closed) fail(503,'CLOSED','Spaces hub is closed.');
    db.exec('BEGIN IMMEDIATE');
    try {const value=fn();db.exec('COMMIT');return value;} catch(error) {db.exec('ROLLBACK');throw error;}
  };
  const memberView = row => ({id:row.id,name:row.name,role:row.role,joinedAt:row.joined_at});
  const pageView = (row,full=false) => ({id:row.id,title:row.title,type:row.type,revision:row.revision,updatedAt:row.updated_at,updatedBy:row.author_name,...(full ? row.type === 'artifact' ? {artifact:JSON.parse(row.artifact)} : {body:row.body} : {})});
  const requirePage = (spaceId,pageId) => {
    identifier(pageId,'Page ID');
    const page=get('SELECT p.*,m.name AS author_name FROM pages p JOIN members m ON m.id=p.updated_by WHERE p.space_id=? AND p.id=?',spaceId,pageId);
    if (!page) fail(404,'NOT_FOUND','Page not found in this space.');
    return page;
  };
  const requireRevision = (page,expected) => {
    if (!Number.isSafeInteger(expected) || expected !== page.revision) fail(409,'CONFLICT','This page changed. Reload before saving, or keep your draft as a new page.');
  };
  const saveRevision = pageId => {
    run('INSERT INTO revisions(page_id,revision,title,type,body,artifact,by,at) SELECT id,revision,title,type,body,artifact,updated_by,updated_at FROM pages WHERE id=?',pageId);
    run('DELETE FROM revisions WHERE page_id=? AND revision NOT IN (SELECT revision FROM revisions WHERE page_id=? ORDER BY revision DESC LIMIT ?)',pageId,pageId,LIMITS.history);
  };
  const provisionSpace = input => {
    const name=text(input?.name,'Space name',100), description=text(input?.description,'Description',2000,{optional:true,empty:true}), displayName=text(input?.displayName,'Display name',100);
    const spaceId=randomUUID(), memberId=randomUUID(), token=credential(), at=now();
    run('INSERT INTO spaces(id,name,description,created_at) VALUES(?,?,?,?)',spaceId,name,description,at);
    run('INSERT INTO members(id,space_id,name,role,token_hash,joined_at) VALUES(?,?,?,?,?,?)',memberId,spaceId,displayName,'owner',digest(token),at);
    return {spaceId,token};
  };
  const createSpace = input => transaction(() => provisionSpace(input));
  const dispatch = (input,authorization) => {
    const token=bearer(authorization);
    if (input.op === 'createSpace') {
      if (!adminHash || !token || !timingSafeEqual(Buffer.from(digest(token),'hex'),Buffer.from(adminHash,'hex'))) fail(401,'UNAUTHORIZED','Administrative creation is unavailable or the credential is invalid.');
      return transaction(() => {
        const result=provisionSpace(input), owner=get('SELECT id FROM members WHERE space_id=? AND role=?',result.spaceId,'owner');
        const ownerSetupSecret=credential(), ownerSetupExpiresAt=new Date(Date.now()+INVITE_MS).toISOString();
        run('INSERT INTO owner_setups(space_id,member_id,secret_hash,expires_at) VALUES(?,?,?,?)',result.spaceId,owner.id,digest(ownerSetupSecret),ownerSetupExpiresAt);
        return {...result,ownerSetupSecret,ownerSetupExpiresAt};
      });
    }
    const spaceId=identifier(input.spaceId,'Space ID');
    return transaction(() => {
      if (input.op === 'claimOwner') {
        const displayName=text(input.displayName,'Display name',100), at=now();
        if (typeof input.secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.secret)) fail(401,'INVALID_SETUP','Owner setup is invalid, expired, or already used.');
        const setup=get("SELECT s.member_id FROM owner_setups s JOIN members m ON m.id=s.member_id WHERE s.space_id=? AND s.secret_hash=? AND s.used_at IS NULL AND s.expires_at>? AND m.role='owner' AND m.revoked_at IS NULL",spaceId,digest(input.secret),at);
        if (!setup) fail(401,'INVALID_SETUP','Owner setup is invalid, expired, or already used.');
        const token=credential();
        run('UPDATE members SET name=?,token_hash=? WHERE id=?',displayName,digest(token),setup.member_id);
        run('UPDATE owner_setups SET used_at=? WHERE space_id=?',at,spaceId);
        return {spaceId,token};
      }
      if (input.op === 'join') {
        const displayName=text(input.displayName,'Display name',100);
        if (typeof input.secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.secret)) fail(401,'INVALID_INVITE','Invitation is invalid, expired, revoked, or already used.');
        const at=now(), invite=get('SELECT * FROM invites WHERE space_id=? AND secret_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?',spaceId,digest(input.secret),at);
        if (!invite) fail(401,'INVALID_INVITE','Invitation is invalid, expired, revoked, or already used.');
        limit(get('SELECT COUNT(*) AS count FROM members WHERE space_id=? AND revoked_at IS NULL',spaceId).count,LIMITS.members,'active members');
        const memberId=randomUUID(), token=credential();
        run('INSERT INTO members(id,space_id,name,role,token_hash,joined_at) VALUES(?,?,?,?,?,?)',memberId,spaceId,displayName,invite.role,digest(token),at);
        run('UPDATE invites SET used_at=? WHERE id=?',at,invite.id);
        return {spaceId,token};
      }
      const self=token && get('SELECT * FROM members WHERE space_id=? AND token_hash=? AND revoked_at IS NULL',spaceId,digest(token));
      if (!self) fail(401,'UNAUTHORIZED','Membership is invalid or has been removed.');
      switch (input.op) {
        case 'read': {
          const space=get('SELECT * FROM spaces WHERE id=?',spaceId);
          return {
            space:{id:space.id,name:space.name,description:space.description,createdAt:space.created_at},self:memberView(self),
            members:all('SELECT * FROM members WHERE space_id=? AND revoked_at IS NULL ORDER BY rowid',spaceId).map(memberView),
            pages:all('SELECT p.id,p.title,p.type,p.revision,p.updated_at,m.name AS author_name FROM pages p JOIN members m ON m.id=p.updated_by WHERE p.space_id=? ORDER BY p.updated_at DESC,p.rowid DESC',spaceId).map(row=>pageView(row)),
            invites:self.role === 'owner' ? all('SELECT id,role,expires_at,used_at,revoked_at FROM invites WHERE space_id=? ORDER BY rowid DESC',spaceId).map(row=>({id:row.id,role:row.role,expiresAt:row.expires_at,used:Boolean(row.used_at),revoked:Boolean(row.revoked_at)})) : [],
            limits:LIMITS,
          };
        }
        case 'page': {
          const page=requirePage(spaceId,input.pageId);
          return {page:pageView(page,true),
            comments:all('SELECT c.*,m.name AS author_name FROM comments c JOIN members m ON m.id=c.by WHERE c.page_id=? ORDER BY c.rowid',page.id).map(row=>({id:row.id,text:row.text,by:row.author_name,createdAt:row.created_at,resolved:Boolean(row.resolved),canResolve:row.by === self.id || ['owner','editor'].includes(self.role)})),
            history:all('SELECT r.revision,r.title,r.at,m.name AS author_name FROM revisions r JOIN members m ON m.id=r.by WHERE r.page_id=? ORDER BY r.revision DESC',page.id).map(row=>({revision:row.revision,title:row.title,by:row.author_name,at:row.at})),historyLimit:LIMITS.history};
        }
        case 'savePage': {
          roleAllowed(self,['owner','editor']);
          const title=text(input.title,'Page title',160);
          if (!['note','artifact'].includes(input.type)) fail(400,'INVALID_INPUT','Page type must be note or artifact.');
          let body=null, artifact=null;
          if (input.type === 'note') body=text(input.body,'Page body',LIMITS.noteCharacters,{optional:true,empty:true});
          else {
            try {artifact=JSON.stringify(validateArtifact(input.artifact));} catch(error) {fail(400,'INVALID_ARTIFACT',error.message);}
          }
          const at=now();
          let pageId;
          if (input.pageId !== undefined) {
            const page=requirePage(spaceId,input.pageId); requireRevision(page,input.expectedRevision); pageId=page.id;
            run('UPDATE pages SET title=?,type=?,body=?,artifact=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=?',title,input.type,body,artifact,at,self.id,pageId);
          } else {
            if (input.expectedRevision !== undefined) fail(400,'INVALID_INPUT','A new page cannot specify an expected revision.');
            limit(get('SELECT COUNT(*) AS count FROM pages WHERE space_id=?',spaceId).count,LIMITS.pages,'pages');
            pageId=randomUUID();
            run('INSERT INTO pages(id,space_id,title,type,body,artifact,revision,updated_at,updated_by) VALUES(?,?,?,?,?,?,1,?,?)',pageId,spaceId,title,input.type,body,artifact,at,self.id);
          }
          saveRevision(pageId); return {pageId};
        }
        case 'restorePage': {
          roleAllowed(self,['owner','editor']);
          const page=requirePage(spaceId,input.pageId); requireRevision(page,input.expectedRevision);
          const revision=integer(input.revision,'Revision'), prior=get('SELECT * FROM revisions WHERE page_id=? AND revision=?',page.id,revision);
          if (!prior) fail(404,'NOT_FOUND','This revision is no longer available. Only the latest 30 revisions are retained.');
          run('UPDATE pages SET title=?,type=?,body=?,artifact=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=?',prior.title,prior.type,prior.body,prior.artifact,now(),self.id,page.id);
          saveRevision(page.id); return {pageId:page.id};
        }
        case 'comment': {
          roleAllowed(self,['owner','editor','commenter']);
          const page=requirePage(spaceId,input.pageId), value=text(input.text,'Comment',4000);
          limit(get('SELECT COUNT(*) AS count FROM comments WHERE page_id=?',page.id).count,LIMITS.commentsPerPage,'comments on this page');
          const commentId=randomUUID();
          run('INSERT INTO comments(id,page_id,text,by,created_at) VALUES(?,?,?,?,?)',commentId,page.id,value,self.id,now());
          return {commentId};
        }
        case 'resolveComment': {
          const page=requirePage(spaceId,input.pageId), commentId=identifier(input.commentId,'Comment ID');
          if (typeof input.resolved !== 'boolean') fail(400,'INVALID_INPUT','Resolved must be true or false.');
          const comment=get('SELECT * FROM comments WHERE page_id=? AND id=?',page.id,commentId);
          if (!comment) fail(404,'NOT_FOUND','Comment not found on this page.');
          if (comment.by !== self.id) roleAllowed(self,['owner','editor']);
          run('UPDATE comments SET resolved=? WHERE id=?',input.resolved ? 1 : 0,commentId);
          return {ok:true};
        }
        case 'invite': {
          roleAllowed(self,['owner']);
          if (!['viewer','commenter','editor'].includes(input.role)) fail(400,'INVALID_INPUT','Invitation role must be viewer, commenter, or editor.');
          limit(get('SELECT COUNT(*) AS count FROM invites WHERE space_id=?',spaceId).count,LIMITS.invites,'invitations');
          const id=randomUUID(), secret=credential(), expiresAt=new Date(Date.now()+INVITE_MS).toISOString();
          run('INSERT INTO invites(id,space_id,role,secret_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',id,spaceId,input.role,digest(secret),expiresAt,now());
          return {id,secret,expiresAt};
        }
        case 'revokeInvite': {
          roleAllowed(self,['owner']); identifier(input.inviteId,'Invitation ID');
          if (!get('SELECT id FROM invites WHERE space_id=? AND id=?',spaceId,input.inviteId)) fail(404,'NOT_FOUND','Invitation not found in this space.');
          run('UPDATE invites SET revoked_at=COALESCE(revoked_at,?) WHERE id=?',now(),input.inviteId);
          return {ok:true};
        }
        case 'removeMember': {
          roleAllowed(self,['owner']); identifier(input.memberId,'Member ID');
          if (self.id === input.memberId) fail(400,'OWNER_REQUIRED','The owner cannot remove their own membership.');
          if (!get('SELECT id FROM members WHERE space_id=? AND id=?',spaceId,input.memberId)) fail(404,'NOT_FOUND','Member not found in this space.');
          run('UPDATE members SET revoked_at=COALESCE(revoked_at,?) WHERE id=?',now(),input.memberId);
          return {ok:true};
        }
        default: fail(400,'UNKNOWN_OPERATION','Unknown Spaces operation.');
      }
    });
  };
  const allowedHosts=new Set(external ? [external.host.toLowerCase()] : []);
  const handle = async (req,res) => {
    try {
      if (Object.hasOwn(req.headers,'origin')) fail(403,'ORIGIN_FORBIDDEN','Browser-origin requests are not accepted.');
      if (!allowedHosts.has(req.headers.host?.toLowerCase())) fail(403,'HOST_FORBIDDEN','Host is not allowed.');
      if (req.url !== '/v1') fail(404,'NOT_FOUND','Endpoint not found.');
      if (req.method !== 'POST') fail(405,'METHOD_NOT_ALLOWED','Use POST for this endpoint.');
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) fail(415,'UNSUPPORTED_MEDIA_TYPE','Content-Type must be application/json.');
      if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') fail(415,'UNSUPPORTED_ENCODING','Compressed requests are not accepted.');
      if (Number(req.headers['content-length'] ?? 0) > REQUEST_BYTES) fail(413,'BODY_TOO_LARGE','Request exceeds 800 KiB.');
      const input=await readJson(req);
      if (req.aborted || res.destroyed) return;
      respond(res,200,dispatch(input,req.headers.authorization));
    } catch (error) {
      if (!res.destroyed && !res.headersSent) respond(res,error instanceof HubError ? error.status : 500,error instanceof HubError ? {error:error.message,code:error.code} : {error:'Spaces request could not be completed.',code:'INTERNAL_ERROR'});
      req.resume();
    }
  };
  const server=http.createServer({requestTimeout:REQUEST_MS,headersTimeout:REQUEST_MS,maxHeaderSize:16384},handle);
  // A header-count limit silently drops later headers, including Origin. Parse all
  // headers within the hard 16 KiB parser limit so security checks see every field.
  server.maxHeadersCount=0; server.maxConnections=128; server.keepAliveTimeout=1000; server.maxRequestsPerSocket=100;
  server.setTimeout(REQUEST_MS,socket=>socket.destroy());
  server.on('checkContinue',(req,res)=>respond(res,417,{error:'Expect requests are not accepted.',code:'EXPECTATION_FAILED'}));
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});
  } catch(error) {db.close();throw error;}
  const listenHost=host === 'localhost' ? 'localhost' : host;
  const listenUrl=`http://${authority(listenHost,server.address().port)}`;
  allowedHosts.add(new URL(listenUrl).host.toLowerCase());
  // An explicit localhost bind may resolve to either family; both are loopback only.
  if (loopback(host)) for (const name of ['localhost','127.0.0.1','::1']) allowedHosts.add(authority(name,server.address().port));
  const url=external ? external.origin : listenUrl;
  const close = () => {
    if (closing) return closing;
    closed=true;
    closing=new Promise((resolve,reject)=>{
      server.close(error=>{try {db.close();} catch(dbError) {reject(dbError);return;} if (error) reject(error);else resolve();});
      server.closeAllConnections();
    });
    return closing;
  };
  return {url,createSpace,close};
}
