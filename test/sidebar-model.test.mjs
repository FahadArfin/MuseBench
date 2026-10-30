import test from 'node:test';
import assert from 'node:assert/strict';
import {sidebarCollections,sameSidebarData,projectChatRelations} from '../src/shared/sidebar-model.mjs';

const projects=[{id:'a',name:'Alpha',root:'/a'},{id:'b',name:'Beta',root:'/b'}];
const task=(id,projectId,extra={})=>({id,projectId,title:id,mode:'manual',createdAt:'2026-01-01',updatedAt:'2026-01-01',acceptedRevision:null,...extra});
test('sidebar collections preserve manual order, recent fallback and archived membership',()=>{
 const tasks=[task('old','a'),task('new','a',{updatedAt:'2026-01-02'}),task('pin','b',{pinned:true}),task('archived','b',{archived:true,pinned:true})];
 const value=sidebarCollections(projects,tasks,{projects:['b','a'],'project:a':['old'],recents:['old']});
 assert.deepEqual(value.projects.map(p=>p.id),['b','a']);assert.deepEqual(value.byProject.get('a').map(t=>t.id),['old','new']);assert.deepEqual(value.byProject.get('b').map(t=>t.id),['pin']);assert.deepEqual(value.pinned.map(t=>t.id),['pin']);assert.deepEqual(value.recents.map(t=>t.id),['old','new']);
 assert.equal(value.byProject.get('a')[0],tasks[0]);assert.equal(tasks[0].id,'old');
});
test('grouping reads project membership once per task instead of once per project',()=>{
 let reads=0;const many=Array.from({length:1000},(_,i)=>{const t=task(String(i),'a');Object.defineProperty(t,'projectId',{get(){reads++;return i%2?'a':'b';}});return t;});
 const value=sidebarCollections(projects,many);assert.equal(reads,1000);assert.equal(value.byProject.get('a').length,500);assert.equal(value.byProject.get('b').length,500);
});
test('equivalent copies ignore project instruction bodies but detect every sidebar task field',()=>{
 const before={projects:[{...projects[0],instructions:'old',lessons:[]}],tasks:[task('one','a')],orders:{projects:['a'],recents:['one']}};
 const clone=()=>structuredClone(before);const after=clone();after.projects[0].instructions='new';assert.equal(sameSidebarData(before,after),true);
 for(const [key,value] of Object.entries({id:'two',projectId:'b',title:'Renamed',mode:'muse',createdAt:'later',updatedAt:'later',acceptedRevision:'hash',pinned:true,archived:true,archivedAt:'now',runtimeBusy:true,runtimeStatus:'running'})){const changed=clone();changed.tasks[0][key]=value;assert.equal(sameSidebarData(before,changed),false,key);}
 for(const key of ['id','name','root']){const changed=clone();changed.projects[0][key]='changed';assert.equal(sameSidebarData(before,changed),false,key);}
 const changed=clone();changed.orders.recents=['two'];assert.equal(sameSidebarData(before,changed),false);delete changed.orders.recents;assert.equal(sameSidebarData(before,changed),false);
});
test('stable data never reads unrelated project payloads or scans unchanged array contents',()=>{
 const p={...projects[0]};Object.defineProperty(p,'instructions',{get(){throw Error('No heavy project payload reads');}});
 const before={projects:[p],tasks:[task('one','a')]};assert.equal(sameSidebarData(before,before),true);assert.equal(sameSidebarData(before,{projects:[{...projects[0]}],tasks:[task('one','a')]}),true);
});

const relation=(parentTaskId,kind='side')=>({kind,parentTaskId,parentTitle:'Main',context:kind==='side'?'fresh':'retained',createdAt:'2026-10-30T00:00:00Z'});
test('project relations nest sides once, keep forks top-level and promote unavailable parents',()=>{
 const main=task('main','a'),side=task('side','a',{chatRelation:relation('main')}),fork=task('fork','a',{chatRelation:relation('main','fork')}),orphan=task('orphan','a',{chatRelation:relation('missing')});
 const rows=[side,fork,orphan,main],view=projectChatRelations(rows,rows);
 assert.deepEqual(view.roots.map(t=>t.id),['fork','orphan','main']);assert.deepEqual(view.children.get('main').map(t=>t.id),['side']);
 for(const altered of [{...main,archived:true},{...main,projectId:'b'}]){const all=[side,fork,orphan,altered],visible=all.filter(t=>!t.archived&&t.projectId==='a');assert(projectChatRelations(visible,all).roots.some(t=>t.id==='side'));}
 const collection=sidebarCollections(projects,rows);assert.equal(collection.recents.length,4);assert.equal(collection.byProject.get('a').length,4);
});
test('relation projection flattens legacy side chains under the surviving main and rejects cycles',()=>{
 const main=task('main','a',{chatRelation:relation('gone','fork')}),side=task('side','a',{chatRelation:relation('main')}),sibling=task('sibling','a',{chatRelation:relation('side')});
 let all=[main,side,sibling],view=projectChatRelations(all,all);assert.deepEqual(view.roots.map(t=>t.id),['main']);assert.deepEqual(view.children.get('main').map(t=>t.id),['side','sibling']);
 all=[{...side,chatRelation:relation('sibling')},sibling];view=projectChatRelations(all,all);assert.equal(view.roots.length,2);
});
test('sidebar relation memo compares every primitive field and accepts equivalent cloned links',()=>{
 const before={projects,tasks:[task('side','a',{chatRelation:relation('main')})]};assert.equal(sameSidebarData(before,structuredClone(before)),true);
 for(const [key,value] of Object.entries({kind:'fork',parentTaskId:'another',parentTitle:'Renamed',context:'native',createdAt:'later',messageId:'answer'})){const after=structuredClone(before);after.tasks[0].chatRelation[key]=value;assert.equal(sameSidebarData(before,after),false,key);}
 const after=structuredClone(before);delete after.tasks[0].chatRelation;assert.equal(sameSidebarData(before,after),false);
});
for(const shape of ['direct','chain'])test(`large ${shape} side graph resolves all rows with linear field reads`,t=>{
 const count=3000,budget=count*25;let reads=0;
 const rows=Array.from({length:count},(_,i)=>{const row=task(String(i),'a',i?{chatRelation:relation(shape==='direct'?'0':String(i-1))}:{});for(const key of ['id','projectId','archived','chatRelation']){const value=row[key];Object.defineProperty(row,key,{get(){assert(++reads<=budget,`Ancestry must not repeatedly scan the graph (${reads} field reads)`);return value;}});}return row;});
 const started=performance.now(),view=projectChatRelations(rows,rows);assert.equal(view.roots.length,1);assert.equal(view.roots[0].id,'0');assert.equal(view.children.get('0').length,count-1);assert.equal(new Set(view.children.get('0').map(row=>row.id)).size,count-1);assert(reads<=budget);t.diagnostic(JSON.stringify({shape,count,fieldReads:reads,durationMs:performance.now()-started}));
});
