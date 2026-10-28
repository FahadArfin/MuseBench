import assert from 'node:assert/strict';

export async function checkProjectInstructions({page,dialog,pass,screenshot,desktopApp}){
 const fixture={simulation:true,root:'C:/sample/app',checkedAt:'2026-10-28T16:00:00Z',boundary:{kind:'git',root:'C:/sample'},selectedCount:2,selectedBytes:27,measuredBytes:27,complete:true,trust:{status:'required'},levels:[
  {root:'C:/sample',files:[{path:'CLAUDE.md',selected:true,bytes:11,text:'Outer rules'}]},
  {root:'C:/sample/app',files:[{path:'AGENTS.md',selected:true,bytes:16,text:'<b>Safe text</b>'},{path:'CLAUDE.md',selected:false,shadowedBy:'AGENTS.md',bytes:7,text:'Skipped'}]},
 ]};
 const viewport=page.viewportSize();let cdp;
 if(desktopApp)await desktopApp.evaluate((_electron,fixture)=>{globalThis.__catalogFixture.instructions=fixture;globalThis.__catalogFixture.instructionCalls=0;},fixture);
 else await page.evaluate(fixture=>{window.__instructionOriginal=window.musebench.customize;window.__instructionFixture=fixture;window.__instructionCalls=0;window.musebench.customize=async command=>{if(command.type!=='inspectProject')return window.__instructionOriginal(command);window.__instructionCalls++;if(window.__instructionFail)throw Error('Inspection temporarily unavailable');return{projectInstructions:structuredClone(window.__instructionFixture)};};},fixture);
 try{
  await dialog.getByRole('button',{name:'Installed',exact:true}).click();
  const panel=dialog.locator('.project-instructions'),toggle=panel.getByRole('button',{name:'Project instructions',exact:true});
  await toggle.waitFor();assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  const calls=()=>desktopApp?desktopApp.evaluate(()=>globalThis.__catalogFixture.instructionCalls):page.evaluate(()=>window.__instructionCalls);
  assert.equal(await calls(),0);
  await toggle.focus();await page.keyboard.press('Space');
  await panel.getByText('2 selected files · 27 bytes',{exact:true}).waitFor();
  assert.equal(await calls(),1);await panel.getByText('Review required',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'Read AGENTS.md in C:/sample/app',exact:true}).click();
  await panel.locator('pre').filter({hasText:'<b>Safe text</b>'}).waitFor();assert.equal(await panel.locator('pre b').count(),0);
  assert.equal(await panel.getByText('Shadowed by AGENTS.md',{exact:true}).count(),1);
  await toggle.click();await toggle.click();assert.equal(await calls(),1);
  await page.waitForFunction(()=>!document.querySelector('.project-instructions').getAnimations({subtree:true}).some(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime)));
  await screenshot('project-instructions');
  pass('Project rules load on demand, retain a snapshot across smooth collapse, show documented precedence and render file contents as text');
  if(desktopApp){cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setDeviceMetricsOverride',{width:375,height:960,deviceScaleFactor:1,mobile:false});}
  else await page.setViewportSize({width:375,height:960});
  const bounds=await panel.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert(bounds.scroll<=bounds.width+1&&bounds.page<=bounds.viewport+1,JSON.stringify(bounds));await screenshot('project-instructions-narrow');
  if(desktopApp)await desktopApp.evaluate(()=>{globalThis.__catalogFixture.instructionFail=true;});
  else await page.evaluate(()=>{window.__instructionFail=true;});
  await panel.getByRole('button',{name:'Refresh project instructions',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'Inspection temporarily unavailable'}).waitFor();
  assert.equal(await panel.getByText('2 selected files · 27 bytes',{exact:true}).count(),0);
  const partial={...fixture,complete:false,selectedBytes:null,trust:{status:'unavailable',reason:'Ancestor instructions require broader trust support.'}};
  if(desktopApp)await desktopApp.evaluate((_electron,value)=>{globalThis.__catalogFixture.instructionFail=false;globalThis.__catalogFixture.instructions=value;},partial);
  else await page.evaluate(value=>{window.__instructionFail=false;window.__instructionFixture=value;},partial);
  await panel.getByRole('button',{name:'Refresh project instructions',exact:true}).click();
  await panel.getByText('2 selected files · Size incomplete',{exact:true}).waitFor();
  await panel.getByText('Ancestor instructions require broader trust support.',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'Project trust review',exact:true}).click();
  assert.equal(await panel.getByRole('button',{name:'Review project instructions',exact:true}).isEnabled(),false);
  await toggle.focus();await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  pass('Narrow instruction layout fits; failed refresh removes stale data; partial observations keep costs unknown and unsupported trust disabled');
 }finally{
  if(cdp){try{await cdp.send('Emulation.clearDeviceMetricsOverride');}finally{await cdp.detach();}}
  else if(viewport)await page.setViewportSize(viewport);
  if(desktopApp)await desktopApp.evaluate(()=>{delete globalThis.__catalogFixture.instructions;delete globalThis.__catalogFixture.instructionFail;});
  else await page.evaluate(()=>{window.musebench.customize=window.__instructionOriginal;delete window.__instructionOriginal;delete window.__instructionFixture;delete window.__instructionFail;});
  await dialog.getByRole('button',{name:'Discover',exact:true}).click();
 }
}
