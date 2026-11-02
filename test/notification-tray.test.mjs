import test from 'node:test';import assert from 'node:assert/strict';
const {traySections,createNotificationTray}=await import('../electron/notification-tray.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const {createTrayNavigation}=await import('../electron/tray-navigation.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const state=()=>({projects:[{id:'p',name:'Project & one'}],tasks:[{id:'a',projectId:'p',title:'Chat & one',updatedAt:'2026-11-02T03:00:00Z'},{id:'b',projectId:'p',title:'Recent chat',updatedAt:'2026-11-02T04:00:00Z'},{id:'gone',projectId:'p',title:'Archived',archived:true,updatedAt:'2026-11-02T05:00:00Z'}],activityInbox:[{id:'1'.repeat(64),taskId:'a',readAt:null,at:'2026-11-02T03:00:00Z'},{id:'2'.repeat(64),taskId:'a',readAt:null,at:'2026-11-02T02:00:00Z'},{id:'3'.repeat(64),taskId:'gone',readAt:null,at:'2026-11-02T05:00:00Z'}]});
test('tray groups unread chats once, binds captured IDs and keeps archived/deleted chats out',()=>{
 const s=state(),rows=traySections(s);assert.deepEqual(rows.unread.map(x=>x.taskId),['a']);assert.deepEqual(rows.unread[0].activityIds,['1'.repeat(64),'2'.repeat(64)]);assert.deepEqual(rows.recent.map(x=>x.taskId),['b']);assert.equal(rows.unread[0].label,'Chat && one · Project && one');assert.equal(s.activityInbox[0].readAt,null);
 s.tasks=[];assert.deepEqual(traySections(s).unread,[]);
});
test('native tray opens a freshly built menu on either mouse button and never marks read on open',()=>{
 let menu,lastTemplate,commands=[],quit=0,destroyed=0;const handlers={};class Tray{on(n,f){handlers[n]=f;}setToolTip(t){this.tip=t;}popUpContextMenu(m){menu=m;}destroy(){destroyed++;}isDestroyed(){return false;}}
 const tray=createNotificationTray({Tray,Menu:{buildFromTemplate(t){lastTemplate=t;return{items:t};}},icon:'icon',getState:state,getBackground:()=>({enabled:false}),onCommand:a=>commands.push(a),onBackground:()=>{},onOpen:()=>{},onQuit:()=>quit++});
 handlers.click();assert.ok(menu);assert.deepEqual(commands,[]);assert.equal(lastTemplate[0].label,'Unread');lastTemplate.find(x=>x.id==='chat:a').click();assert.deepEqual(commands[0],{type:'open-chat',taskId:'a',activityIds:['1'.repeat(64),'2'.repeat(64)]});handlers['right-click']();lastTemplate.find(x=>x.label==='Exit').click();assert.equal(quit,1);assert.ok(lastTemplate.find(x=>x.label==='Settings').submenu.some(x=>x.label==='Notification settings…'));tray.destroy();assert.equal(destroyed,1);
});
test('tray More menus are bounded and do not include prompt contents',()=>{
 const s=state();s.tasks=Array.from({length:100},(_,i)=>({id:'t'+i,projectId:'p',title:'Chat '+i,updatedAt:String(i).padStart(4,'0'),request:'PRIVATE_PROMPT'}));s.activityInbox=[];const rows=traySections(s);assert.equal(rows.recent.length,20);assert.equal(rows.recentOmitted,80);assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_PROMPT/);
});
test('tray commands wait for a ready renderer and keep one follow-up while acknowledgement is pending',async()=>{
 const sent=[];let opens=0;const nav=createTrayNavigation({openWindow:async()=>{opens++;},send:t=>sent.push(t),onFailure:()=>{}});
 await nav.request({type:'new-chat'});assert.equal(sent.length,0);nav.ready();assert.equal(sent[0].command.type,'new-chat');await nav.request({type:'feedback'});assert.equal(sent.length,1);nav.ack({id:sent[0].id,handled:true});assert.equal(sent[1].command.type,'feedback');assert.equal(nav.ack({id:'stale',handled:true}),false);nav.detach();nav.ready();assert.equal(sent[2].id,sent[1].id);nav.ack({id:sent[1].id,handled:true});assert.equal(opens,2);nav.close();
});
test('failed reopen or refused navigation never silently retries or marks activity read',async()=>{
 let failures=0;const nav=createTrayNavigation({openWindow:async()=>{throw Error('closed');},send:()=>assert.fail(),onFailure:()=>failures++});await nav.request({type:'settings'});nav.ready();assert.equal(failures,1);nav.close();await assert.rejects(nav.request({type:'new-chat'}),/closing/i);
});
test('a newer click after renderer detach supersedes both undelivered actions',async()=>{
 const sent=[];const nav=createTrayNavigation({openWindow:async()=>{},send:t=>sent.push(t)});
 nav.ready();await nav.request({type:'new-chat'});await nav.request({type:'feedback'});
 nav.detach();await nav.request({type:'settings'});nav.ready();assert.deepEqual(sent.map(t=>t.command.type),['new-chat','settings']);
 assert.equal(nav.ack({id:sent[0].id,handled:true}),false);nav.ack({id:sent[1].id,handled:true});
 assert.deepEqual(sent.map(t=>t.command.type),['new-chat','settings']);nav.close();
});
