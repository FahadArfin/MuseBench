import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export async function preparePrompt(text){
 if(typeof text!=='string'||text.length>70000)throw Error('Native prompt exceeds the size limit.');
 if(text.length<=8000)return{args:['--',text],dispose:async()=>{}};
 // Unique OS temp directory, never a project path or a renderer-provided path.
 const directory=await mkdtemp(join(tmpdir(),'musebench-prompt-')),file=join(directory,'request.txt');
 const dispose=()=>rm(directory,{recursive:true,force:true,maxRetries:3});
 try{await writeFile(file,text,{encoding:'utf8',flag:'wx',mode:0o600});return{args:['--prompt-file',file],dispose};}
 catch(error){await dispose();throw error;}
}
