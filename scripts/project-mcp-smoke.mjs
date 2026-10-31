import {chromium,_electron as electron} from 'playwright';
import {createServer} from 'vite';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
import {waitForDesktopRenderer} from './electron-window.mjs';

const desktop=process.argv.includes('--desktop'),executablePath=desktop?process.env.MUSEBENCH_EXECUTABLE:undefined,variant=desktop?(executablePath?'packaged':'desktop'):'preview';
await mkdir('artifacts/project-mcp',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/project-mcp',variant+'-'));
const report={variant,status:'running',checks:[],errors:[],providerObservation:'Not instrumented by this catalog fixture; no provider request count is asserted.'};
const pass=message=>{report.checks.push(message);console.log('PASS '+message);};
let app,browser,page,server,project,projectFile;
try{
 if(desktop){
  const profile=path.join(output,'data'),repo=path.join(output,'project');project=path.join(repo,'nested');projectFile=path.join(project,'.mcp.json');
  await mkdir(path.join(profile,'.config','muse'),{recursive:true});await mkdir(path.join(repo,'.git'),{recursive:true});await mkdir(project);
  await writeFile(path.join(profile,'.config','muse','settings.json'),JSON.stringify({mcp_servers:{'project-docs':{transport:'stdio',command:'node',args:['personal-docs.mjs'],env:{ACCESS_TOKEN:'fixture-secret-never-shown',REGION:'fixture-private-personal'},enabled:true}}}));
  await writeFile(path.join(repo,'.mcp.json'),JSON.stringify({mcpServers:{'project-docs':{args:['root-docs.mjs'],env:{REGION:'fixture-private-root'}}}}));
  await writeFile(path.join(project,'AGENTS.md'),'Read files before making changes.');
  await writeFile(projectFile,JSON.stringify({mcpServers:{'project-docs':{args:['local-docs.mjs'],env:{REGION:'fixture-private-nested'},enabled:false}}}));
  const env=isolatedDesktopEnvironment(profile);
  app=await electron.launch({...(executablePath?{executablePath}:{}),args:[...(executablePath?[]:['.']),'--host-resolver-rules=MAP * ~NOTFOUND'],env,timeout:30000});
  page=await waitForDesktopRenderer(app);assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
  if(executablePath){const packaged=await app.evaluate(({app})=>({packaged:app.isPackaged,path:app.getAppPath()}));assert.equal(packaged.packaged,true);assert.equal(path.basename(packaged.path),'app.asar');report.asarSha256=createHash('sha256').update(await readFile(packaged.path)).digest('hex');pass('Explicit executable uses a packaged ASAR and the disposable profile');}
  await page.waitForFunction(()=>!!window.musebench);
  const selected=await page.evaluate(root=>window.musebench.dispatch({type:'openProject',path:root}),project);assert.equal(selected.activeProject.root,project);
 }else{
  server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-project-mcp',server:{host:'127.0.0.1',port:4338,strictPort:true}});await server.listen();
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:960}});await page.goto('http://127.0.0.1:4338/preview.html');
 }
 page.setDefaultTimeout(12000);
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.getByRole('button',{name:'Customize',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Customize'});
 await dialog.getByRole('tab',{name:'MCP servers',exact:true}).click();
 assert.equal(await dialog.locator('.project-mcp-review').count(),0);
 await dialog.getByRole('button',{name:'Project servers',exact:true}).click();
 const panel=dialog.getByRole('region',{name:'Project server review'}),approve=panel.getByRole('button',{name:desktop?'Approve project servers':'Simulate project review',exact:true});
 await approve.waitFor();assert.equal(await approve.isDisabled(),true);assert.equal(await panel.getByRole('heading',{name:/^project-docs/}).count(),1);
 assert(!(await panel.innerText()).includes('fixture-secret-never-shown'));
 const origins=panel.locator('.project-mcp-setting-sources');await origins.locator(':scope > summary').waitFor();assert.equal(await origins.evaluate(el=>el.open),false);
 await origins.locator(':scope > summary').focus();await page.keyboard.press('Enter');await origins.getByText('Built-in default',{exact:true}).first().waitFor();
 await origins.getByText('env.ACCESS_TOKEN',{exact:true}).waitFor();
 if(desktop){
  const row=origins.locator('.project-mcp-setting').filter({has:page.locator('dt').getByText('args',{exact:true})});assert.match(await row.innerText(),/Earlier declarations/);await row.locator('summary').focus();await page.keyboard.press('Enter');await row.locator('ol').waitFor();assert.match(await row.innerText(),/settings\.json/);assert.match(await row.innerText(),/nested/);
  const inspection=await page.evaluate(()=>window.musebench.customize({type:'inspectProjectMcp'}));const serialized=JSON.stringify(inspection.projectMcp.servers.flatMap(server=>server.settingSources));assert(!serialized.includes('fixture-secret'));assert(!serialized.includes('fixture-private'));
  for(const server of inspection.projectMcp.servers)for(const entry of server.settingSources)for(const source of [entry.source,...entry.overrides].filter(Boolean))assert(inspection.projectMcp.sources.some(item=>item.path===source.path&&item.revision===source.revision));
 }
 pass('Setting sources starts collapsed, opens by keyboard and shows safe canonical fields and built-in defaults');
 await page.setViewportSize({width:390,height:844});await origins.scrollIntoViewIfNeeded();assert.equal(await origins.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.screenshot({path:path.join(output,'sources-narrow.png')});await origins.locator(':scope > summary').focus();await page.keyboard.press('Enter');assert.equal(await origins.evaluate(el=>el.open),false);await page.setViewportSize({width:1440,height:960});pass('Origins and review fit 390px width; keyboard closes disclosure');
 await panel.locator('summary').filter({hasText:'Project instructions included'}).click();await panel.locator('summary').filter({hasText:'AGENTS.md'}).click();await panel.getByText('Read files before making changes.',{exact:true}).waitFor();
 await panel.getByRole('checkbox').check();
 if(desktop){
  await writeFile(projectFile,JSON.stringify({mcpServers:{'project-docs':{args:['changed-docs.mjs'],env:{REGION:'fixture-private-changed'},enabled:false}}}));await approve.click();await dialog.getByRole('alert').filter({hasText:'changed after review'}).waitFor();
  await panel.getByRole('button',{name:'Refresh project servers'}).click();await panel.getByText('changed-docs.mjs',{exact:false}).waitFor();assert.equal(await panel.getByRole('checkbox').isChecked(),false);await panel.getByRole('checkbox').check();
  await writeFile(path.join(project,'AGENTS.md'),'Changed after review.');await approve.click();await dialog.getByRole('alert').filter({hasText:'changed after review'}).waitFor();
  await panel.getByRole('button',{name:'Refresh project servers'}).click();await panel.getByText('Changed after review.',{exact:true}).waitFor();assert.equal(await panel.getByRole('checkbox').isChecked(),false);await panel.getByRole('checkbox').check();
 }
 await approve.click();await panel.getByRole('button',{name:'Revoke project server access'}).waitFor();
 await page.screenshot({path:path.join(output,'reviewed.png')});
 await dialog.getByRole('button',{name:'Back to MCP servers',exact:true}).click();await dialog.getByRole('tab',{name:'Skills',exact:true}).click();
 await dialog.locator('summary').filter({hasText:/^Skill tools$/}).click();
 await dialog.getByRole('button',{name:'Project instructions',exact:true}).click();
 const inspector=dialog.getByRole('region',{name:'Project instruction inspector'});await inspector.getByText('Project review current',{exact:true}).waitFor();
 await inspector.getByRole('button',{name:'Project trust review',exact:true}).click();
 await inspector.getByRole('button',{name:'Review project servers and instructions',exact:true}).click();await panel.getByRole('button',{name:'Revoke project server access'}).waitFor();
 await panel.getByRole('button',{name:'Revoke project server access'}).click();await approve.waitFor();assert.equal(await approve.isDisabled(),true);
 await dialog.getByRole('button',{name:'Back to Skills',exact:true}).click();assert.equal(await panel.count(),0);assert.equal(await dialog.locator('.catalog-controls').count(),1);
 if(desktop){const grant=JSON.parse(await readFile(path.join(output,'data','extension-reviews.json'),'utf8'));assert.equal(grant.projectMcp[project],undefined);assert(!JSON.stringify(grant).includes('fixture-secret-never-shown'));}
 pass(`${desktop?'desktop real IPC':'preview'} project MCP review, explicit approval, instruction status, revocation, redaction and compact directory return`);assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.message;if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failed.png')});throw error;}finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await app?.close();await browser?.close();await server?.close();}
