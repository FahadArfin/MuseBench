import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Fictional browser data in a fresh profile only. Never inspect the user's
// browser profile, cookies, account or credentials; external DNS is disabled.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir(path.join(root,'artifacts/session-durability'),{recursive:true});
const output=await mkdtemp(path.join(root,'artifacts/session-durability',`${variant}-`));
const dataDir=path.join(output,'data'),projectsDir=path.join(output,'projects');
await mkdir(dataDir);await mkdir(projectsDir);
const env={...process.env,MUSEBENCH_DATA_DIR:dataDir,MUSEBENCH_PROJECTS_DIR:projectsDir};
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const partitions=['','persist:musebench-personal-muse','persist:musebench-billing'];
const expires=Math.floor(Date.now()/1000)+86400,report={variant,checks:[],modelRequests:0};
let app;
const pass=message=>{report.checks.push(message);console.log(`PASS ${message}`);};
const launch=async()=>{
  app=await electron.launch({cwd:root,args:[...(process.env.MUSEBENCH_EXECUTABLE?[]:['.']),'--host-resolver-rules=MAP * ~NOTFOUND'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env,timeout:30000});
  await app.firstWindow();
  await app.evaluate(({app},expected)=>{if(app.getPath('userData')!==expected)throw Error('Isolated profile required');},dataDir);
};
async function inspect(seed){
  return app.evaluate(async({app,BrowserWindow,session},{partitions,expires,seed,shutdownFile})=>{
    const fixture=globalThis.__sessionDurabilityFixture={flushes:{},pending:0};
    const main=BrowserWindow.getAllWindows().find(window=>!window.getParentWindow());
    const results=[];
    for(const name of partitions){
      const store=name?session.fromPartition(name):session.defaultSession;
      fixture.flushes[name]=0;
      const flush=store.cookies.flushStore.bind(store.cookies);
      store.cookies.flushStore=async()=>{
        fixture.flushes[name]++;fixture.pending++;
        try{await new Promise(resolve=>setTimeout(resolve,80));await flush();}
        finally{fixture.pending--;}
      };
      await store.protocol.handle('https',()=>new Response('<!doctype html><title>Local persistence fixture</title>',{headers:{'content-type':'text/html'}}));
      const view=new BrowserWindow({parent:main,show:false,webPreferences:{session:store,sandbox:true,contextIsolation:true,nodeIntegration:false}});
      await view.loadURL('https://durability.invalid/');
      if(seed){
        await view.webContents.executeJavaScript(`localStorage.setItem('fictional-persistence-marker','saved')`);
        await store.cookies.set({url:'https://durability.invalid/',name:'fictional_persistent',value:'fixture-only',expirationDate:expires,secure:true,httpOnly:true,sameSite:'strict'});
        await store.cookies.set({url:'https://durability.invalid/',name:'fictional_session',value:'fixture-only',secure:true,httpOnly:true,sameSite:'lax'});
      }
      const rows=await store.cookies.get({url:'https://durability.invalid/'});
      results.push({name,persistent:store.isPersistent(),storage:await view.webContents.executeJavaScript(`localStorage.getItem('fictional-persistence-marker')`),cookies:rows.map(({name,expirationDate,secure,httpOnly,sameSite,session})=>({name,expirationDate,secure,httpOnly,sameSite,session}))});
      view.destroy();
    }
    const {writeFileSync}=process.getBuiltinModule('node:fs');
    app.once('will-quit',()=>writeFileSync(shutdownFile,JSON.stringify({flushes:fixture.flushes,pending:fixture.pending})));
    return results;
  },{partitions,expires,seed,shutdownFile:path.join(output,seed?'first-shutdown.json':'second-shutdown.json')});
}
try{
  await launch();
  const initial=await inspect(true);
  for(const row of initial){assert(row.persistent);assert.equal(row.cookies.find(cookie=>cookie.name==='fictional_session').session,true);}
  const deadline=Date.now()+7000;
  let early;
  while(Date.now()<deadline){early=await app.evaluate(()=>globalThis.__sessionDurabilityFixture);if(partitions.every(name=>early.flushes[name]>=1)&&early.pending===0)break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert(partitions.every(name=>early.flushes[name]>=1));assert.equal(early.pending,0);
  pass('Cookie changes trigger early native writes in default, Muse/Meta and billing sessions');
  await app.close();app=null;
  const first=JSON.parse(await readFile(path.join(output,'first-shutdown.json'),'utf8'));
  assert.equal(first.pending,0);for(const name of partitions)assert(first.flushes[name]>early.flushes[name]);
  pass('Real application quit awaits a final cookie write after early writes complete');
  await launch();
  const restored=await inspect(false);
  for(const row of restored){
    assert.equal(row.storage,'saved');
    assert.deepEqual(row.cookies,[{name:'fictional_persistent',expirationDate:expires,secure:true,httpOnly:true,sameSite:'strict',session:false}]);
  }
  pass('A full process restart retains fictional persistent cookies and localStorage in all three sessions');
  pass('Provider-style expiry, Secure, HttpOnly and SameSite flags stay unchanged; session-only cookies expire normally');
  await app.close();app=null;
  const second=JSON.parse(await readFile(path.join(output,'second-shutdown.json'),'utf8'));
  assert.equal(second.pending,0);for(const name of partitions)assert(second.flushes[name]>=1);
  report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);console.error(error);process.exitCode=1;}
finally{await app?.close().catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(output);}
