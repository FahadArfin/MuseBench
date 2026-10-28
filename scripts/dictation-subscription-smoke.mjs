// Actual draft/dictation hooks in an isolated renderer; no microphone or saved profile.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('..',import.meta.url));
const output=path.resolve(process.argv[2]??path.join(root,'output/playwright/dictation-subscription'));
const source=`
import React,{useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useCodeDraft} from './src/ui/useCodeDraft.ts';
import {useDictation} from './src/ui/useDictation.ts';
const listeners=new Set(),counts={status:0,refresh:0,subscribe:0,unsubscribe:0,cancel:0,start:0},saves=[],appends=[],errors=[];
const idle={id:null,status:'idle',available:false,language:null,text:'',error:null};
let deferStart=false,pendingStart=null,lastId=null,transitionEvent=null;
window.musebench={
 saveCodeDraft:async value=>{saves.push(structuredClone(value));},
 dictation:async action=>{
  if(action==='status'){counts.status++;return {...idle};}
  if(action==='refresh'){counts.refresh++;idle.available=true;idle.language='en-GB';for(const listener of listeners)listener({...idle});return {...idle};}
  if(action==='cancel'){counts.cancel++;return {...idle};}
  if(action==='stop')return {...idle};
  if(action!=='start')throw Error('Unexpected dictation action: '+action);
  counts.start++;lastId='capture-'+counts.start;
  const result={...idle,id:lastId,status:'listening'};
  if(deferStart){deferStart=false;return new Promise(resolve=>{pendingStart=text=>resolve({...result,text});});}
  return result;
 },
 onDictation:callback=>{counts.subscribe++;listeners.add(callback);return()=>{counts.unsubscribe++;listeners.delete(callback);};}
};
function Voice({append,chat,active}){
 const voice=useDictation(active,'project:'+chat,append);
 // Deliver native output after render but before passive cancellation effects.
 useLayoutEffect(()=>{if(transitionEvent){const event=transitionEvent;transitionEvent=null;for(const listener of listeners)listener({...idle,...event});}},[chat,active]);
 return <><button disabled={!active||(!voice.recording&&voice.state.available===false)} onClick={()=>void voice.toggle()}>Toggle voice</button><output aria-label='Voice status'>{voice.state.status}</output><output aria-label='Voice details'>{JSON.stringify(voice.state)}</output></>;
}
function Fixture(){
 const [chat,setChat]=useState('a'),[revision,setRevision]=useState(0),[active,setActive]=useState(true);
 const draft=useCodeDraft(window.musebench,'project',chat,{},error=>errors.push(error));
 const append=value=>{appends.push({chat,revision});draft.setMessage(value);};
 return <><output aria-label='Current chat'>{chat}</output><input aria-label='Draft' value={draft.message} onChange={event=>draft.setMessage(event.target.value)}/><button onClick={()=>setRevision(revision+1)}>Other update</button><button onClick={()=>setChat(chat==='a'?'b':'a')}>Switch chat</button><button onClick={()=>setActive(!active)}>Enable voice</button><Voice append={append} chat={chat} active={active}/></>;
}
const renderer=createRoot(document.getElementById('root'));
window.__dictationFixture={
 snapshot:()=>structuredClone({counts,saves,appends,errors,lastId,listeners:listeners.size}),
 emit:(id,text,status='listening')=>{for(const listener of listeners)listener({...idle,id,text,status});},
 emitDuringTransition:(id,text)=>{transitionEvent={id,text,status:'listening'};},
 deferStart:()=>{deferStart=true;},
 resolveStart:text=>{const resolve=pendingStart;pendingStart=null;if(!resolve)throw Error('No pending start');resolve(text);},
 unmount:()=>renderer.unmount()
};
renderer.render(<Fixture/>);
`;
const bundle=await build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const server=createServer((request,response)=>{
 const script=request.url==='/bundle.js';
 response.setHeader('Content-Type',script?'application/javascript':'text/html');
 response.end(script?bundle.outputFiles[0].text:'<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
const report={checks:[],errors:[]};let browser,page;
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});page=await browser.newPage();page.setDefaultTimeout(10000);
 const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto(origin);
 const snapshot=()=>page.evaluate(()=>window.__dictationFixture.snapshot());
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const draft=page.getByRole('textbox',{name:'Draft'}),voice=page.getByRole('button',{name:'Toggle voice'});
 const emit=(id,text)=>page.evaluate(({id,text})=>window.__dictationFixture.emit(id,text),{id,text});
 await page.waitForFunction(()=>window.__dictationFixture.snapshot().counts.subscribe===1);await settle();
 const mounted=await snapshot();
 await draft.pressSequentially('abcdefghijklmnopqrst');await settle();
 let state=await snapshot();report.afterTyping=state.counts;
 assert.equal(state.saves.length,20,'Each keystroke must still save its draft immediately');
 assert.equal(state.saves.at(-1).text,'abcdefghijklmnopqrst');
 assert.equal(state.counts.status,mounted.counts.status,'Typing must not repeat the dictation status request');
 assert.equal(state.counts.subscribe,mounted.counts.subscribe,'Typing must not replace the dictation listener');
 assert.equal(state.counts.unsubscribe,0);
 pass('Twenty typed characters retain immediate saves and one dictation subscription/status request');

 assert.equal(await voice.isDisabled(),true,'Initial unavailable speech must disable starting dictation');
 await page.getByRole('button',{name:'Enable voice'}).click();await settle();
 const beforeRefresh=await snapshot();
 await page.evaluate(()=>window.musebench.dictation('refresh'));await settle();
 let details=JSON.parse(await page.locator('[aria-label="Voice details"]').textContent());
 assert.equal(details.available,true,'Availability refresh must reach an inactive composer without a capture');
 assert.equal(details.language,'en-GB');
 await emit('unrelated-capture','Unrelated speech must stay out of the draft');await settle();
 details=JSON.parse(await page.locator('[aria-label="Voice details"]').textContent());
 assert.equal(details.id,null);assert.equal(details.text,'');assert.equal(details.status,'idle');
 assert.equal(await draft.inputValue(),'abcdefghijklmnopqrst');
 state=await snapshot();assert.equal(state.saves.length,beforeRefresh.saves.length);assert.equal(state.counts.start,0);
 assert.equal(state.counts.status,1);assert.equal(state.counts.subscribe,1);assert.equal(state.counts.unsubscribe,0);
 await page.getByRole('button',{name:'Enable voice'}).click();await settle();assert.equal(await voice.isEnabled(),true);
 pass('Availability refresh updates inactive composer metadata without capturing unrelated speech or resubscribing');

 for(let i=0;i<5;i++)await page.getByRole('button',{name:'Other update'}).click();await settle();
 state=await snapshot();assert.equal(state.counts.status,1);assert.equal(state.counts.subscribe,1);assert.equal(state.counts.unsubscribe,0);
 await voice.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Voice status"]').textContent==='listening');
 const first=(await snapshot()).lastId;await emit(first,'spoken phrase');await settle();
 assert.equal(await draft.inputValue(),'abcdefghijklmnopqrst spoken phrase');
 assert.deepEqual((await snapshot()).appends.at(-1),{chat:'a',revision:5},'Speech must use the latest render callback');
 await emit(first,'spoken phrase');await settle();assert.equal(await draft.inputValue(),'abcdefghijklmnopqrst spoken phrase','Repeated speech text must not duplicate its suffix');
 pass('Unrelated renders preserve the listener and speech uses the newest draft callback once');

 const beforeSwitch=await snapshot();
 await page.evaluate(id=>window.__dictationFixture.emitDuringTransition(id,'spoken phrase during switch'),first);
 await page.getByRole('button',{name:'Switch chat'}).click();await settle();
 state=await snapshot();assert(state.counts.cancel>beforeSwitch.counts.cancel,'Switching chats must cancel the active capture');
 assert.equal(await draft.inputValue(),'','Speech received before passive cancellation must not enter the new chat');await emit(first,'spoken phrase stale tail');await settle();
 assert.equal(await draft.inputValue(),'');assert.equal((await snapshot()).saves.length,beforeSwitch.saves.length);
 pass('Switching chats excludes speech before passive cancellation and late events from the previous chat');

 await draft.fill('B draft');await page.evaluate(()=>window.__dictationFixture.deferStart());await voice.click();
 await page.getByRole('button',{name:'Other update'}).click();
 await page.evaluate(()=>window.__dictationFixture.resolveStart('opening words'));await settle();
 assert.equal(await draft.inputValue(),'B draft opening words');
 assert.deepEqual((await snapshot()).appends.at(-1),{chat:'b',revision:6},'A delayed start result must use the latest callback');
 const second=(await snapshot()).lastId;await emit(first,'wrong capture');await settle();assert.equal(await draft.inputValue(),'B draft opening words');
 await emit(second,'opening words continued');await settle();assert.equal(await draft.inputValue(),'B draft opening words continued');
 pass('Delayed start and streaming speech use the newest callback and reject other capture IDs');

 const beforeDisable=await snapshot();
 await page.evaluate(id=>window.__dictationFixture.emitDuringTransition(id,'opening words continued during disable'),second);
 await page.getByRole('button',{name:'Enable voice'}).click();await settle();
 assert((await snapshot()).counts.cancel>beforeDisable.counts.cancel);
 await emit(second,'opening words continued ignored');await settle();assert.equal(await draft.inputValue(),'B draft opening words continued');
 await page.getByRole('button',{name:'Enable voice'}).click();await settle();
 await page.evaluate(()=>window.__dictationFixture.deferStart());await voice.click();
 const pendingId=(await snapshot()).lastId;await page.getByRole('button',{name:'Switch chat'}).click();await settle();
 const beforeStale=await snapshot();await page.evaluate(()=>window.__dictationFixture.resolveStart('stale opening'));await emit(pendingId,'stale opening tail');await settle();
 assert.equal(await draft.inputValue(),'abcdefghijklmnopqrst spoken phrase');
 state=await snapshot();assert.equal(state.saves.length,beforeStale.saves.length);assert.equal(state.appends.length,beforeStale.appends.length);
 assert.equal(await page.locator('[aria-label="Voice status"]').textContent(),'idle');
 assert.equal(state.counts.status,1);assert.equal(state.counts.subscribe,1);assert.equal(state.counts.unsubscribe,0);
 pass('Disabling voice and switching during a pending start reject stale captures without resubscribing');

 await page.evaluate(()=>window.__dictationFixture.unmount());await settle();
 const unmounted=await snapshot();assert.equal(unmounted.listeners,0);assert.equal(unmounted.counts.unsubscribe,1);
 await emit(pendingId,'post-unmount text');assert.equal((await snapshot()).saves.length,unmounted.saves.length);
 assert.deepEqual(unmounted.errors,[]);assert.deepEqual(report.errors,[]);report.final=unmounted.counts;report.status='passed';
 pass('Unmount releases the listener and late events cannot save another draft');
}catch(error){report.status='failed';report.errors.push(error.message);console.error(error);process.exitCode=1;}
finally{
 await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));
 await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log('Report: '+path.join(output,'report.json'));
}
