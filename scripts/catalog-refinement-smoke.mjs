import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {mkdir} from 'node:fs/promises';
const server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-refinement',server:{host:'127.0.0.1',port:4337,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:960}});
await mkdir('artifacts/customize-refinement',{recursive:true});
try{
 await page.goto('http://127.0.0.1:4337/preview.html');
 await page.getByRole('button',{name:'Customize',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Customize'});const rows=dialog.locator('.catalog-card');await rows.first().waitFor();
 await page.evaluate(()=>{
  const original=window.musebench.customize;window.__calls=[];
  window.musebench.customize=async c=>{window.__calls.push(c);const r=await original(c);
   if(c.type==='refresh'&&window.__unreviewed){r.state={...r.state,pluginsReviewed:false,pluginRevision:'complete-inventory',plugins:[{id:'alpha',title:'Alpha tools',description:'First package',version:'1',enabled:true,valid:true,reviewRequired:true,capabilities:[{kind:'skills',count:2}]},{id:'beta',title:'Beta tools',description:'Another package outside the search',version:'1',enabled:true,valid:true,reviewRequired:true,capabilities:[{kind:'mcp_servers',count:3}]}]};}
   if(c.type==='catalogSearch'&&window.__hold)await new Promise(resolve=>{window.__release=resolve});
   if(c.type==='catalogSearch'&&c.source==='community'){
    window.__sample=r.catalog.entries[0]??window.__sample;
    const all=Array.from({length:240},(_,i)=>({...window.__sample,id:`fixture-${i}`,title:`Community item ${i}`,description:`Useful workflow ${i}`}));
    const filtered=all.filter(x=>x.title.toLowerCase().includes((c.query??'').toLowerCase()));const offset=Number(c.cursor??0);
    r.catalog={...r.catalog,entries:filtered.slice(offset,offset+30),nextCursor:filtered.length>offset+30?String(offset+30):null};
   }return r;
  };
 });
 const count=await rows.count();await page.evaluate(()=>{window.__hold=true});
 await dialog.getByRole('button',{name:'Refresh catalog',exact:true}).click();await page.waitForFunction(()=>!!window.__release);
 assert.equal(await rows.count(),count,'Pending refresh must retain existing rows instead of flashing blank');
 await page.evaluate(()=>{window.__hold=false;window.__release()});
 await page.waitForFunction(()=>!document.querySelector('.extension-catalog [role=status]'));
 assert.equal(await dialog.locator('.extensions-installed-nav').count(),0);
 const controls=dialog.locator('.catalog-controls');
 for(const name of ['Curated','Community','Installed'])assert.equal(await controls.getByRole('button',{name,exact:true}).count(),1);
 await controls.getByRole('button',{name:'Installed',exact:true}).click();
 await dialog.getByRole('button',{name:'Manage Clear project notes',exact:true}).waitFor();
 assert.equal(await dialog.locator('.catalog-card').count(),1);assert.equal(await dialog.locator('.extension-card').count(),0);
 const position=await dialog.locator('.catalog-card').first().evaluate(e=>e.getBoundingClientRect().top-document.querySelector('.extensions-content').getBoundingClientRect().top);
 assert(position<180,`Installed entries must start promptly (${position}px)`);
 await dialog.getByText('Setup status',{exact:true}).click();
 assert.match(await dialog.locator('.extension-diagnostics').innerText(),/Configuration read|Preview sample/);
 const openedPosition=await dialog.locator('.catalog-card').first().evaluate(e=>e.getBoundingClientRect().top-document.querySelector('.extensions-content').getBoundingClientRect().top);
 assert.equal(openedPosition,position,'Opening setup details must not displace installed entries');
 await dialog.getByText('Setup status',{exact:true}).click();
 await dialog.getByText('Skill tools',{exact:true}).click();
 await dialog.getByText('Setup status',{exact:true}).click();
 assert.equal(await dialog.locator('details.extensions-tools').filter({has:page.getByText('Skill tools',{exact:true})}).getAttribute('open'),null,'Setup status must close the overlapping Skill tools panel');
 await dialog.getByText('Skill tools',{exact:true}).click();
 assert.equal(await dialog.locator('.extension-diagnostics').getAttribute('open'),null,'Skill tools must close the overlapping Setup status panel');
 await dialog.locator('.extensions-add > summary').click();
 assert.equal(await dialog.locator('details.extensions-tools').filter({has:page.getByText('Skill tools',{exact:true})}).getAttribute('open'),null,'Add must close the overlapping Skill tools panel');
 await dialog.locator('.extensions-add > summary').click();
 await page.screenshot({path:'artifacts/customize-refinement/after-installed.png'});
 await controls.getByRole('button',{name:'Community',exact:true}).click();await rows.first().waitFor();
 assert.equal(await dialog.getByRole('button',{name:'Load more',exact:true}).count(),0);
 for(let i=0;i<9;i++){await dialog.locator('.extensions-content').evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(250)}
 assert.equal(await rows.count(),240,'Scrolling should reveal over 200 rows without a Load more click');
 const regressions=[];
 await page.getByRole('button',{name:'View Community item 120',exact:true}).scrollIntoViewIfNeeded();
 const anchor=page.getByRole('button',{name:'View Community item 120',exact:true});const anchorTop=(await anchor.boundingBox()).y;
 await dialog.getByRole('button',{name:'Refresh catalog',exact:true}).evaluate(e=>e.click());
 await page.waitForFunction(()=>!document.querySelector('.extension-catalog [role=status]'));
 if(await rows.count()!==240)regressions.push('Completed Community refresh discarded loaded rows');
 else if(Math.abs((await anchor.boundingBox()).y-anchorTop)>3)regressions.push('Completed Community refresh moved the browsing anchor');
 await controls.getByRole('button',{name:'Curated',exact:true}).click();
 await page.evaluate(()=>{window.__hold=true;window.__release=undefined});
 await dialog.getByRole('button',{name:'Refresh catalog',exact:true}).click();await page.waitForFunction(()=>!!window.__release);
 await controls.getByRole('button',{name:'Community',exact:true}).click();await page.waitForTimeout(80);
 if(await dialog.getByRole('button',{name:'Refresh catalog',exact:true}).isDisabled())regressions.push('Switching to cached Community left loading stuck');
 await page.evaluate(()=>{window.__hold=false;window.__release()});
 await controls.getByRole('textbox',{name:'Search catalog'}).fill('Community item 239');await controls.getByRole('button',{name:'Search',exact:true}).click();
 await page.getByRole('button',{name:'View Community item 239',exact:true}).waitFor();assert.equal(await rows.count(),1);
 for(const width of [1440,820,375]){await page.setViewportSize({width,height:960});const overflow=await dialog.locator('.extensions-content').evaluate(e=>e.scrollWidth-e.clientWidth);assert(overflow<=1,`No horizontal overflow at ${width}px`);}
 await page.setViewportSize({width:1440,height:960});await controls.getByRole('button',{name:'Installed',exact:true}).click();
 await dialog.getByRole('tab',{name:'Plugins',exact:true}).click();await page.evaluate(()=>{window.__unreviewed=true});
 await dialog.getByRole('button',{name:'Refresh extensions',exact:true}).click();await dialog.getByRole('button',{name:'Manage Alpha tools',exact:true}).waitFor();
 await dialog.getByRole('textbox',{name:'Search extensions',exact:true}).fill('Alpha');
 const review=dialog.getByRole('button',{name:'Review plugins',exact:true});
 if(await review.count()===0)regressions.push('Inventory review is missing from Installed');
 else{
  await review.click();
  assert.equal(await dialog.getByRole('button',{name:'Confirm',exact:true}).isDisabled(),true);
  assert.equal(await dialog.locator('.plugin-review-inventory').getByText('Alpha tools',{exact:true}).count(),1);
  assert.equal(await dialog.locator('.plugin-review-inventory').getByText('Beta tools',{exact:true}).count(),1);
  assert.equal(await dialog.locator('.plugin-review-inventory').getByText('3 mcp servers',{exact:true}).count(),1);
 }
 assert.deepEqual(regressions,[]);
 console.log('PASS retained refresh and scroll, cache cancellation, compact toolbar, Installed parity, complete plugin inventory review, 240-row continuous scroll and full-directory search');
}finally{await browser.close();await server.close()}
