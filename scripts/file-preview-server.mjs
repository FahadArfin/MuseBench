import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createFilePreview} from '../electron/file-preview.mjs';

// Preview uses isolated sample documents, never the installed profile or arbitrary host paths.
export function filePreviewPlugin(){return{name:'local-file-preview',async configureServer(server){
 await import('./build-file-viewer.mjs');
 const root=await mkdtemp(path.join(tmpdir(),'musebench-file-preview-'));
 const {createFilePreviewFixtures}=await import('./file-preview-fixtures.mjs');
 for(const [name,bytes] of await createFilePreviewFixtures()){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),bytes);}
 let taskId='preview';const state=()=>({activeProject:{id:'preview-files',root},task:{id:taskId,projectId:'preview-files',messages:[],changes:[]}});
 const preview=createFilePreview({getState:state,assetRoot:path.resolve('dist/file-viewer')});
 server.httpServer?.once('close',()=>{preview.close();void rm(root,{recursive:true,force:true});});
 server.middlewares.use(async(req,res,next)=>{
  const url=req.url??'';if(!url.startsWith('/__file-preview-'))return next();
  const origin='http://'+req.headers.host;
  try{
   if(url==='/__file-preview-command'&&req.method==='POST'){
    if(req.headers.origin&&req.headers.origin!==origin)throw Error('Preview request origin rejected.');
    let body='';for await(const chunk of req){body+=chunk;if(body.length>256000)throw Error('Preview request too large.');}
    const command=JSON.parse(body);if(typeof command.taskId!=='string'||command.taskId.length>200)throw Error('Invalid sample chat.');taskId=command.taskId;
    const result=await preview.command(command);
    if('rawUrl'in result){result.rawUrl=result.rawUrl.replace('musebench-files://file/',origin+'/__file-preview-file/');result.resourceBaseUrl=result.resourceBaseUrl.replace('musebench-files://file/',origin+'/__file-preview-file/');}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
   }
   const match=/^\/__file-preview-(assets|file)\/(.*)$/.exec(url);if(!match)throw Error('Unknown viewer resource.');
   const response=await preview.handle(new Request('musebench-files://'+match[1]+'/'+match[2],{method:req.method,headers:req.headers.range?{range:req.headers.range}:{}}));
   res.statusCode=response.status;for(const [key,value] of response.headers)res.setHeader(key,key==='content-security-policy'?value.replaceAll('musebench-files://assets',origin).replaceAll('musebench-files://file',origin).replaceAll('musebench-files:',origin):value);
   res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}
 });
}};}
