import {sidebarKey,sidebarSort} from './sidebar-order.mjs';
import {mainChat} from './chat-relations.mjs';
/** Nest only usable side links. Organization order and independent collections stay flat. */
export function projectChatRelations(rows,tasks){
 const roots=[],children=new Map(),visible=new Set(rows.map(row=>row.id));
 for(const row of rows){const main=row.chatRelation?.kind==='side'?mainChat(row,tasks):row;
  if(main.id===row.id||!visible.has(main.id))roots.push(row);
  else{if(!children.has(main.id))children.set(main.id,[]);children.get(main.id).push(row);}
 }
 return{roots,children};
}

export function sidebarCollections(projects,tasks,orders){
 const byProject=new Map(projects.map(project=>[project.id,[]])),pinned=[],recents=[];
 const sorted=[...tasks].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 for(const task of sorted){
  if(task.archived)continue;
  byProject.get(task.projectId)?.push(task);
  (task.pinned?pinned:recents).push(task);
 }
 for(const [id,rows] of byProject)byProject.set(id,sidebarSort(rows,orders?.[sidebarKey('project',id)]));
 return{projects:sidebarSort(projects,orders?.projects),byProject,pinned:sidebarSort(pinned,orders?.pinned),recents:sidebarSort(recents,orders?.recents)};
}

// Keep this projection aligned with the sidebar and its chat action menu.
// Bridge snapshots are immutable; heavy project instructions are not UI data here.
const projectFields=['id','name','root'];
const taskFields=['id','projectId','title','mode','createdAt','updatedAt','acceptedRevision','pinned','archived','archivedAt','runtimeBusy','runtimeStatus'];
const sameList=(a,b,fields)=>a===b||a.length===b.length&&a.every((row,i)=>row===b[i]||fields.every(key=>row[key]===b[i][key]));
const relationFields=['kind','parentTaskId','parentTitle','context','createdAt','messageId'];
const sameRelations=(a,b)=>a===b||a.length===b.length&&a.every((row,i)=>row.chatRelation===b[i].chatRelation||relationFields.every(key=>row.chatRelation?.[key]===b[i].chatRelation?.[key]));
const sameOrder=(a,b)=>a===b||Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((id,i)=>id===b[i]);
function sameOrders(a,b){
 if(a===b)return true;
 const before=Object.keys(a??{}),after=Object.keys(b??{});
 return before.length===after.length&&before.every(key=>Object.hasOwn(b??{},key)&&sameOrder(a[key],b[key]));
}
export function sameSidebarData(a,b){return sameList(a.projects,b.projects,projectFields)&&sameList(a.tasks,b.tasks,taskFields)&&sameRelations(a.tasks,b.tasks)&&sameOrders(a.orders,b.orders);}
