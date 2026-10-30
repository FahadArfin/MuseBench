import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,_electron as electron} from 'playwright';
import {createServer} from 'vite';
import {CURATED_EXTENSIONS} from '../src/shared/extension-catalog.mjs';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';

const desktop=process.argv.includes('--desktop'),variant=desktop?(process.env.MUSEBENCH_EXECUTABLE?'installed':'desktop'):'preview';
await mkdir('artifacts/integration-panels',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/integration-panels',variant+'-'));
const report={variant,checks:[],errors:[],providerRequests:0};let app,browser,server,page,settingsFile,original;
const pass=message=>{report.checks.push(message);console.log('PASS '+message);};
const seed=CURATED_EXTENSIONS.filter(item=>item.recipe?.transport==='http').slice(0,2),names=desktop?['panel-docs','panel-other']:seed.map(item=>item.recipe.name);
const until=async check=>{const end=Date.now()+12000;while(Date.now()<end){const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,60));}throw Error('Panel smoke deadline');};
try{
 if(desktop){
  const profile=path.join(output,'profile'),env=isolatedDesktopEnvironment(profile);settingsFile=path.join(profile,'.config','muse','settings.json');await mkdir(path.dirname(settingsFile),{recursive:true});
  const entry={type:'streamable-http',url:'https://fixture.invalid/mcp',headers:{Authorization:'FIXTURE_PRIVATE_HEADER'},required:false};original={schema_version:1,theme:'keep',mcpServers:{[names[0]]:entry,[names[1]]:{...entry,url:'https://other.invalid/mcp'}}};await writeFile(settingsFile,JSON.stringify(original));
  const review=createExtensionReview({dataDir:profile,profile,environment:env});for(const name of names)await review.approveMcp(name,original.mcpServers[name]);
  const executablePath=process.env.MUSEBENCH_EXECUTABLE;app=await electron.launch({...(executablePath?{executablePath}:{}),args:[...(executablePath?[]:['.']),'--host-resolver-rules=MAP * ~NOTFOUND'],env});
  page=await until(()=>app.windows().find(p=>p.url().includes('/dist/index.html')));await page.waitForFunction(()=>!!window.musebench);
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
 }else{
  server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-integration-panel',server:{host:'127.0.0.1',port:0}});await server.listen();browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1200,height:960}});await page.goto(server.resolvedUrls.local[0]+'preview.html');await page.waitForFunction(()=>!!window.musebench);
  for(const item of seed)await page.evaluate(id=>window.musebench.customize({type:'catalogServer',id,reviewed:true}),item.id);
  await page.evaluate(()=>{const original=window.musebench.customize;window.musebench.customize=async command=>{const result=await original(command);if(command.type==='inspectIntegrationPanel'&&window.__holdPanel)await new Promise(resolve=>window.__releasePanel=resolve);return result;};});
 }
 page.setDefaultTimeout(8000);page.on('pageerror',error=>report.errors.push(error.message));
 await page.getByRole('group',{name:'Choose workspace'}).getByRole('button',{name:'Muse Code',exact:true}).click();await page.getByRole('button',{name:'Customize',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Customize'});await dialog.getByRole('tab',{name:'MCP servers',exact:true}).click();await dialog.getByRole('button',{name:'Installed',exact:true}).click();await dialog.getByRole('button',{name:`Manage ${names[0]}`,exact:true}).click();
 const panel=dialog.locator('.integration-panel');await panel.getByText('Run settings',{exact:true}).waitFor();assert.equal(await panel.getAttribute('open'),null);await panel.getByText('Run settings',{exact:true}).click();
 const connection=panel.getByRole('spinbutton',{name:'Connection timeout',exact:true}),tool=panel.getByRole('spinbutton',{name:'Tool timeout',exact:true});await connection.waitFor();assert.equal(await connection.inputValue(),'30');assert.equal(await tool.inputValue(),'300');assert(!await dialog.innerText().then(text=>text.includes('FIXTURE_PRIVATE_HEADER')));
 if(!desktop)await panel.getByText(/Preview only/).waitFor();
 await connection.fill('12.5');await panel.getByRole('checkbox',{name:'Required for replies',exact:true}).check();await panel.getByRole('button',{name:'Review changes',exact:true}).focus();await page.keyboard.press('Enter');
 const apply=panel.getByRole('button',{name:'Apply changes',exact:true});assert.equal(await apply.isDisabled(),true);await panel.getByText('30 s → 12.5 s',{exact:true}).waitFor();
 if(desktop)assert.deepEqual(JSON.parse(await readFile(settingsFile,'utf8')),original);
 await panel.getByRole('button',{name:'Edit settings',exact:true}).click();assert.equal(await connection.inputValue(),'12.5');await panel.getByRole('button',{name:'Discard changes',exact:true}).click();assert.equal(await connection.inputValue(),'30');pass('Compact panel keeps drafts local; keyboard review requires confirmation and cancel restores saved values');
 await connection.fill('15');await tool.fill('45');await panel.getByRole('button',{name:'Review changes',exact:true}).click();await panel.getByRole('checkbox',{name:'I reviewed these changes.',exact:true}).check();await apply.click();await dialog.getByRole('status').filter({hasText:/Reconnect Muse/}).waitFor();
 if(desktop){const saved=JSON.parse(await readFile(settingsFile,'utf8'));assert.deepEqual(saved,{...original,mcpServers:{...original.mcpServers,[names[0]]:{...original.mcpServers[names[0]],startup_timeout_sec:15,tool_timeout_sec:45}}});assert.deepEqual(JSON.parse(await readFile(settingsFile+'.musebench-backup','utf8')),original);}
 await panel.getByText('Run settings',{exact:true}).click();await connection.waitFor();assert.equal(await connection.inputValue(),'15');assert.equal(await tool.inputValue(),'45');pass(desktop?'Real desktop IPC saves only reviewed timeout fields and preserves private configuration and a backup':'Shared browser preview applies a visibly simulated review and reports reconnect status');
 await tool.fill('50');await panel.getByRole('button',{name:'Review changes',exact:true}).click();await panel.getByRole('checkbox',{name:'I reviewed these changes.',exact:true}).check();
 if(desktop){const changed=JSON.parse(await readFile(settingsFile,'utf8'));changed.theme='external';await writeFile(settingsFile,JSON.stringify(changed));}
 else await page.evaluate(async name=>{const {state}=await window.musebench.customize({type:'refresh'});const server=state.servers.find(s=>s.name===name);await window.musebench.customize({type:'serverAction',name,revision:server.revision,action:'disable',reviewed:true});},names[0]);
 await apply.click();await panel.getByRole('alert').filter({hasText:/changed/i}).waitFor();if(desktop)assert.equal(JSON.parse(await readFile(settingsFile,'utf8')).mcpServers[names[0]].tool_timeout_sec,45);pass('A source change after review prevents the stale write');
 await dialog.getByRole('button',{name:'Back to installed',exact:true}).click();await dialog.getByRole('button',{name:`Manage ${names[1]}`,exact:true}).click();await panel.getByText('Run settings',{exact:true}).click();await connection.waitFor();assert.equal(await connection.inputValue(),'30');
 if(!desktop){
  await dialog.getByRole('button',{name:'Back to installed',exact:true}).click();await dialog.getByRole('button',{name:'Refresh extensions',exact:true}).click();await until(()=>dialog.getByRole('button',{name:'Refresh extensions',exact:true}).isEnabled());await page.evaluate(()=>window.__holdPanel=true);await dialog.getByRole('button',{name:`Manage ${names[0]}`,exact:true}).click();await panel.getByText('Run settings',{exact:true}).click();await page.waitForFunction(()=>!!window.__releasePanel);
  await dialog.getByRole('button',{name:'Back to installed',exact:true}).click();await page.evaluate(()=>{window.__holdPanel=false;window.__releasePanel();});await dialog.getByRole('button',{name:`Manage ${names[1]}`,exact:true}).click();await panel.getByText('Run settings',{exact:true}).click();await connection.waitFor();assert.equal(await connection.inputValue(),'30');
 }
 pass('Changing installed items discards the previous draft and late inspection cannot restore it');
 if(desktop)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).setContentSize(680,900));else await page.setViewportSize({width:680,height:900});
 report.narrowLayout=await panel.evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,width:innerWidth,children:[...e.querySelectorAll("*")].map(child=>({tag:child.tagName,classes:child.getAttribute("class"),left:child.getBoundingClientRect().left,right:child.getBoundingClientRect().right,transform:getComputedStyle(child).transform})).filter(child=>child.right>e.getBoundingClientRect().right)}));
 assert.equal(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);await panel.screenshot({path:path.join(output,'narrow.png')});pass('Shared native controls fit a narrow window without horizontal overflow');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;console.error(error);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await browser?.close();await app?.close();await server?.close();}
