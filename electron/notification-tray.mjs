const clean=(value,max)=>String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max).replace(/&/g,'&&');
export function traySections(state){
 const tasks=new Map((state.tasks??[]).filter(t=>!t.archived).map(t=>[t.id,t])),projects=new Map((state.projects??[]).map(p=>[p.id,p.name])),events=new Map();
 for(const event of state.activityInbox??[])if(!event.readAt&&tasks.has(event.taskId)&&/^[a-f0-9]{64}$/.test(event.id)){const list=events.get(event.taskId)??[];if(!list.includes(event.id))list.push(event.id);events.set(event.taskId,list);}
 const row=t=>({taskId:t.id,label:`${clean(t.title||'New chat',64)} · ${clean(projects.get(t.projectId)||'Project',28)}`,activityIds:(events.get(t.id)??[]).slice(0,200)});
 const sorted=[...tasks.values()].sort((a,b)=>String(b.updatedAt??'').localeCompare(String(a.updatedAt??''))||a.id.localeCompare(b.id)),unread=sorted.filter(t=>events.has(t.id)),recent=sorted.filter(t=>!events.has(t.id));
 return{unread:unread.slice(0,20).map(row),recent:recent.slice(0,20).map(row),unreadCount:unread.length,unreadOmitted:Math.max(0,unread.length-20),recentOmitted:Math.max(0,recent.length-20)};
}
export function createNotificationTray({Tray,Menu,icon,getState,getBackground,onCommand,onBackground,onOpen,onQuit,onError=()=>{}}){
 const tray=new Tray(icon);let destroyed=false;
 const perform=fn=>()=>{try{Promise.resolve(fn()).catch(onError);}catch(error){onError(error);}};
 const chat=row=>({id:'chat:'+row.taskId,label:row.label,click:perform(()=>onCommand({type:'open-chat',taskId:row.taskId,activityIds:row.activityIds}))});
 const template=()=>{
  const rows=traySections(getState()),items=[{label:'Unread',enabled:false},...(rows.unread.length?rows.unread.slice(0,5).map(chat):[{label:'No unread chats',enabled:false}])];
  if(rows.unread.length>5)items.push({label:'More unread',submenu:rows.unread.slice(5).map(chat)});
  if(rows.unreadOmitted)items.push({label:`${rows.unreadOmitted} additional unread chats`,enabled:false});
  items.push({type:'separator'},{label:'Recent',enabled:false},...(rows.recent.length?rows.recent.slice(0,3).map(chat):[{label:'No recent chats',enabled:false}]));
  if(rows.recent.length>3)items.push({label:'More',submenu:rows.recent.slice(3).map(chat)});
  if(rows.recentOmitted)items.push({label:'Showing the latest 20 recent chats',enabled:false});
  items.push({type:'separator'},{label:'New Chat',click:perform(()=>onCommand({type:'new-chat'}))},{label:'Send Feedback',click:perform(()=>onCommand({type:'feedback'}))},{label:'Settings',submenu:[{label:'Notification settings…',click:perform(()=>onCommand({type:'settings'}))},{label:'Keep running in background',type:'checkbox',checked:getBackground().enabled===true,click:perform(()=>onBackground(!getBackground().enabled))}]},{type:'separator'},{label:'Open MuseBench',click:perform(onOpen)},{label:'Exit',click:perform(onQuit)});return items;
 };
 const refresh=state=>{if(destroyed)return;const value=state??getState(),visible=new Set((value.tasks??[]).filter(t=>!t.archived).map(t=>t.id)),unread=new Set(value.activityInbox?.filter(e=>!e.readAt&&visible.has(e.taskId)).map(e=>e.taskId)??[]);tray.setToolTip(unread.size?`MuseBench — ${unread.size} unread ${unread.size===1?'chat':'chats'}`:'MuseBench');};
 const popup=()=>{if(!destroyed)try{tray.popUpContextMenu(Menu.buildFromTemplate(template()));}catch(error){onError(error);}};
 tray.on('click',popup);tray.on('right-click',popup);tray.on('double-click',perform(onOpen));refresh();
 return{refresh,popup,destroy(){if(destroyed)return;destroyed=true;tray.destroy();}};
}
