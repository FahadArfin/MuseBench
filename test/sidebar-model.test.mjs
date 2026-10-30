import test from 'node:test';
import assert from 'node:assert/strict';
import {sidebarCollections,sameSidebarData} from '../src/shared/sidebar-model.mjs';

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
