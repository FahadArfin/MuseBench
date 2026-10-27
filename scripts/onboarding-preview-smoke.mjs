import {createServer} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-onboarding',server:{host:'127.0.0.1',port:4326,strictPort:true}});await server.listen();
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1200,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4326/preview.html?setup=1');
 await page.getByRole('button',{name:'Profile menu',exact:true}).waitFor();
 assert.equal(await page.locator('.onboarding').count(),0);
 assert.equal(await page.getByRole('button',{name:'Log in to Muse AI',exact:true}).count(),0);
 assert.equal(await page.evaluate(async()=>(await window.musebench.personalState()).destination),'chat');
 await mkdir('artifacts/onboarding',{recursive:true});await page.screenshot({path:'artifacts/onboarding/direct-chat.png'});
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();
 assert.equal(await page.locator('.onboarding').count(),0);
 await page.getByRole('button',{name:'Muse AI',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.reload();
 await page.getByRole('button',{name:'Open navigation',exact:true}).waitFor();
 assert.equal(await page.locator('.onboarding').count(),0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'artifacts/onboarding/direct-chat-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS direct Meta AI startup without mandatory sign-in or profile setup');
}finally{await browser.close();await server.close();}
