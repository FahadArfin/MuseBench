import assert from 'node:assert/strict';

// All sequence numbers are assigned by one main-process fixture. Never infer
// renderer/native ordering from Date.now versus timeOrigin+performance.now.
export function assertNativeLaunchHidden({nativeFrames,completions,visibilityChanges}){
 const completion=completions?.[0];
 assert(Number.isSafeInteger(completion?.sequence),'Renderer completion must be observed in main-process order');
 const before=nativeFrames.filter(frame=>frame.sequence<completion.sequence);
 const withViews=before.filter(frame=>frame.views.length>0);
 assert(withViews.length>0,'Observed hidden native samples are required before completion');
 assert(withViews.every(frame=>frame.views.every(view=>!view.visible)),'Native sample became visible before renderer completion');
 assert(completion.views.length>0&&completion.views.every(view=>!view.visible),'Native view was visible before renderer completion was received');
 assert(visibilityChanges.every(change=>change.sequence>=completion.sequence||!change.visible),'Native transition became visible before renderer completion');
 return{completionSequence:completion.sequence,hiddenSamplesBeforeCompletion:withViews.length,visibilityTransitionsBeforeCompletion:visibilityChanges.filter(change=>change.sequence<completion.sequence).length,visibleSamplesAfterCompletion:nativeFrames.filter(frame=>frame.sequence>completion.sequence&&frame.views.some(view=>view.visible)).length};
}
