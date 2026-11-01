// Real dictation service, draft hook and shared composer; fictional speech helper only.
// This owns an isolated Chromium profile and never opens a microphone or contacts a provider.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {EventEmitter} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createDictation} from '../electron/dictation.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const output=path.resolve(process.argv[2]??path.join(root,'output/playwright/dictation-reliability'));
const source=`
import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useCodeDraft} from './src/ui/useCodeDraft.ts';
import {ChatComposer} from './src/ui/ChatComposer.tsx';
const listeners=new Set(),saves=[],errors=[],commands=[],completed=[],copied=[];let received=null,quotaFailure=false;
const originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(quotaFailure&&key==='musebench:dictation-recovery:v1')throw new DOMException('Fixture quota exhausted','QuotaExceededError');return originalSetItem.call(this,key,value);};
const idle={id:null,status:'idle',available:null,language:null,text:'',error:null};
window.musebench={
 saveCodeDraft:async value=>{if(value.text.length>16000)throw Error('Oversized draft');saves.push(structuredClone(value));},
 copyText:async text=>{copied.push(text);},
 dictation:async command=>{
  commands.push(command);const response=await fetch('/command',{method:'POST',body:JSON.stringify({command})});
  const result=await response.json();if(!response.ok)throw Error(result.error);completed.push(command);return result;
 },
 onDictation:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}
};
const stream=new EventSource('/events');stream.onmessage=event=>{received=JSON.parse(event.data);for(const listener of listeners)listener(received);};
function Fixture(){
 const [chat,setChat]=useState('a'),[visible,setVisible]=useState(true),inputRef=useRef(null);
 const draft=useCodeDraft(window.musebench,'project',chat,{},error=>errors.push(error));
 const noop=()=>{};
 return <><button onClick={()=>setChat(chat==='a'?'b':'a')}>Switch chat</button><button onClick={()=>setVisible(!visible)}>Show composer</button><output aria-label='Current chat'>{chat}</output>{visible&&<ChatComposer active={true} context={'project:'+chat} value={draft.message} onChange={draft.setMessage} inputRef={inputRef} onSubmit={()=>draft.setMessage('')} onChooseProject={noop} onStop={noop} onConnection={noop} onOptions={noop} options={{approval:'ask',reasoning:'high'}} taskMode='manual' onTaskMode={noop} messageMode='chat' onMessageMode={noop} showTask={true} busy={false} running={false} canSend={true} enterToSend={false} onContext={noop} onCommand={noop} onLoadSkills={noop} skills={[]} skillsStatus='' theme='dark' model='' images={[]} imageProjectId='project' onRemoveImage={noop} onAddImages={noop} uploadingImages={false} onRefreshModels={noop} onFullAccess={noop}/>}</>;
}
window.__dictationReliability={
 snapshot:()=>structuredClone({saves,errors,commands,completed,copied,received,listeners:listeners.size}),
 quotaFailure:value=>{quotaFailure=value;},
 emit:value=>{for(const listener of listeners)listener({...idle,...value});}
};
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const bundle=await build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,write:false,outfile:'bundle.js',format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
let releaseProbe,holdStopFailure=false,rejectStopReply=null,holdStartReply=false,releaseStartReply=null;
const probing=new Promise(resolve=>releaseProbe=resolve),children=[],streams=new Set(),events=[];
const service=createDictation({helperPath:'fixture-only-speech.exe',platform:'win32',probe:()=>probing,onState:state=>{events.push(state);for(const stream of streams)stream.write('data: '+JSON.stringify(state)+'\n\n');},spawnHelper:()=>{
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
 child.stdin={write(){queueMicrotask(()=>child.emit('close',0));}};child.kill=()=>{child.emit('close',1);return true;};children.push(child);return child;
}});
const server=createServer(async(request,response)=>{
 if(request.url==='/events'){response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});response.write(': ready\n\n');streams.add(response);request.once('close',()=>streams.delete(response));return;}
 if(request.url==='/command'){
  let raw='';for await(const chunk of request)raw+=chunk;
  try{const {command}=JSON.parse(raw),result=await service.dispatch(command);
   if(command==='stop'&&holdStopFailure){holdStopFailure=false;rejectStopReply=()=>{response.writeHead(400,{'Content-Type':'application/json'});response.end(JSON.stringify({error:'Fixture: delayed stop reply failed'}));rejectStopReply=null;};return;}
   const send=()=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(result));releaseStartReply=null;};
   if(command==='start'&&holdStartReply){holdStartReply=false;releaseStartReply=send;return;}send();}
  catch(error){response.writeHead(400,{'Content-Type':'application/json'});response.end(JSON.stringify({error:error.message}));}return;
 }
 const js=request.url==='/bundle.js',css=request.url==='/bundle.css';
 response.setHeader('Content-Type',js?'application/javascript':css?'text/css':'text/html');
 response.end(js?bundle.outputFiles.find(file=>file.path.endsWith('.js')).text:css?bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'':
  '<!doctype html><html><head><link rel="stylesheet" href="/bundle.css"><style>:root{--surface:#16191d;--surface-hover:#25292f;--muted:#a4abb5;--border:#464b56;--text:#fafafa;--accent:#e8b89a}body{background:#16191d;color:#fafafa;font:14px sans-serif;margin:20px}form{max-width:700px}textarea{display:block;box-sizing:border-box;width:100%;color:inherit;background:transparent;border:0;resize:vertical}button{color:inherit;background:transparent;border:0;cursor:pointer}.composer-toolbar{display:flex;align-items:center}.composer-spacer{flex:1}.sr-only{position:absolute;width:1px;height:1px;clip-path:inset(50%)}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
let browser,page;const report={checks:[],errors:[]};const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
try{
 await mkdir(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});const profile=await browser.newContext({viewport:{width:1000,height:760}});page=await profile.newPage();
 const origin='http://127.0.0.1:'+server.address().port;
 const prepare=async()=>{page.setDefaultTimeout(8000);await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());page.on('pageerror',error=>report.errors.push(error.message));await page.goto(origin);};
 await prepare();
 await page.waitForFunction(()=>window.__dictationReliability.snapshot().listeners===1);
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const snapshot=()=>page.evaluate(()=>window.__dictationReliability.snapshot());
 let input=page.getByRole('textbox',{name:'Message Muse',exact:true});
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.getByRole('button',{name:'Switch chat',exact:true}).click();
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 releaseProbe({available:true,language:'en-US'});
 await page.waitForFunction(()=>window.__dictationReliability.snapshot().commands.filter(command=>command==='start').length===2);
 await new Promise(resolve=>setTimeout(resolve,100));await settle();
 assert.equal(children.length,1,'Cancelled pending capture must never spawn a helper');
 assert.equal(service.snapshot().status,'starting','An obsolete start continuation must not cancel its replacement');
 const replacement=service.snapshot().id;children[0].stdout.emit('data',Buffer.from('{"kind":"listening"}\n{"kind":"text","text":"Replacement survives"}\n'));
 await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Message Muse"]').value==='Replacement survives');
 assert.equal(service.snapshot().id,replacement);pass('Cancelled probe start cannot cancel the replacement recording or write into the previous chat');
 await page.getByRole('button',{name:'Stop dictation',exact:true}).click();await page.getByRole('button',{name:'Start dictation',exact:true}).waitFor();
 await input.fill('x'.repeat(15994));await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.waitForFunction(()=>window.__dictationReliability.snapshot().completed.filter(command=>command==='start').length===3);await settle();
 const child=children.at(-1);child.stdout.emit('data',Buffer.from('{"kind":"listening"}\n{"kind":"text","text":"hello recover all extra speech"}\n'));
 await settle();
 assert.equal((await input.inputValue()).length,16000,'Speech insertion must respect the saved draft budget');
 assert.equal((await input.inputValue()).slice(-6),' hello');
 await page.getByRole('button',{name:'Stop dictation',exact:true}).click();await settle();
 let recovery=page.getByRole('textbox',{name:'Extra dictated text',exact:true});
 assert.equal(await recovery.inputValue(),' recover all extra speech');
 assert.equal(await page.getByRole('button',{name:'Add extra speech to message',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Copy extra speech',exact:true}).click();
 assert.equal((await snapshot()).copied.at(-1),' recover all extra speech');
 assert.equal((await snapshot()).errors.length,0);assert.ok((await snapshot()).saves.every(save=>save.text.length<=16000));
 pass('A near-limit draft remains savable and excess speech is selectable and copyable without truncation');
 await page.getByRole('button',{name:'Switch chat',exact:true}).click();await settle();assert.equal(await recovery.count(),0);
 assert.equal(await input.inputValue(),'');await page.getByRole('button',{name:'Switch chat',exact:true}).click();await settle();
 assert.equal(await recovery.inputValue(),' recover all extra speech');
 await page.getByRole('button',{name:'Show composer',exact:true}).click();await page.getByRole('button',{name:'Show composer',exact:true}).click();await settle();
 assert.equal(await recovery.inputValue(),' recover all extra speech');
 await input.fill('Next message:');await page.getByRole('button',{name:'Add extra speech to message',exact:true}).click();await settle();
 assert.equal(await input.inputValue(),'Next message: recover all extra speech');assert.equal(await recovery.count(),0);
 pass('Recovery stays with its chat through navigation and composer remount, then reinserts once after making room');
 await input.fill('x'.repeat(15998));await page.getByRole('button',{name:'Start dictation',exact:true}).click();await page.getByRole('button',{name:'Stop dictation',exact:true}).waitFor();
 await page.waitForFunction(()=>window.__dictationReliability.snapshot().completed.filter(command=>command==='start').length===4);await settle();
 children.at(-1).stdout.emit('data',Buffer.from('{"kind":"text","text":"😀 tail"}\n'));await settle();
 assert.equal((await input.inputValue()).length,15998,'Do not split a Unicode character to fill one remaining speech slot');
 await page.getByRole('button',{name:'Stop dictation',exact:true}).click();await settle();
 assert.equal(await recovery.inputValue(),'😀 tail');
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.screenshot({path:path.join(output,'narrow-recovery.png')});
 assert.equal(await recovery.evaluate(element=>element.getBoundingClientRect().right<=innerWidth),true);
 pass('Speech budgeting preserves Unicode characters and the recovery controls fit a narrow composer');
 await page.reload();await page.waitForFunction(()=>window.__dictationReliability.snapshot().listeners===1);await settle();
 await page.getByRole('button',{name:'Switch chat',exact:true}).click();await settle();
 assert.equal(await recovery.inputValue(),'😀 tail');
 pass('Renderer reload restores the retained speech only when its original chat is selected');
 await page.close();page=await profile.newPage();await prepare();await page.waitForFunction(()=>window.__dictationReliability.snapshot().listeners===1);await settle();
 input=page.getByRole('textbox',{name:'Message Muse',exact:true});recovery=page.getByRole('textbox',{name:'Extra dictated text',exact:true});
 assert.equal(await recovery.count(),0,'A newly opened window must not expose another chat recovery');
 await page.getByRole('button',{name:'Switch chat',exact:true}).click();await settle();
 assert.equal(await recovery.count(),1,'Destroying the old window must not discard its retained speech');
 assert.equal(await recovery.inputValue(),'😀 tail');
 pass('A destroyed and recreated window recovers the original chat suffix from the same profile');
 // Stop has completed in the native service, but its old renderer reply fails
 // only after navigation has created a replacement recording.
 let completedStarts=(await snapshot()).completed.filter(command=>command==='start').length;
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.waitForFunction(count=>window.__dictationReliability.snapshot().completed.filter(command=>command==='start').length===count,++completedStarts);await settle();
 holdStopFailure=true;await page.getByRole('button',{name:'Stop dictation',exact:true}).click();
 await page.getByRole('button',{name:'Start dictation',exact:true}).waitFor();assert.equal(typeof rejectStopReply,'function');
 await page.getByRole('button',{name:'Switch chat',exact:true}).click();await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.waitForFunction(count=>window.__dictationReliability.snapshot().completed.filter(command=>command==='start').length===count,++completedStarts);await settle();
 const afterStopReplacement=service.snapshot().id;rejectStopReply();await settle();
 assert.equal(service.snapshot().id,afterStopReplacement);assert.equal(service.snapshot().status,'starting','A rejected obsolete stop must not cancel a replacement capture');
 pass('A delayed obsolete stop failure cannot cancel the next chat recording');
 await page.getByRole('button',{name:'Stop dictation',exact:true}).click();await page.getByRole('button',{name:'Start dictation',exact:true}).waitFor();await input.fill('');
 // The real service can publish speech before the start IPC response reaches
 // React. Preserve those events until the response identifies their owner.
 holdStartReply=true;await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 const pendingDeadline=Date.now()+8000;while(!releaseStartReply&&Date.now()<pendingDeadline)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(typeof releaseStartReply,'function');
 children.at(-1).stdout.emit('data',Buffer.from('{"kind":"listening"}\n{"kind":"text","text":"Speech before the start reply"}\n'));
 await page.waitForFunction(()=>window.__dictationReliability.snapshot().received?.text==='Speech before the start reply');releaseStartReply();
 await page.waitForFunction(count=>window.__dictationReliability.snapshot().completed.filter(command=>command==='start').length===count,++completedStarts);await settle();
 assert.equal(await input.inputValue(),'Speech before the start reply');
 pass('Speech published before the start response is retained for its matching capture');
 await page.getByRole('button',{name:'Stop dictation',exact:true}).click();await page.getByRole('button',{name:'Start dictation',exact:true}).waitFor();await input.fill('x'.repeat(16000));
 await page.evaluate(()=>window.__dictationReliability.quotaFailure(true));await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.waitForFunction(count=>window.__dictationReliability.snapshot().completed.filter(command=>command==='start').length===count,++completedStarts);await settle();
 children.at(-1).stdout.emit('data',Buffer.from('{"kind":"text","text":"Unsaved quota suffix"}\n'));
 const warning=page.getByRole('alert').filter({hasText:'Copy it before closing this window'});await warning.waitFor();
 await page.getByRole('button',{name:'Start dictation',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Start dictation',exact:true}).isDisabled(),true);
 assert.equal(await recovery.inputValue(),'Unsaved quota suffix');await page.getByRole('button',{name:'Copy extra speech',exact:true}).click();assert.equal((await snapshot()).copied.at(-1),'Unsaved quota suffix');
 await page.getByRole('button',{name:'Retry saving extra speech',exact:true}).click();await settle();assert.equal(await warning.count(),1);
 await page.evaluate(()=>window.__dictationReliability.quotaFailure(false));await page.getByRole('button',{name:'Retry saving extra speech',exact:true}).click();await settle();
 assert.equal(await warning.count(),0);assert.equal(await page.getByRole('button',{name:'Start dictation',exact:true}).isEnabled(),true);
 await page.close();page=await profile.newPage();await prepare();await page.waitForFunction(()=>window.__dictationReliability.snapshot().listeners===1);await settle();
 input=page.getByRole('textbox',{name:'Message Muse',exact:true});recovery=page.getByRole('textbox',{name:'Extra dictated text',exact:true});
 assert.equal(await recovery.inputValue(),'Unsaved quota suffix');await page.getByRole('button',{name:'Switch chat',exact:true}).click();await settle();assert.equal(await recovery.inputValue(),'😀 tail');
 pass('Quota failure keeps selectable text, warns before close, blocks new recordings and retries without evicting another chat');
 const final=await snapshot();report.snapshot={saves:final.saves.length,errors:final.errors,commands:final.commands,completed:final.completed,copiedLengths:final.copied.map(text=>text.length),listeners:final.listeners};assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{
 releaseProbe?.({available:true,language:'en-US'});rejectStopReply?.();releaseStartReply?.();await browser?.close();for(const stream of streams)stream.end();await service.close();
 if(server.listening)await new Promise(resolve=>server.close(resolve));
 report.serviceEvents=events.map(({id,status,text})=>({id,status,textLength:text.length}));await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('Report: '+path.join(output,'report.json'));
}
