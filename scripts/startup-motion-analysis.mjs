import assert from 'node:assert/strict';

// Wall-clock fractions are meaningful only when rendered observations cover
// them. A missing frame is neither proof of gentle easing nor a changed curve.
export function analyzeFlightSampling(moving,centeredX){
 assert(moving.length>1,'Flight needs multiple observations');
 const first=moving[0],last=moving.at(-1),durationMs=last.at-first.at;
 const maxGapMs=Math.max(...moving.slice(1).map((frame,index)=>frame.at-moving[index].at));
 const probe=fraction=>{
  const targetAt=first.at+durationMs*fraction;
  const frame=moving.reduce((nearest,candidate)=>Math.abs(candidate.at-targetAt)<Math.abs(nearest.at-targetAt)?candidate:nearest,first);
  return{targetAt,sampledAt:frame.at,sampleErrorMs:Math.abs(frame.at-targetAt),progress:(centeredX-frame.mark.x)/(centeredX-last.mark.x)};
 };
 const quarter=probe(.25),middle=probe(.5),threeQuarter=probe(.75);
 return{durationMs,maxGapMs,quarter,middle,threeQuarter,adequate:maxGapMs<=80&&[quarter,middle,threeQuarter].every(probe=>probe.sampleErrorMs<=40)};
}

export function assertFlightCurve({quarter,middle,threeQuarter}){
 assert(quarter>.01&&quarter<.25,'Flight accelerates gently instead of darting across most of the distance immediately');
 assert(middle>.35&&middle<.8,'Flight develops its main movement through the middle of the transition');
 assert(middle-quarter>quarter&&middle-quarter>1-threeQuarter,'Flight accelerates out and slows down into the title');
}

// Runs in the fixture document. Replay the captured production flight through
// Chromium's actual animation engine, paused at exact timeline fractions.
export async function renderFlightCurve({flight,easing}){
 const element=document.createElement('div');
 element.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;transform-origin:0 0;pointer-events:none;opacity:0';
 document.body.append(element);
 const animation=element.animate(flight.keyframes,{...flight.timing,...(easing?{easing}:{}),fill:'both'});
 try{
  animation.pause();await animation.ready;
  const positions=[];
  for(const fraction of [0,.25,.5,.75,1]){
   animation.currentTime=Number(flight.timing.duration)*fraction;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   positions.push({fraction,x:element.getBoundingClientRect().x});
  }
  const start=positions[0].x,end=positions.at(-1).x,progress=index=>(start-positions[index].x)/(start-end);
  return{easing:easing??flight.timing.easing,durationMs:flight.timing.duration,positions,quarter:progress(1),middle:progress(2),threeQuarter:progress(3)};
 }finally{animation.cancel();element.remove();}
}
