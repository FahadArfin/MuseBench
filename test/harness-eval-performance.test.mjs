import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeSamples,correlatePaints,parseOptions} from '../scripts/renderer-performance.mjs';

test('latency summaries preserve absent paint samples and report nearest-rank percentiles',()=>{
 assert.deepEqual(summarizeSamples([10,20,null,40]),{count:3,missing:1,min:10,p50:20,p95:40,max:40,mean:70/3});
 assert.deepEqual(summarizeSamples([null]),{count:0,missing:1,min:null,p50:null,p95:null,max:null,mean:null});
 assert.throws(()=>summarizeSamples([NaN]),/finite/);
});
test('trace correlation excludes unrelated threads and paints before the DOM mutation',()=>{
 const trace=[{name:'probe-0:start',ts:1000,pid:1,tid:2},{name:'probe-0:dom',ts:3000,pid:1,tid:2},{name:'Paint',ts:2000,pid:1,tid:2},{name:'Paint',ts:3100,pid:1,tid:3},{name:'Paint',ts:5000,pid:1,tid:2},{name:'probe-0:end',ts:8000,pid:1,tid:2}];
 assert.deepEqual(correlatePaints(trace,['probe-0','probe-1']),[{id:'probe-0',eventToPaintMs:4,domToPaintMs:2},{id:'probe-1',eventToPaintMs:null,domToPaintMs:null}]);
 assert.equal(correlatePaints(trace.filter(e=>e.name!=='Paint'),['probe-0'])[0].eventToPaintMs,null);
});
test('renderer CLI rejects excessive workloads and arbitrary external URLs',()=>{
 assert.equal(parseOptions([]).samples,12);
 for(const args of [['--samples','0'],['--samples','501'],['--url','https://example.com'],['--turns','0'],['--turns','50001'],['--samples','NaN']])assert.throws(()=>parseOptions(args));
 assert.deepEqual(parseOptions(['--turns','20,100','--samples','4']).turns,[20,100]);
});
test('renderer mode defaults to browser and requires the explicit production Electron choice',()=>{
 assert.equal(parseOptions([]).renderer,'browser');
 assert.equal(parseOptions(['--renderer','electron-production']).renderer,'electron-production');
 assert.throws(()=>parseOptions(['--renderer','running-desktop']),/renderer/i);
 assert.throws(()=>parseOptions(['--renderer','electron-production','--samples','101']));
});
