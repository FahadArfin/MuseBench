import assert from 'node:assert/strict';

/** Shared UI contract in isolated preview/Electron profiles. Native projection has separate service tests. */
export async function checkSkillContext({page,dialog,pass,screenshot,desktopApp}){
 const viewport=page.viewportSize();
 let cdp;
 const cost=(startup,invoke=null)=>({startupTokens:startup,startupBytes:startup===null?null:startup*4,invokeTokens:invoke,invokeBytes:invoke===null?null:invoke*4});
 const fixture={skills:[
   {id:'context-enabled',title:'Plan clearly',description:'A sample planning skill.',scope:'bundled',activation:'on',contextCost:cost(100),diagnostics:[]},
   {id:'context-manual',title:'Manual review',description:'A sample review skill.',scope:'user',activation:'user-only',contextCost:cost(0,300),diagnostics:['Loader note <script>window.__skillScriptRan=true</script>']},
   {id:'context-unknown',title:'Missing cost',description:'No reported estimate.',scope:'user',activation:'on',contextCost:cost(null),diagnostics:[]},
  ],skillCatalog:{diagnostics:['Project skills skipped until the workspace is reviewed.'],omitted:2}};
 if(desktopApp)await desktopApp.evaluate((_electron,fixture)=>{const f=globalThis.__catalogFixture;f.skillContextOriginal={skills:f.state.skills,skillCatalog:f.state.skillCatalog,errors:f.state.errors};Object.assign(f.state,fixture);f.skillContextActive=true;},fixture);
 else await page.evaluate(fixture=>{
  window.__skillContextOriginal=window.musebench.customize;
  window.__skillContextFixture=fixture;
  window.musebench.customize=async command=>{
   if(command.type==='skillActivation'){
    const skill=window.__skillContextFixture.skills.find(s=>s.id===command.id);
    if(!skill)throw Error('Unknown inspector fixture');
    skill.activation=command.activation;skill.contextCost.startupTokens=command.activation==='on'?100:0;skill.contextCost.startupBytes=skill.contextCost.startupTokens*4;
   }
   const result=await window.__skillContextOriginal(command.type==='skillActivation'?{type:'refresh'}:command);
   if(result.state)return{...result,state:window.__skillContextUnavailable?{...result.state,skills:[],skillCatalog:undefined,errors:['Skills could not be refreshed.']}:{...result.state,...structuredClone(window.__skillContextFixture),errors:window.__skillContextFixture.skillCatalog.stale?['Skills could not be refreshed.']:result.state.errors}};
   return result;
  };
 },fixture);
 try{
  await dialog.getByRole('button',{name:'Refresh extensions',exact:true}).click();
  await dialog.getByRole('button',{name:'Installed',exact:true}).click();
  const summary=dialog.locator('.skill-context-summary'),toggle=summary.locator(':scope > button');
  await summary.getByText('~100 tokens at startup · partial',{exact:true}).waitFor();
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await toggle.focus();await page.keyboard.press('Space');
  await summary.getByText('Estimates reported for 2 of 3 listed skills. 2 additional entries could not be displayed.',{exact:true}).waitFor();
  assert.equal(await summary.getByText('2 enabled',{exact:true}).count(),1);
  assert.equal(await summary.getByText('1 manual only',{exact:true}).count(),1);
  await summary.getByText('Project skills skipped until the workspace is reviewed.',{exact:true}).waitFor();
  await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await page.keyboard.press('Space');
  const filter=dialog.getByRole('textbox',{name:'Search extensions',exact:true});
  await filter.fill('Missing cost');assert.equal(await dialog.locator('.extension-card').count(),1);
  assert.equal(await summary.getByText('~100 tokens at startup · partial',{exact:true}).count(),1);
  await filter.fill('');
  await dialog.getByRole('button',{name:'Context details for Manual review',exact:true}).click();
  const manual=dialog.locator('.extension-card').filter({hasText:'Manual review'});
  await manual.getByText('~300 tokens',{exact:true}).waitFor();
  await manual.getByText('Loader note <script>window.__skillScriptRan=true</script>',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__skillScriptRan),undefined);
  await dialog.getByRole('button',{name:'Context details for Plan clearly',exact:true}).click();
  assert.equal(await dialog.locator('.extension-card').filter({hasText:'Plan clearly'}).getByText('Not reported',{exact:true}).count(),2);
  await dialog.getByRole('combobox',{name:'Activation for Plan clearly',exact:true}).selectOption('off');
  await summary.getByText('~0 tokens at startup · partial',{exact:true}).waitFor();
  assert.equal(await summary.getByText('1 disabled',{exact:true}).count(),1);
  await page.waitForFunction(()=>!document.querySelector('.extensions-modal').getAnimations({subtree:true}).some(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime)));
  await screenshot('skill-context-inspector');
  pass('Skill context preserves partial totals across filtering, shows safe loader notes and missing values, and refreshes after activation changes');
  if(desktopApp){cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setDeviceMetricsOverride',{width:375,height:960,deviceScaleFactor:1,mobile:false});}
  else await page.setViewportSize({width:375,height:960});
  const bounds=await summary.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert(bounds.scroll<=bounds.width+1&&bounds.page<=bounds.viewport+1,JSON.stringify(bounds));
  await screenshot('skill-context-narrow');
  if(desktopApp)await desktopApp.evaluate(()=>{const state=globalThis.__catalogFixture.state;state.skillCatalog.stale=true;state.errors=['Skills could not be refreshed.'];});
  else await page.evaluate(()=>{window.__skillContextFixture.skillCatalog.stale=true;});
  await dialog.getByRole('button',{name:'Refresh extensions',exact:true}).click();
  await summary.getByText('Last refresh',{exact:true}).waitFor();
  await summary.getByText('Showing the last successful refresh. Estimates and skill settings may have changed.',{exact:true}).waitFor();
  assert.equal(await summary.getByText('~0 tokens at startup · partial',{exact:true}).count(),1);
  assert.equal(await dialog.locator('.extension-card').count(),3);
  if(desktopApp)await desktopApp.evaluate(()=>{const state=globalThis.__catalogFixture.state;delete state.skillCatalog.stale;state.errors=[];});
  else await page.evaluate(()=>{delete window.__skillContextFixture.skillCatalog.stale;});
  await dialog.getByRole('button',{name:'Refresh extensions',exact:true}).click();
  await summary.getByText('Last refresh',{exact:true}).waitFor({state:'hidden'});
  if(desktopApp)await desktopApp.evaluate(()=>{Object.assign(globalThis.__catalogFixture.state,{skills:[],skillCatalog:undefined,errors:['Skills could not be refreshed.']});});
  else await page.evaluate(()=>{window.__skillContextUnavailable=true;});
  await dialog.getByRole('button',{name:'Refresh extensions',exact:true}).click();
  await summary.getByText('Estimate unavailable',{exact:true}).waitFor();
  await dialog.getByText('Skills could not be refreshed.',{exact:true}).waitFor();
  pass('Keyboard disclosures and narrow layout remain usable; failed refresh retains marked observations, recovery clears staleness, and no observations stays unavailable');
 }finally{
  if(cdp){try{await cdp.send('Emulation.clearDeviceMetricsOverride');}finally{await cdp.detach();}}
  else if(!desktopApp&&viewport)await page.setViewportSize(viewport);
  if(desktopApp)await desktopApp.evaluate(()=>{const f=globalThis.__catalogFixture;Object.assign(f.state,f.skillContextOriginal);delete f.skillContextOriginal;delete f.skillContextActive;});
  else await page.evaluate(()=>{window.musebench.customize=window.__skillContextOriginal;delete window.__skillContextOriginal;delete window.__skillContextFixture;delete window.__skillContextUnavailable;});
  await dialog.getByRole('button',{name:'Refresh extensions',exact:true}).click();
  await dialog.getByRole('button',{name:'Discover',exact:true}).click();
 }
}
