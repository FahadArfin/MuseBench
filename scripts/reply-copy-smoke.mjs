// Actual shared response component with browser clipboard capabilities injected.
// No provider or model requests. The desktop host is checked by response-actions-smoke.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
await mkdir('artifacts/reply-copy',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/reply-copy','preview-'));
const source='# Reply\n\n**Bold** and `code`.\n\n- First\n- Second\n\n[Guide](https://example.com)\n\n![Image](https://example.com/tracker.png)';
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{ResponseActions}from'./src/ui/ResponseActions.tsx';
window.copies={rich:[],plain:[],mode:'rich'};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{if(window.copies.mode!=='rich')throw Error('Rich disabled');const item=items[0];window.copies.rich.push({text:await(await item.getType('text/plain')).text(),html:await(await item.getType('text/html')).text()});},writeText:async text=>{if(window.copies.mode==='denied')throw Error('Clipboard denied');window.copies.plain.push(text);}}});
createRoot(document.getElementById('root')).render(<ResponseActions messageId='copy' chatId='copy' at='2026-10-29T12:00:00Z' text={${JSON.stringify(source)}} branchDisabled={false} onBranch={()=>{}}/>);`;
const bundled=await build({stdin:{contents:fixture,sourcefile:'reply-copy-fixture.tsx',loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:'fixture.js',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
const js=bundled.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundled.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:`<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div><script src="/fixture.js"></script>`);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),report={checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);const copy=page.getByRole('group',{name:'Response actions'}).getByRole('button').first();await copy.click();await page.waitForFunction(()=>window.copies.rich.length===1);let value=await page.evaluate(()=>window.copies.rich[0]);assert.equal(value.text,source);assert.match(value.html,/<h1>Reply<\/h1>/);assert.match(value.html,/<strong>Bold<\/strong>/);assert.doesNotMatch(value.html,/<img|<button|<svg|tracker.png/);pass('Browser Copy writes exact Markdown and safe rich formatting with no app controls');
 await page.evaluate(()=>window.copies.mode='text');await copy.click();await page.waitForFunction(()=>window.copies.plain.length===1);assert.equal(await page.evaluate(()=>window.copies.plain[0]),source);pass('Denied rich copying falls back to the original text');
 await page.evaluate(()=>{window.copies.mode='rich';window.ClipboardItem=undefined;});await copy.click();await page.waitForFunction(()=>window.copies.plain.length===2);pass('Browsers without ClipboardItem still copy text');
 await page.evaluate(()=>window.copies.mode='denied');await copy.click();await page.getByRole('status').filter({hasText:'Copy unavailable'}).waitFor();assert.equal(await copy.getAttribute('aria-label'),'Copy message');pass('A failed clipboard write is never reported as copied');
 await page.evaluate(()=>{window.musebench={copyReply:async()=>{throw Error('Rich serializer failed');},copyText:async text=>{window.copies.plain.push(text);}};});await copy.click();await page.waitForFunction(()=>window.copies.plain.length===3);assert.equal(await page.evaluate(()=>window.copies.plain[2]),source);pass('Desktop rich-copy failure falls back through the host plain-text bridge');
 await page.evaluate(()=>{window.musebench.copyText=async()=>{throw Error('Both writes denied');};});await copy.click();await page.getByRole('status').filter({hasText:'Copy unavailable'}).waitFor();assert.equal(await copy.getAttribute('aria-label'),'Copy message');pass('Failure of both desktop writes remains an error');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;throw e;}finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await browser.close();await new Promise(resolve=>server.close(resolve));}
