import {chromium,_electron as electron} from 'playwright';
import {createServer} from 'vite';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const desktop=process.argv.includes('--desktop');
await mkdir('artifacts/project-mcp',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/project-mcp',desktop?'desktop-':'preview-'));
let app,browser,page,server,project;
try{
 if(desktop){
  const profile=path.join(output,'home');project=path.join(output,'project');
  await mkdir(path.join(profile,'.config','muse'),{recursive:true});await mkdir(path.join(project,'.git'),{recursive:true});
  await writeFile(path.join(project,'AGENTS.md'),'Read files before making changes.');
  await writeFile(path.join(project,'.mcp.json'),JSON.stringify({mcpServers:{'project-docs':{type:'stdio',command:'node',args:['local-docs.mjs'],env:{ACCESS_TOKEN:'fixture-secret-never-shown'}}}}));
  const env={...process.env,HOME:profile,USERPROFILE:profile,XDG_CONFIG_HOME:path.join(profile,'.config'),XDG_DATA_HOME:path.join(profile,'.local','share'),MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
  app=await electron.launch({args:['.','--host-resolver-rules=MAP * ~NOTFOUND'],env,timeout:30000});
  const deadline=Date.now()+30000;while(Date.now()<deadline){page=app.windows().find(p=>/\/dist\/index\.html/.test(p.url()));if(page)break;await new Promise(r=>setTimeout(r,100));}assert(page);
  await page.waitForFunction(()=>!!window.musebench);
  const selected=await page.evaluate(root=>window.musebench.dispatch({type:'openProject',path:root}),project);assert.equal(selected.activeProject.root,project);
 }else{
  server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-project-mcp',server:{host:'127.0.0.1',port:4338,strictPort:true}});await server.listen();
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:960}});await page.goto('http://127.0.0.1:4338/preview.html');
 }
 page.setDefaultTimeout(12000);
 await page.getByRole('button',{name:'Customize',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Customize'});
 await dialog.getByRole('tab',{name:'MCP servers',exact:true}).click();
 assert.equal(await dialog.locator('.project-mcp-review').count(),0);
 await dialog.getByRole('button',{name:'Project servers',exact:true}).click();
 const panel=dialog.getByRole('region',{name:'Project server review'}),approve=panel.getByRole('button',{name:desktop?'Approve project servers':'Simulate project review',exact:true});
 await approve.waitFor();assert.equal(await approve.isDisabled(),true);assert.equal(await panel.getByRole('heading',{name:/^project-docs/}).count(),1);
 assert(!(await panel.innerText()).includes('fixture-secret-never-shown'));
 await panel.locator('summary').filter({hasText:'Project instructions included'}).click();await panel.locator('summary').filter({hasText:'AGENTS.md'}).click();await panel.getByText('Read files before making changes.',{exact:true}).waitFor();
 await panel.getByRole('checkbox').check();
 if(desktop){
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
 console.log(`PASS ${desktop?'desktop real IPC':'preview'} project MCP review, explicit approval, instruction status, revocation, redaction and compact directory return`);
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failed.png')});throw error;}finally{await app?.close();await browser?.close();await server?.close();}
