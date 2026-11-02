import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createDesktopHelper} from '../electron/desktop-helper.mjs';

const helperPath=path.resolve('native/bin/MuseBenchDesktop.exe');
test('native desktop rejects OS, clipboard and unknown shortcuts before resolving a window', {skip:process.platform!=='win32'||!existsSync(helperPath)},async()=>{
 const helper=createDesktopHelper({helperPath});
 try{
  // Deliberately omit a window. A guard regression fails on identity resolution;
  // none of these requests can reach SendInput, even if the key guard regresses.
  for(const input of [
   {key:'Escape',modifiers:['Ctrl','Shift']},{key:'Escape',modifiers:['Ctrl']},
   {key:'Tab',modifiers:['Alt']},{key:'C',modifiers:['Ctrl']},{key:'X',modifiers:['Ctrl']},{key:'V',modifiers:['Ctrl']},
   {key:'Windows',modifiers:[]},{key:'F4',modifiers:['Alt']},{key:'L',modifiers:['Ctrl']},{key:'A',modifiers:['Ctrl','Ctrl']}
  ]){const result=await helper.call({op:'key',...input});assert.equal(result.ok,false);assert.equal(result.error.code,'invalid_request');assert.equal(result.uncertain,false);}
 }finally{await helper.close();}
});
test('desktop adapter terminates and reaps an actual native helper blocked on stdin',{skip:process.platform!=='win32'||!existsSync(helperPath)},async()=>{
 let child;
 const helper=createDesktopHelper({helperPath,timeoutMs:100,spawnProcess:(file,args,options)=>{
  child=spawn(file,args,options);
  // Withhold the JSON line so the real helper blocks before any desktop action.
  child.stdin.end=()=>child.stdin;return child;
 }});
 try{await assert.rejects(helper.call({op:'type'}),error=>error.code==='desktop_timeout'&&error.uncertain===true);assert.equal(child.killed,true);assert.notEqual(child.exitCode===null&&child.signalCode===null,true);assert.throws(()=>process.kill(child.pid,0));}finally{await helper.close();}
});
test('native desktop helper automatically exits when its fixed parent exits',{skip:process.platform!=='win32'||!existsSync(helperPath)},async()=>{
 const parent=spawn(process.execPath,['-e','setTimeout(()=>{},500)'],{windowsHide:true,stdio:'ignore'});let child;
 const helper=createDesktopHelper({helperPath,parentId:parent.pid,timeoutMs:3000,spawnProcess:(file,args,options)=>{child=spawn(file,args,options);child.stdin.end=()=>child.stdin;return child;}});
 try{await assert.rejects(helper.call({op:'apps'}),error=>error.code==='desktop_protocol'&&error.uncertain===false);assert.equal(child.killed,false);assert.equal(child.exitCode,0);}finally{await helper.close();if(parent.exitCode===null)parent.kill();}
});
