import {sidebarKey,sidebarSort} from './sidebar-order.mjs';

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
const sameOrder=(a,b)=>a===b||Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((id,i)=>id===b[i]);
function sameOrders(a,b){
 if(a===b)return true;
 const before=Object.keys(a??{}),after=Object.keys(b??{});
 return before.length===after.length&&before.every(key=>Object.hasOwn(b??{},key)&&sameOrder(a[key],b[key]));
}
export function sameSidebarData(a,b){return sameList(a.projects,b.projects,projectFields)&&sameList(a.tasks,b.tasks,taskFields)&&sameOrders(a.orders,b.orders);}
