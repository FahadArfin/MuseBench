import test from 'node:test';
import assert from 'node:assert/strict';
import {readSiteSetup,saveSiteSetup,SITES_PUBLISHING_ENABLED} from '../src/ui/sites-local-setup.mjs';
const storage=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
test('frontend build starts without hosting or a publication claim',()=>{assert.equal(SITES_PUBLISHING_ENABLED,false);assert.deepEqual(readSiteSetup(storage(),'site-a').value,{audience:'private',domain:'',discoverable:false,versionId:''});});
test('publication preferences persist separately per site',()=>{const s=storage();saveSiteSetup(s,'site-a',{audience:'public',domain:'www.example.com',discoverable:true,versionId:'version-1'});assert.equal(readSiteSetup(s,'site-a').value.domain,'www.example.com');assert.equal(readSiteSetup(s,'site-b').value.domain,'');});
test('nonpublic plans cannot retain search discovery',()=>{const s=storage();saveSiteSetup(s,'site-a',{audience:'unlisted',domain:'',discoverable:true,versionId:''});assert.equal(readSiteSetup(s,'site-a').value.discoverable,false);});
test('corrupt storage recovers to defaults and invalid domains cannot be saved',()=>{const s={getItem:()=>'{broken'};assert.ok(readSiteSetup(s,'site-a').warning);assert.equal(readSiteSetup(s,'site-a').value.audience,'private');assert.throws(()=>saveSiteSetup(storage(),'site-a',{audience:'public',domain:'https://example.com/path',versionId:''}),/domain/i);});
test('blocked storage reports failed saving instead of success',()=>{const s={setItem:()=>{throw Error('Quota exceeded');}};assert.throws(()=>saveSiteSetup(s,'site-a',{audience:'private',domain:'',versionId:''}),/Quota/);assert.ok(readSiteSetup({getItem:()=>{throw Error('Blocked');}},'site-a').warning);});
