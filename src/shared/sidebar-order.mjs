export function validateSidebarMove(action) {
  const id=value=>typeof value==='string'&&value.length>0&&value.length<=200;
  if(!action||!['project','chat'].includes(action.kind)||!id(action.id)||!['projects','project','pinned','recents'].includes(action.section)||action.beforeId!=null&&!id(action.beforeId)||action.kind==='project'&&action.section!=='projects'||action.kind==='chat'&&action.section==='projects'||action.section==='project'&&!id(action.projectId))throw Error('Invalid sidebar move.');
}
export function sidebarKey(section,projectId){return section==='project'?`project:${projectId}`:section;}
export function sidebarSort(items,order=[]) {
  const ranks=new Map((Array.isArray(order)?order:[]).map((id,index)=>[id,index]));
  return [...items].sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));
}
export function planSidebarMove(projects,tasks,orders,action){
  validateSidebarMove(action);
  const target=(action.kind==='project'?projects:tasks).find(item=>item.id===action.id);
  if(!target||target.archived)throw Error('Sidebar item is unavailable.');
  if(action.section==='project'&&!projects.some(p=>p.id===action.projectId))throw Error('Project not found.');
  const key=sidebarKey(action.section,action.projectId);
  const members=action.kind==='project'?projects:[...tasks].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).filter(t=>!t.archived&&(action.section==='project'?t.projectId===action.projectId:action.section==='pinned'?t.pinned:!t.pinned));
  if(action.beforeId===action.id)return {orders:orders??{},target};
  if(action.beforeId&&!members.some(t=>t.id===action.beforeId))throw Error('Drop position is unavailable.');
  const ids=sidebarSort(members,orders?.[key]).map(t=>t.id).filter(id=>id!==action.id);
  ids.splice(action.beforeId?ids.indexOf(action.beforeId):ids.length,0,action.id);
  const next={...(orders??{}),[key]:ids};
  // Remove stale source positions when moving between collections.
  if(action.kind==='chat')for(const other of Object.keys(next)){
    if(other!==key&&(action.section==='project'&&other.startsWith('project:')||action.section==='pinned'&&other==='recents'||action.section==='recents'&&other==='pinned'))next[other]=next[other].filter(id=>id!==action.id);
  }
  return {orders:next,target};
}
