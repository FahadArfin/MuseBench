import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinanceQuestions} from '../src/finance/questions.mjs';
test('explicit questions use tool-free native mode and bounded supplied summary only',async()=>{
 let listener,request,disconnected=false;const owner=createFinanceQuestions({workspaceRoot:'C:\\fixture',runtimeFactory:()=>({subscribe:fn=>{listener=fn;return()=>{};},connect:async()=>{},send:async input=>{request=input;listener({status:'completed',messages:[{kind:'agentMessage',text:'Your calculated spending is $25.'}]});},disconnect:async()=>{disconnected=true;},snapshot:()=>({})})});
 const answer=await owner.ask('What did I spend?',{currency:'USD',spending:2500});assert.match(answer,/\$25/);assert.equal(request.mode,'prediction');assert.match(request.text,/2500/);assert.equal(disconnected,true);assert.equal(owner.isBusy(),false);
});
test('Stop during connection prevents a late model request',async()=>{
 let release,send=0;const owner=createFinanceQuestions({workspaceRoot:'C:\\fixture',runtimeFactory:()=>({subscribe:()=>()=>{},connect:()=>new Promise(resolve=>release=resolve),send:async()=>{send++;},disconnect:async()=>{},snapshot:()=>({})})});
 const answer=owner.ask('Spending?',{currency:'USD'});await new Promise(resolve=>setTimeout(resolve,0));await owner.stop();release();await assert.rejects(answer,/Stopped/);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(send,0);
});
