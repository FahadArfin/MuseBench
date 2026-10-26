import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {desktopSnapshotsPlugin} from '../scripts/preview-snapshot-server.mjs';

test('desktop and preview use one native UI entry and stylesheet owner',async()=>{
 const [desktop,preview,bootstrap,previewCss]=await Promise.all(['src/ui/main.tsx','src/preview/main.tsx','src/ui/bootstrap.tsx','src/preview/preview.css'].map(file=>readFile(file,'utf8')));
 assert.match(desktop,/mountApp/);assert.match(preview,/mountApp/);
 assert.doesNotMatch(desktop+preview,/createRoot|import .*\bApp\b.* from/);
 for(const css of ['styles.css','brand.css','sidebar.css','window-chrome.css'])assert(bootstrap.includes(css));
 assert.doesNotMatch(previewCss,/(?:^|[},])\s*\.(?:sidebar|topbar|app|workspace|navigation-row|scheduled-sidebar)\b/m,'Native UI must not be restyled only in preview');
});

test('snapshot middleware serves only fixed private capture filenames',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'musebench-snapshot-test-'));
 try{
  await mkdir(path.join(root,'artifacts/preview-snapshots'),{recursive:true});
  await writeFile(path.join(root,'artifacts/preview-snapshots/manifest.json'),'{}');
  await writeFile(path.join(root,'artifacts/preview-snapshots/scheduled.png'),'capture');
  let handler;desktopSnapshotsPlugin().configureServer({config:{root},middlewares:{use:(route,fn)=>{assert.equal(route,'/__musebench_snapshots');handler=fn;}}});
  async function request(url,method='GET'){
   const result={statusCode:200,headers:{}};
   await handler({url,method},{set statusCode(value){result.statusCode=value;},setHeader:(key,value)=>{result.headers[key]=value;},end:bytes=>{result.body=bytes?.toString();}});
   return result;
  }
  const valid=await request('/scheduled.png?v=now');assert.equal(valid.body,'capture');assert.equal(valid.headers['Cache-Control'],'no-store');assert.equal(valid.headers['Content-Type'],'image/png');
  for(const url of ['/../manifest.json','/%2e%2e/manifest.json','/profile.json','/bot.png','/nested/scheduled.png'])assert.equal((await request(url)).statusCode,404);
  assert.equal((await request('/manifest.json','POST')).statusCode,404);
 }finally{await rm(root,{recursive:true,force:true});}
});
