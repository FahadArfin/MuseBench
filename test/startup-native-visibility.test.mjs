import test from 'node:test';
import assert from 'node:assert/strict';
const visibility=await import('../scripts/startup-native-visibility.mjs').catch(()=>({}));
const hidden=[{id:1,visible:false}],visible=[{id:1,visible:true}];
const evidence=()=>({nativeFrames:[{sequence:1,at:1793420110195,views:hidden},{sequence:4,at:1793420110213,views:visible}],completions:[{sequence:2,at:1793420110213,views:hidden}],visibilityChanges:[{sequence:3,at:1793420110213,visible:true}]});
test('same-millisecond completion/reveal uses main-process order rather than a fractional renderer clock',()=>{
 assert.equal(typeof visibility.assertNativeLaunchHidden,'function','ordered visibility proof exists');
 const fixture=evidence(),rendererLastActive=1793420110213.0999;
 assert.ok(fixture.nativeFrames[1].at<rendererLastActive,'retained CI timestamp relationship would classify the visible sample as active');
 const result=visibility.assertNativeLaunchHidden(fixture);assert.equal(result.hiddenSamplesBeforeCompletion,1);assert.equal(result.visibleSamplesAfterCompletion,1);
});
test('a visible transition between hidden samples is rejected before completion',()=>{
 assert.equal(typeof visibility.assertNativeLaunchHidden,'function');const fixture=evidence();fixture.visibilityChanges.unshift({sequence:0,at:1793420110194,visible:true});
 assert.throws(()=>visibility.assertNativeLaunchHidden(fixture),/visible before renderer completion/);
});
test('any native sample visible before completion is rejected',()=>{
 assert.equal(typeof visibility.assertNativeLaunchHidden,'function');const fixture=evidence();fixture.nativeFrames[0].views=visible;
 assert.throws(()=>visibility.assertNativeLaunchHidden(fixture),/visible before renderer completion/);
});
test('a view already visible when completion arrives is rejected',()=>{
 assert.equal(typeof visibility.assertNativeLaunchHidden,'function');const fixture=evidence();fixture.completions[0].views=visible;
 assert.throws(()=>visibility.assertNativeLaunchHidden(fixture),/visible before renderer completion/);
});
test('completion without hidden views or missing completion cannot establish visibility proof',()=>{
 assert.equal(typeof visibility.assertNativeLaunchHidden,'function');const fixture=evidence();fixture.completions=[];assert.throws(()=>visibility.assertNativeLaunchHidden(fixture),/completion/);
 const absent=evidence();absent.nativeFrames=[];assert.throws(()=>visibility.assertNativeLaunchHidden(absent),/hidden native samples/);
});
