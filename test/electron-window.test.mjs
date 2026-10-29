import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForDesktopRenderer} from '../scripts/electron-window.mjs';

const page=(url,closed=false)=>({url:()=>url,isClosed:()=>closed});
test('desktop checks select the local shell even when a preloaded website appears first',async()=>{
 const shell=page('file:///D:/fixture/resources/app.asar/dist/index.html');
 const windows=[page('https://www.meta.ai/'),page('about:blank'),page('https://untrusted.example/dist/index.html'),page('file:///old/dist/index.html',true),shell];
 assert.equal(await waitForDesktopRenderer({windows:()=>windows}),shell);
});
test('desktop checks wait for the shell document rather than accepting an empty window',async()=>{
 let reads=0;const shell=page('file:///C:/fixture/dist/index.html?fixture=1');
 assert.equal(await waitForDesktopRenderer({windows:()=>++reads===1?[page('about:blank')]:[shell]},{interval:1}),shell);
});
test('desktop checks fail explicitly when the local shell never opens',async()=>{
 await assert.rejects(waitForDesktopRenderer({windows:()=>[page('https://www.meta.ai/')]},{timeout:0}),/Local desktop renderer did not open/);
});
