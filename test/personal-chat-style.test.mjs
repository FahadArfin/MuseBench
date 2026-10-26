import test from 'node:test';
import assert from 'node:assert/strict';
const adapter = await import('../electron/personal-chat-style.mjs').catch(()=>({}));

test('chat presentation maps appearance through finite values without CSS injection',()=>{
  assert.equal(typeof adapter.personalChatCSS,'function');
  const dark=adapter.personalChatCSS({theme:'dark',font:'system',textSize:'medium',reducedMotion:false});
  const light=adapter.personalChatCSS({theme:'light',font:'mono',textSize:'large',reducedMotion:true});
  assert.match(dark,/#181818/); assert.match(dark,/14px/);
  assert.match(light,/#faf9f7/); assert.match(light,/16px/); assert.match(light,/Cascadia Code/);
  assert.match(light,/animation-duration:\s*0\.01ms/);
  const hostile=adapter.personalChatCSS({theme:'x;url(https://invalid.example)',font:'secret-value',textSize:'99999px',reducedMotion:'yes'});
  assert(!hostile.includes('invalid.example')); assert(!hostile.includes('secret-value')); assert(!hostile.includes('99999px'));
  assert.equal(hostile,adapter.personalChatCSS());
  assert.equal(adapter.personalChatCSS({textSize:'constructor'}),adapter.personalChatCSS());
});
