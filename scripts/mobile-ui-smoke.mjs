import {chromium} from 'playwright';
import {preview} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts/mobile-ui',{recursive:true});
const server=await preview({configFile:'vite.mobile.config.ts',preview:{host:'127.0.0.1',port:43198,strictPort:true}});
const browser=await chromium.launch();const checks=[];
try {
 for(const [name,viewport] of [['phone',{width:390,height:844}],['tablet',{width:1024,height:900}]]) {
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Explicit native-boundary fixture. TLS and Keystore are tested in the APK.
  await page.addInitScript(()=>{
   window.fixture={paired:false,commands:[],selected:'chat-one',receipts:[],older:0,failChat:false,failCommand:false};
   const chats=[{id:'chat-one',projectId:'project',title:'Polish the app',busy:false,status:'idle'},{id:'chat-two',projectId:'project',title:'Fix the tests',busy:false,status:'idle'}];
   window.MuseMobile={onmessage:null,postMessage(text){const {id,method,input}=JSON.parse(text);let value;
    if(method==='chat'&&window.fixture.failChat){setTimeout(()=>window.MuseMobile.onmessage?.({data:JSON.stringify({id,ok:false,error:'Chat is unavailable.'})}),20);return;}
    if(method==='connection')value={paired:window.fixture.paired};
    else if(method==='pair'){window.fixture.paired=true;value={paired:true,name:'Test desktop'};}
    else if(method==='state')value={name:'Test desktop',selectedTaskId:window.fixture.selected,chats,projects:[{id:'project',name:'MuseBench'}],needsAttention:false,receipts:window.fixture.receipts};
    else if(method==='chat'){if(input.before)window.fixture.older++;value={taskId:input.taskId,title:chats.find(c=>c.id===input.taskId).title,before:input.before?null:'message-1',messages:input.before?[{id:'message-0',role:'user',text:'Earlier request'}]:[{id:'message-1',role:'assistant',text:'Ready to continue your desktop work.'}]};}
    else if(method==='command'){window.fixture.commands.push(input);if(window.fixture.failCommand)window.fixture.receipts.push({requestId:input.requestId,status:'failed',error:'Finish the current desktop setup first.'});else if(input.kind==='select')window.fixture.selected=input.taskId;value={status:'pending',requestId:input.requestId};}
    else if(method==='forget'){window.fixture.paired=false;value=true;}
    setTimeout(()=>window.MuseMobile.onmessage?.({data:JSON.stringify({id,ok:true,value})}),20);
   }};
  });
  await page.goto('http://127.0.0.1:43198');
  await page.getByRole('heading',{name:'What’s on your mind?'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`artifacts/mobile-ui/${name}-chat.png`});
  await page.getByRole('button',{name:'Code',exact:true}).click();
  await page.getByRole('heading',{name:'Your desktop, within reach.'}).waitFor();
  await page.getByLabel('Or paste a pairing link').fill('musebench://pair?data=explicit-ui-fixture');
  await page.getByRole('button',{name:'Pair desktop',exact:true}).click();
  await page.getByRole('button',{name:/Polish the app/}).click();
  await page.getByText('Ready to continue your desktop work.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Load earlier messages'}).click();
  await page.getByText('Earlier request',{exact:true}).waitFor();
  await page.waitForTimeout(2800); // Let a real poll refresh the tail after pagination.
  assert.equal(await page.getByRole('button',{name:'Load earlier messages'}).count(),0);
  await page.getByRole('textbox',{name:'Message your desktop'}).fill('Continue from this device');
  await page.getByRole('button',{name:'Send to desktop'}).click();
  await page.getByText('Waiting for desktop confirmation…',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Send to desktop'}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.fixture.commands.filter(c=>c.kind==='send').length),1);
  await page.evaluate(()=>{window.fixture.receipts=window.fixture.commands.map(c=>({requestId:c.requestId,status:'completed'}));});
  await page.waitForFunction(()=>!localStorage.getItem('muse-mobile-pending'));
  assert.equal(await page.getByRole('textbox',{name:'Message your desktop'}).inputValue(),'');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`artifacts/mobile-ui/${name}-code.png`});
  await page.getByRole('button',{name:'Back to chats'}).click();
  await page.evaluate(()=>{window.fixture.failChat=true;});
  await page.getByRole('button',{name:/Fix the tests/}).click();
  await page.getByRole('alert').getByText('Chat is unavailable.').waitFor();
  assert.equal(await page.getByRole('button',{name:/Fix the tests/}).isVisible(),true,'failed initial read must keep the chat list reachable');
  await page.evaluate(()=>{window.fixture.failChat=false;window.fixture.failCommand=true;});
  await page.getByRole('button',{name:/Fix the tests/}).click();
  await page.getByRole('button',{name:'Open on desktop',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Send to desktop'}).count(),0);
  await page.getByRole('button',{name:'Open on desktop',exact:true}).click();
  await page.getByRole('alert').getByText('Finish the current desktop setup first.').waitFor();
  await page.getByRole('button',{name:'Dismiss notification'}).click();
  await page.evaluate(()=>{window.fixture.failCommand=false;});
  await page.getByRole('button',{name:'Open on desktop',exact:true}).click();
  await page.getByRole('textbox',{name:'Message your desktop'}).waitFor();
  await page.evaluate(()=>{window.fixture.receipts=window.fixture.commands.map(c=>({requestId:c.requestId,status:'completed'}));});
  await page.waitForFunction(()=>!localStorage.getItem('muse-mobile-pending'));
  await page.getByRole('textbox',{name:'Message your desktop'}).fill('Uncertain request');
  await page.getByRole('button',{name:'Send to desktop'}).click();
  await page.evaluate(()=>{const last=window.fixture.commands.at(-1);window.fixture.receipts.push({requestId:last.requestId,status:'unknown'});});
  await page.getByRole('alert').getByText(/unknown outcome/).waitFor();
  await page.waitForTimeout(2800);
  assert.ok(await page.evaluate(()=>localStorage.getItem('muse-mobile-pending')),'unknown outcome retains duplicate protection across polls');
  assert.equal(await page.getByRole('button',{name:'Send to desktop'}).isDisabled(),true);
  await page.getByRole('button',{name:'I checked the desktop'}).click();
  assert.deepEqual(errors,[]);checks.push(`${name}: independent Chat entry, pairing, transcript paging across polls, acknowledged send, duplicate prevention, explicit desktop selection, no overflow`);
  await page.close();
 }
 await writeFile('artifacts/mobile-ui/report.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks}));
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
