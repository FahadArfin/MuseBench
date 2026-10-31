import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
test('four annotated attachments retain originals while owned and release all eight files when removed',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-image-annotations-'));let c;
 try{
  const project=path.join(root,'Project');await mkdir(project);c=await createController({dataDir:path.join(root,'profile')});const opened=await c.dispatch({type:'openProject',path:project}),projectId=opened.activeProject.id,owner={projectId,taskId:null};
  const imported=async label=>c.importImage({...owner,name:label+'.png',dataUrl:'data:image/png;base64,'+Buffer.concat([png,Buffer.from(label)]).toString('base64')});
  const originals=[],images=[];
  for(let i=0;i<4;i++){const source=await imported('source'+i);originals.push(source);await c.saveCodeDraft({...owner,text:'Review',files:[],images:[...originals],mode:'chat'});}
  for(let i=0;i<4;i++)images.push({...await imported('composite'+i),annotation:{source:originals[i],marks:[{kind:'comment',x:.5,y:.5,text:'Change this'}]}});
  await c.saveCodeDraft({...owner,text:'Review',files:[],images,mode:'chat'});
  for(const image of originals)assert.match(await c.readImage({projectId,image}),/^data:image\/png/);
  await c.saveCodeDraft({...owner,text:'',files:[],images:[],mode:'chat'});
  for(const image of [...originals,...images])await assert.rejects(c.readImage({projectId,image}),/unavailable/);
 }finally{await c?.close();await rm(root,{recursive:true,force:true});}
});
