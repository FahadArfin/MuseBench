import {parentPort,workerData} from 'node:worker_threads';
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {open,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Fragment even a single 256 MiB line before materializing review rows. The
// worker never sends file contents through parentPort: only spool metadata.
async function* fragments(stream){
 const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});let pending='',continued=false;
 for await(const chunk of stream){pending+=decoder.decode(chunk,{stream:true});
  while(pending.length){const end=pending.indexOf('\n');if(end>=0&&end<=8192){yield{text:pending.slice(0,end),continued,ending:true};pending=pending.slice(end+1);continued=false;}else if(pending.length>8192){let size=8192;const code=pending.charCodeAt(size-1);if(code>=0xd800&&code<=0xdbff)size--;yield{text:pending.slice(0,size),continued,ending:false};pending=pending.slice(size);continued=true;}else break;}
 }
 pending+=decoder.decode();if(pending.length)yield{text:pending,continued,ending:true,noNewline:true};
}

async function build(){
 const {directory,equal}=workerData,spool=await open(path.join(directory,'rows'),'wx');let child,timer,bytes=0,pending='',pendingBytes=0,totalRows=0,additions=0,deletions=0;const checkpoints=[];
 const writeRow=async row=>{const line=JSON.stringify(row)+'\n',length=Buffer.byteLength(line);if(bytes+length>1024**3)throw Error('This comparison exceeds the 1 GiB review spool limit.');if(totalRows%128===0)checkpoints.push({row:totalRows,offset:bytes});bytes+=length;totalRows++;pending+=line;pendingBytes+=length;if(pendingBytes>=65536){await spool.writeFile(pending);pending='';pendingBytes=0;}};
 // Git's missing-newline marker follows the content row. Retain one bounded
 // fragment until the next row so the final fragment can carry that marker.
 let lastRow;const emit=async row=>{if(lastRow)await writeRow(lastRow);lastRow=row;};
 parentPort.on('message',message=>{if(message==='cancel')child?.kill();});
 try{
  if(equal){let line=1;for await(const fragment of fragments(createReadStream(path.join(directory,'after')))){await emit({...fragment,kind:'context',oldLine:line,newLine:line});if(fragment.ending)line++;}}
  else{
   // Ignore inherited Git config/environment. No repository, shell, attributes,
   // external diff, textconv, pager, user arguments or source paths are used.
   const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/^GIT_/i.test(name)));Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:path.join(directory,'empty-config'),GIT_CEILING_DIRECTORIES:directory,GIT_ATTR_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_PAGER:'cat',LC_ALL:'C'});await writeFile(env.GIT_CONFIG_GLOBAL,'');
   child=spawn('git',['--no-pager','-c','core.autocrlf=false','-c','core.safecrlf=false','diff','--no-index','--no-ext-diff','--no-textconv','--text','--no-color','--no-renames','--diff-algorithm=myers','--unified=3','--','before','after'],{cwd:directory,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
   let stderr='',timedOut=false;child.stderr.on('data',chunk=>{if(stderr.length<4000)stderr+=chunk.toString().slice(0,4000-stderr.length);});
   const outcome=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});outcome.catch(()=>{});timer=setTimeout(()=>{timedOut=true;child.kill();},90000);timer.unref();
   let oldLine=0,newLine=0,inHunk=false,kind=null;
   for await(const fragment of fragments(child.stdout)){
    if(!fragment.continued&&fragment.text==='\\ No newline at end of file'){if(lastRow)lastRow.noNewline=true;continue;}
    if(!fragment.continued){
     const header=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(fragment.text);
     if(header){oldLine=Number(header[1]);newLine=Number(header[2]);inHunk=true;kind='hunk';}
     else if(inHunk&&fragment.text.startsWith('+')){kind='added';additions++;}
     else if(inHunk&&fragment.text.startsWith('-')){kind='removed';deletions++;}
     else if(inHunk&&fragment.text.startsWith(' '))kind='context';else kind=null;
    }
    if(!kind)continue;
    await emit({...fragment,text:kind==='hunk'||fragment.continued?fragment.text:fragment.text.slice(1),kind,oldLine:kind==='added'||kind==='hunk'?null:oldLine,newLine:kind==='removed'||kind==='hunk'?null:newLine});
    if(fragment.ending&&kind!=='hunk'){if(kind!=='added')oldLine++;if(kind!=='removed')newLine++;}
   }
   const result=await outcome;if(timedOut)throw Error('The comparison exceeded 90 seconds.');if(result.code!==0&&result.code!==1)throw Error('Git text comparison is unavailable'+(stderr?': '+stderr.trim():'.'));
  }
  if(lastRow)await writeRow(lastRow);if(pending)await spool.writeFile(pending);return{totalRows,additions,deletions,checkpoints};
 }finally{clearTimeout(timer);child?.kill();await spool.close();}
}
build().then(result=>{parentPort.postMessage({result});parentPort.close();},error=>{parentPort.postMessage({error:String(error.message).slice(0,500)});parentPort.close();});
