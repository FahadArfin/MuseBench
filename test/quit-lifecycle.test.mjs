import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuitLifecycle} from '../electron/quit-lifecycle.mjs';

test('a shutdown failure cannot silently exit and a later confirmed retry can finish',async()=>{
 let attempts=0,quits=0,notices=0;
 const lifecycle=createQuitLifecycle({close:async()=>{if(++attempts===1)throw Error('Unconfirmed process');},quit:()=>quits++,onFailure:async()=>{notices++;return 'keep';}});
 assert.equal(await lifecycle.request(),false);assert.equal(quits,0);assert.equal(lifecycle.confirmed(),false);assert.equal(notices,1);
 assert.equal(await lifecycle.request(),true);assert.equal(quits,1);assert.equal(lifecycle.confirmed(),true);
});

test('concurrent quits share cleanup and force quit requires an explicit failure response',async()=>{
 let release,quits=0;
 const lifecycle=createQuitLifecycle({close:()=>new Promise((resolve,reject)=>{release=()=>reject(Error('Unconfirmed'));}),quit:()=>quits++,onFailure:async()=> 'force'});
 const first=lifecycle.request(),second=lifecycle.request();assert.equal(first,second);await Promise.resolve();release();
 assert.equal(await first,true);assert.equal(quits,1);assert.equal(lifecycle.confirmed(),true);
});

test('dismissed or failed error dialog retains the unconfirmed owner',async()=>{
 const lifecycle=createQuitLifecycle({close:async()=>{throw Error('Unconfirmed');},quit:()=>assert.fail('must not quit'),onFailure:async()=>{throw Error('Dialog unavailable');}});
 assert.equal(await lifecycle.request(),false);assert.equal(lifecycle.confirmed(),false);
});
