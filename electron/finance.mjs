import {mkdir,open} from 'node:fs/promises';
import path from 'node:path';
import {createFinanceStore} from '../src/finance/store.mjs';
import {createFinanceService} from '../src/finance/service.mjs';
import {createFinanceQuestions} from '../src/finance/questions.mjs';
export async function createDesktopFinance({dataDir,workspaceRoot,safeStorage,dialog,shell,getWindow,onChange=()=>{},runtimeFactory}){
 let store,initialError=null;const protection={
  available:async()=>await safeStorage.isAsyncEncryptionAvailable()&&!['basic_text','plaintext'].includes(safeStorage.getSelectedStorageBackend?.()),
  encrypt:text=>safeStorage.encryptStringAsync(text),
  decrypt:async bytes=>{const decrypted=await safeStorage.decryptStringAsync(bytes);if(typeof decrypted?.result!=='string')throw Error('Protected finance data is unavailable.');return decrypted.result;},
 };
 try{store=await createFinanceStore({dir:dataDir,protection});}catch{initialError='Protected finance storage could not be opened. Existing data was preserved; check OS encryption and restore access before continuing.';store={available:false,read:()=>null,write:async()=>{throw Error(initialError);}};}
 const service=createFinanceService({store,openExternal:url=>shell.openExternal(url),onChange,initialError});
 const questions=createFinanceQuestions({workspaceRoot,runtimeFactory});let closed=false,importing=false;
 const snapshot=()=>({...service.snapshot(),questionBusy:questions.isBusy()});
 return{snapshot,isBusy:()=>importing||service.isBusy()||questions.isBusy(),async close(){closed=true;await Promise.all([service.close(),questions.close()]);},async command(input){
  if(closed)throw Error('Finance is closed.');
  if(input?.type==='stopAsk'){if(Object.keys(input).length!==1)throw Error('Invalid finance request.');await questions.stop();return{state:snapshot()};}
  if(input?.type==='ask'){
   if(Object.keys(input).some(k=>!['type','question','month','currency'].includes(k)))throw Error('Invalid finance question.');await mkdir(workspaceRoot,{recursive:true});if(importing||service.isBusy())throw Error('Wait for the current finance import or sync.');const summary=service.summary({month:input.month,currency:input.currency});const answer=await questions.ask(input.question,summary);return{state:snapshot(),answer};
  }
  if(input?.type==='importPreview'){
   if(Object.keys(input).some(k=>!['type','options'].includes(k))||!input.options||typeof input.options!=='object')throw Error('Invalid CSV import.');if(importing||service.isBusy()||questions.isBusy())throw Error('Wait for the current import, sync or finance question.');importing=true;
   try{const result=await dialog.showOpenDialog(getWindow(),{title:'Import finance transactions',properties:['openFile'],filters:[{name:'Transaction CSV',extensions:['csv']}]});if(result.canceled||!result.filePaths?.length)return{state:snapshot()};if(closed)throw Error('Finance is closed.');
    const filename=result.filePaths[0],handle=await open(filename,'r');let bytes;try{const info=await handle.stat();if(!info.isFile()||info.size>2*1024*1024)throw Error('Choose a CSV file up to 2 MiB.');const buffer=Buffer.alloc(info.size+1);let length=0;while(length<buffer.length){const part=await handle.read(buffer,length,buffer.length-length,null);if(!part.bytesRead)break;length+=part.bytesRead;}if(length!==info.size)throw Error('The CSV changed while reading. Choose it again.');bytes=buffer.subarray(0,length);}finally{await handle.close();}
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('Save the CSV as UTF-8 text before importing.');}
    return{state:snapshot(),preview:service.previewCsv(text,input.options,path.basename(filename))};
   }finally{importing=false;}
  }
  if((questions.isBusy()||importing)&&input?.type!=='state')throw Error('Finish the current import or finance question before changing its source data.');await service.command(input);return{state:snapshot()};
 }};
}
