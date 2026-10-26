import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readMetaSchedules,activateMetaSchedule} from '../electron/meta-schedules.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 const card=(title,time)=>`<article><button aria-label="Edit ${title}" onclick="document.querySelector('#result').textContent='edit'">edit</button><div><span>${title}</span><span>${time}</span><button aria-label="Reminder options" onmousedown="document.querySelector('#result').textContent='options'">...</button></div></article>`;
 await page.route('https://www.meta.ai/scheduled',route=>route.fulfill({contentType:'text/html',body:`<main>${card('Daily news','Tomorrow at 8 AM')}<h2>Suggested</h2><button>Daily workout</button><textarea data-testid="composer-input"></textarea><output id="result"></output></main>`}));
 await page.goto('https://www.meta.ai/scheduled');
 const events=[];const contents={focus(){},isDestroyed:()=>false,getURL:()=>page.url(),executeJavaScript:code=>page.evaluate(code),sendInputEvent:event=>events.push(event)};
 const flush=async()=>{for(const e of events.splice(0)){await page.mouse.move(e.x,e.y);await page.mouse[e.type==='mouseDown'?'down':'up']();}};
 let state=await readMetaSchedules(contents);assert.equal(state.status,'ready');assert.equal(state.items.length,1);const item=state.items[0];assert.equal(item.title,'Daily news');
 assert.equal(await activateMetaSchedule(contents,item,'edit'),true);await flush();assert.equal(await page.locator('#result').textContent(),'edit');
 assert.equal(await activateMetaSchedule(contents,item,'options'),true);await flush();assert.equal(await page.locator('#result').textContent(),'options');
 assert.equal(await activateMetaSchedule(contents,{},'new'),true);await flush();assert.equal(await page.locator('textarea').evaluate(e=>e===document.activeElement),true);
 await page.locator('article span').last().evaluate(e=>e.textContent='Friday');assert.equal(await activateMetaSchedule(contents,item,'edit'),false);
 state=await readMetaSchedules(contents);assert.equal(state.items[0].timing,'Friday');assert.notEqual(state.items[0].id,item.id);
 await page.locator('article').evaluate(e=>e.after(e.cloneNode(true)));state=await readMetaSchedules(contents);assert.equal(state.items[0].ambiguous,true);assert.equal(await activateMetaSchedule(contents,state.items[0],'options'),false);
 await page.locator('article').evaluateAll(items=>items.forEach(e=>e.remove()));assert.deepEqual((await readMetaSchedules(contents)).items,[]);assert.equal(await page.getByRole('heading',{name:'Suggested'}).count(),1);assert.equal(await page.locator('textarea').count(),1);
 console.log('PASS schedule fixture: discovery, edit, options, composer, timing refresh, stale target rejection, duplicates, removal, suggestions preserved');
}finally{await browser.close();}
