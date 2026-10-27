import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunNotifier,validateNotificationPreferences} from '../electron/notifications.mjs';
const prefs={completion:true,attention:true,sound:false};
const state=(id,status,task='chat')=>({task:{id:task,runs:[{id,status,prompt:'PRIVATE PROMPT'}]}});
function fixture(){const sent=[];let focused=false;const notify=createRunNotifier({isFocused:()=>focused,send:value=>sent.push(value)});return{notify,sent,focus:()=>{focused=true;}};}
test('notifications validate exact booleans and reject caller-supplied content',()=>{
 assert.deepEqual(validateNotificationPreferences(prefs),prefs);
 for(const p of [null,{},[],{...prefs,completion:'true'},{...prefs,title:'injected'}])assert.throws(()=>validateNotificationPreferences(p));
});
test('restored history and repeated updates do not notify; an observed run completes once',()=>{
 const {notify,sent}=fixture();notify.configure(prefs);
 notify.observe(state('old','completed'));assert.equal(sent.length,0);
 notify.observe(state('new','working'));notify.observe(state('new','completed'));notify.observe(state('new','completed'));
 assert.equal(sent.length,1);assert.equal(sent[0].silent,true);assert(!JSON.stringify(sent).includes('PRIVATE'));
 notify.observe(state('old','completed','other'));assert.equal(sent.length,1);
});
test('only enabled background events notify; waiting, failure, focus and sound are honored',()=>{
 const {notify,sent,focus}=fixture();notify.observe(state('a','working'));notify.observe(state('a','completed'));assert.equal(sent.length,0);
 notify.configure({...prefs,sound:true});notify.observe(state('b','working'));notify.observe(state('b','waiting'));notify.observe(state('b','waiting'));assert.equal(sent.length,1);assert.equal(sent[0].silent,false);
 notify.observe(state('b','failed'));assert.equal(sent.length,2);
 focus();notify.observe(state('c','working'));notify.observe(state('c','completed'));assert.equal(sent.length,2);
});
test('delivery failures do not interrupt controller updates or re-notify',()=>{
 let attempts=0;const notify=createRunNotifier({isFocused:()=>false,send:()=>{attempts++;throw Error('not supported');}});notify.configure(prefs);
 notify.observe(state('a','working'));assert.doesNotThrow(()=>notify.observe(state('a','completed')));notify.observe(state('a','completed'));assert.equal(attempts,1);
});

test('delivery receipts distinguish submission, OS visibility and failure without executing a run',()=>{
 const receipts=[];let callback;const notifier=createRunNotifier({isFocused:()=>false,report:(id,status)=>receipts.push([id,status]),send:(_options,receipt)=>{callback=receipt.delivery;}});notifier.configure({completion:true,attention:false,sound:false});notifier.observe({task:{id:'t',runs:[{id:'r',status:'working'}]}});notifier.observe({task:{id:'t',runs:[{id:'r',status:'completed'}]}});callback('shown');assert.deepEqual(receipts,[['r','submitted'],['r','shown']]);
});
