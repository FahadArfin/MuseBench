import test from 'node:test';
import assert from 'node:assert/strict';
import {createLaunchAnimation} from '../electron/launch-animation.mjs';

function fixture() {
  const holds = [];
  let callback, cleared = 0, duration;
  const timer = {unref() {}};
  const launch = createLaunchAnimation({setHeld:value=>holds.push(value),setTimer:(fn,ms)=>{callback=fn;duration=ms;return timer;},clearTimer:value=>{assert.equal(value,timer);cleared++;}});
  return {launch,holds,expire:()=>callback(),duration:()=>duration,cleared:()=>cleared};
}

test('the launch ticket plays once for the process and completion reveals native content once', () => {
  const h = fixture();
  assert.deepEqual(h.holds,[true]);
  assert.equal(h.launch.claim(),true);
  assert.equal(h.launch.claim(),false,'a renderer reload cannot replay the intro');
  h.launch.complete(); h.launch.complete(); h.expire();
  assert.deepEqual(h.holds,[true,false]);
  assert.equal(h.cleared(),1);
  assert.equal(h.launch.claim(),false);
});

test('native content fails open within four seconds even if the renderer never claims or completes', () => {
  for (const claimed of [false,true]) {
    const h = fixture();
    if(claimed)assert.equal(h.launch.claim(),true);
    assert.equal(h.duration(),4000);
    h.expire();
    assert.deepEqual(h.holds,[true,false]);
    assert.equal(h.launch.claim(),false);
  }
});

test('renderer recovery or window closure consumes the unclaimed ticket and releases its timer', () => {
  const h = fixture();
  h.launch.close();
  assert.deepEqual(h.holds,[true,false]);
  assert.equal(h.launch.claim(),false);
  assert.equal(h.cleared(),1);
});
