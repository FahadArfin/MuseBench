// Explicit smoke: node test/native-control-http-ui-smoke.mjs. Its temporary
// profile, blocked external hosts and dev server do not touch the installed app.
import {_electron as electron} from 'playwright';
import {createServer} from 'vite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isolatedDesktopEnvironment} from '../scripts/isolated-desktop-environment.mjs';

const profile=await mkdtemp(path.join(os.tmpdir(),'muse-native-http-ui-')),checks=[],clients=[];
const artifactDir=path.resolve('output/playwright/native-control-http');
let app,devServer;
try{
 await mkdir(artifactDir,{recursive:true});
 devServer=await createServer({configFile:'vite.config.mjs'});await devServer.listen();
 const launch=()=>electron.launch({args:['.','--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1, EXCLUDE localhost'],env:{...isolatedDesktopEnvironment(profile),MUSEBENCH_DEV:'1'}});
 app=await launch();
 const window=async()=>{
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){const page=app.windows().find(item=>item.url().startsWith('http://127.0.0.1:4318/'));if(page)return page;await new Promise(resolve=>setTimeout(resolve,100));}
  throw Error('The isolated desktop window did not open.');
 };
 let page=await window();
 await page.getByRole('button',{name:'Profile menu',exact:true}).click();
 await page.getByRole('menuitem',{name:/^Settings/}).click();
 await page.getByRole('button',{name:'App control',exact:true}).click();
 await page.getByText('Native connection is off',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Turn on',exact:true}).click();
 await page.getByText('Native connection is on',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Shared HTTP (recommended)',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Shared HTTP (recommended)',exact:true}).getAttribute('aria-pressed'),'true');
 const config=await page.evaluate(async()=>(await window.musebench.nativeControl({type:'status',transport:'http'})).httpConnectionConfig);
 assert.ok(config?.url&&config.headers.Authorization);
 const displayed=JSON.parse(await page.locator('.settings-path').innerText());
 assert.deepEqual(displayed,{mcpServers:{musebench:config}});
 checks.push('Desktop App control defaults to the recommended direct HTTP configuration');
 for(let i=0;i<2;i++){
  const client=new Client({name:'desktop-http-fixture-'+i,version:'1.0.0'});clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers:config.headers}}));
  assert.equal((await client.listTools()).tools.length,6);
 }
 const statuses=await Promise.all(clients.map(client=>client.callTool({name:'app_status',arguments:{}})));
 assert.ok(statuses.every(value=>!value.isError));
 checks.push('Two HTTP clients negotiate and inspect the real Electron controller concurrently');
 const navigation=await clients[0].callTool({name:'navigate',arguments:{target:'settings',section:'control'}});
 assert.equal(navigation.isError,undefined);assert.ok(JSON.parse(navigation.content[0].text).headings.includes('App control'));
 await page.getByRole('button',{name:'Stdio compatibility',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.settings-path')?.textContent?.includes('"command"'));
 const legacy=JSON.parse(await page.locator('.settings-path').innerText()).mcpServers.musebench;
 assert.ok(legacy.command&&legacy.args);assert.ok(legacy.command.startsWith(profile));
 await page.getByText(/Each connected client starts its own relay process/).waitFor();
 await page.getByRole('button',{name:'Shared HTTP (recommended)',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.settings-path')?.textContent?.includes('"url"'));
 checks.push('The same panel offers the immutable cached stdio runtime with accurate per-client process guidance');
 // Redact the bearer grant before saving a UI artifact.
 await page.locator('.settings-path').evaluate(element=>{const value=JSON.parse(element.textContent);value.mcpServers.musebench.headers.Authorization='Bearer [private grant hidden]';element.textContent=JSON.stringify(value,null,2);});
 await page.screenshot({path:path.join(artifactDir,'desktop.png')});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(item=>item.webContents.getURL().startsWith('http://127.0.0.1:4318/')).setContentSize(900,700));
 await page.waitForFunction(()=>window.innerWidth<=900);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
 await page.screenshot({path:path.join(artifactDir,'narrow.png')});
 checks.push('The connection choices and configuration remain usable at a 900px desktop width');
 await app.close();app=null;
 app=await launch();page=await window();
 const restored=await page.evaluate(async()=>(await window.musebench.nativeControl({type:'status',transport:'http'})).httpConnectionConfig);
 assert.deepEqual(restored,config);
 const recovered=await clients[0].callTool({name:'app_status',arguments:{}});assert.equal(recovered.isError,undefined);
 checks.push('The unchanged HTTP client and configuration work after closing and reopening the isolated desktop');
 await page.evaluate(()=>window.musebench.nativeControl({type:'disable'}));
 const denied=await fetch(config.url,{method:'POST',headers:{...config.headers,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}).catch(()=>null);
 assert.ok(denied===null||denied.status!==200);
 checks.push('Turning App control off revokes the retained HTTP configuration');
 const report={status:'passed',checks,scope:'Isolated Electron dev UI and real app-control HTTP transport; no provider calls, installed app or user profile changes'};
 await writeFile(path.join(artifactDir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
 for(const client of clients)await client.close();await app?.close();await devServer?.close();await rm(profile,{recursive:true,force:true});
}
