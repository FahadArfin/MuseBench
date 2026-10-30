import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {packagePaths} from './package-paths.mjs';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
await mkdir('artifacts/portable-desktop',{recursive:true});
const data=await mkdtemp(path.resolve('artifacts/portable-desktop','profile-'));
const env=isolatedDesktopEnvironment(data);
const errors=[],report={platform:process.platform,arch:process.arch,checks:[],errors};let app,nativeClient;
try{
 app=await electron.launch({executablePath:packagePaths().executable,args:['--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost',...(process.env.CI&&process.platform==='linux'?['--no-sandbox']:[])],env,timeout:60000});
 // Electron also creates personal-chat WebContentsViews during boot. Select the
 // packaged shell rather than whichever web contents wins the first-window race.
 let page;const deadline=Date.now()+60000;
 while(!page&&Date.now()<deadline){page=app.windows().find(candidate=>/\/dist\/index\.html(?:[?#]|$)/.test(candidate.url().replaceAll('\\','/')));if(!page)await new Promise(resolve=>setTimeout(resolve,100));}
 if(!page)throw Error('Packaged shell did not open: '+app.windows().map(candidate=>candidate.url()).join(', '));
 page.on('pageerror',error=>errors.push(error.message));
 await page.waitForFunction(()=>!!window.musebench,{},{timeout:30000});
 const state=await page.evaluate(()=>window.musebench.getState());assert.ok(Array.isArray(state.projects));
 assert.equal(state.runtime.liveVerified,false);report.checks.push('Fresh profile starts with the real preload/controller; no model verification is invented');
 const info=await app.evaluate(({app})=>({version:app.getVersion(),arch:process.arch,platform:process.platform}));
 const expected=JSON.parse(await readFile('package.json','utf8'));assert.equal(info.version,expected.version);assert.equal(info.arch,process.arch);assert.equal(info.platform,process.platform);report.checks.push('Packaged version and native CPU architecture match the build');
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();
 await page.getByRole('heading',{name:'What would you like to build?'}).waitFor();report.checks.push('Fresh Code workspace opens');
 await page.screenshot({path:'artifacts/portable-desktop/code.png'});
 // Stub only the OS picker. The packaged preload, IPC controller, worker, ZIP
 // dependency and durable history remain real and confined to this test profile.
 const exportFile=path.join(data,'conversations.json'),exportText=JSON.stringify([{name:'Packaged import probe',chat_messages:[{sender:'human',text:'packaged source text'}]}]);await writeFile(exportFile,exportText);
 await app.evaluate(({dialog},file)=>{const original=dialog.showOpenDialog;globalThis.restoreImportPicker=()=>{dialog.showOpenDialog=original;};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},exportFile);
 try{
  const preview=await page.evaluate(()=>window.musebench.previewConversationImport());assert.equal(preview.conversations[0].title,'Packaged import probe');assert.equal(preview.simulation,undefined);
  const saved=await page.evaluate(preview=>window.musebench.confirmConversationImport({token:preview.token,ids:[preview.conversations[0].id]}),preview);assert.equal(saved.imported,1);
  const history=await page.evaluate(id=>window.musebench.readChatHistory({taskId:id}),saved.ids[0]);assert.equal(history.coverage,'imported');assert.equal(history.messages[0].text,'packaged source text');assert.equal(await readFile(exportFile,'utf8'),exportText);
  await page.evaluate(async({id,token})=>{await window.musebench.removeImportedConversation(id);await window.musebench.discardConversationImport(token);},{id:saved.ids[0],token:preview.token});
  report.checks.push('Packaged ASAR import worker and real preload/controller persist selected source text; picker is a clean fixture');
 }finally{await app.evaluate(()=>globalThis.restoreImportPicker());}
 const control=await page.evaluate(()=>window.musebench.nativeControl({type:'enable'}));assert.equal(control.running,true);
 nativeClient=new Client({name:'packaged-native-check',version:'1.0.0'});await nativeClient.connect(new StdioClientTransport({...control.connectionConfig,stderr:'pipe'}));
 const result=await nativeClient.callTool({name:'app_status',arguments:{}});assert.ok(!result.isError,result.content?.[0]?.text);const native=JSON.parse(result.content[0].text);assert.equal(native.version,expected.version);assert.equal(native.packaged,true);
 const navigation=await nativeClient.callTool({name:'navigate',arguments:{target:'settings',section:'control'}});assert.ok(!navigation.isError,navigation.content?.[0]?.text);const ui=JSON.parse(navigation.content[0].text);assert.ok(ui.headings.includes('App control'),`Native navigation returned headings: ${JSON.stringify(ui.headings)}`);report.checks.push('Packaged executable and ASAR run MCP stdio; native tools inspect and navigate the actual packaged app');
 await nativeClient.close();nativeClient=null;await page.evaluate(()=>window.musebench.nativeControl({type:'disable'}));
 assert.deepEqual(errors,[]);report.status='passed';
 console.log(JSON.stringify(report));
}catch(error){report.status='failed';report.failure=error.message;throw error;}
finally{await writeFile('artifacts/portable-desktop/report.json',JSON.stringify(report,null,2));await nativeClient?.close();await app?.close();}
