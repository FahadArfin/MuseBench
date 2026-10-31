import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const motion=await import('../scripts/startup-motion-analysis.mjs').catch(()=>({}));
const retained=JSON.parse(await readFile(new URL('./fixtures/startup-ci-moving.json',import.meta.url),'utf8'));
test('retained CI flight gap is inadequate evidence for quarter-time easing',()=>{
 assert.equal(typeof motion.analyzeFlightSampling,'function','sampling analysis exists');
 const value=motion.analyzeFlightSampling(retained.moving,retained.centeredX);
 assert.equal(value.adequate,false);assert.ok(value.maxGapMs>329&&value.maxGapMs<330);assert.ok(value.quarter.sampleErrorMs>140);assert.ok(value.quarter.progress<.01);
});
test('regular observations remain eligible for unchanged quarter/middle/deceleration checks',()=>{
 assert.equal(typeof motion.analyzeFlightSampling,'function');
 const moving=Array.from({length:51},(_,i)=>({at:i*15,mark:{x:400-390*(i/50)}}));
 const value=motion.analyzeFlightSampling(moving,400);assert.equal(value.adequate,true);assert.equal(value.maxGapMs,15);
});
test('curve validation rejects linear and ease-out while preserving approved bounds',()=>{
 assert.equal(typeof motion.assertFlightCurve,'function');
 assert.doesNotThrow(()=>motion.assertFlightCurve({quarter:.0956,middle:.6973,threeQuarter:.977}));
 assert.throws(()=>motion.assertFlightCurve({quarter:.25,middle:.5,threeQuarter:.75}),/accelerates gently/);
 assert.throws(()=>motion.assertFlightCurve({quarter:.38,middle:.68,threeQuarter:.91}),/accelerates gently/);
});
