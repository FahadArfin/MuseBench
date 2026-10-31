import {createServer} from 'vite';
import {build} from 'esbuild';
import {chromium,_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {analyzeFlightSampling,assertFlightCurve,renderFlightCurve} from './startup-motion-analysis.mjs';
import {assertNativeLaunchHidden} from './startup-native-visibility.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir(path.join(root,'artifacts/startup-animation'),{recursive:true});
const output=await mkdtemp(path.join(root,'artifacts/startup-animation',`${variant}-`));
const report={variant,checks:[],errors:[],modelRequests:0,scenes:{}};
const pass=message=>{report.checks.push(message);console.log(`PASS ${message}`);};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let server,browser,app,lastPage;

// Sample rendered positions and visible letters, not just CSS duration declarations.
// This runs in the local application renderer only; provider documents are fixtures.
function observeLaunch(){
  if(window.__launchObservation)return;
  const result=window.__launchObservation={frames:[],fontLoads:[],startedAt:performance.now(),timeOrigin:performance.timeOrigin};
  const originalAnimate=Element.prototype.animate;
  Element.prototype.animate=function(keyframes,options){
    const animation=originalAnimate.call(this,keyframes,options);
    if(this.classList.contains('launch-wordmark')&&Array.isArray(keyframes)&&keyframes.some(frame=>typeof frame.transform==='string'))result.flight={keyframes:animation.effect.getKeyframes(),timing:animation.effect.getTiming()};
    return animation;
  };
  const loadFont=document.fonts.load.bind(document.fonts);
  let rejectPreparedReadiness=null;
  const readinessPromises=new WeakSet(),race=Promise.race;
  // Observe the actual font race result, including a rejection. Timing alone
  // cannot tell which queued settlement won at the readiness boundary.
  Promise.race=function(values){
    const resultPromise=race.call(this,values);
    if(Array.isArray(values)&&values.some(value=>readinessPromises.has(value))){
      resultPromise.then(ready=>{result.gate={outcome:ready?'ready':'budget-lost',at:performance.now()};},()=>{result.gate={outcome:'failed',at:performance.now()};});
    }
    return resultPromise;
  };
  document.fonts.load=(...args)=>{
    if(window.__launchPreparingRealFace)return loadFont(...args);
    const timing={font:args[0],requestedAt:performance.now(),alreadyLoaded:document.fonts.check(...args)};result.fontLoads.push(timing);
    window.__launchFontReadinessStarted?.();
    const loaded=loadFont(...args).then(fonts=>{timing.resolvedAt=performance.now();timing.count=fonts.length;return fonts;});
    const mode=new URLSearchParams(location.search).get('readiness');
    const promise=mode?new Promise((resolve,reject)=>{
      loaded.then(fonts=>{
        timing.preparedRealFace=fonts.length>0&&fonts.every(face=>face.status==='loaded');
        if(mode==='failed')rejectPreparedReadiness=at=>{timing.preparationObservedAt=at;timing.rejectedAt=performance.now();reject(Error('Fixture-controlled font readiness failure after observed preparation'));};
        else if(mode==='over-budget'){setTimeout(()=>{timing.controlledSettledAt=performance.now();resolve(fonts);},650);}
        else {timing.controlledSettledAt=performance.now();resolve(fonts);}
      },reject);
    }):loaded;
    const then=promise.then;
    promise.then=function(...callbacks){const next=then.apply(this,callbacks);readinessPromises.add(next);return next;};
    return promise;
  };
  const rect=element=>{if(!element)return null;const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const union=boxes=>{if(!boxes.length)return null;const x=Math.min(...boxes.map(box=>box.x)),y=Math.min(...boxes.map(box=>box.y));return {x,y,width:Math.max(...boxes.map(box=>box.x+box.width))-x,height:Math.max(...boxes.map(box=>box.y+box.height))-y};};
  const sample=()=>{
    const layer=document.querySelector('.launch-overlay'),mark=document.querySelector('.launch-wordmark');
    // Vite can spend several seconds compiling before React mounts on a cold
    // Windows runner. Observe the application window, not that module-load gap.
    // Keep a separate deadline for a renderer that never mounts.
    const now=performance.now();
    if(result.appObservedAt===undefined&&(document.querySelector('.launch-content')||document.documentElement.dataset.launchActive==='true'))result.appObservedAt=now;
    if(result.appObservedAt===undefined){if(now-result.startedAt<30000)requestAnimationFrame(sample);return;}
    const target=[...document.querySelectorAll('[data-launch-brand="personal"]')].find(element=>element.getBoundingClientRect().width>0);
    const style=mark?getComputedStyle(mark):null;
    const glyphs=mark?[...mark.querySelectorAll('.launch-name>span')].map(element=>({text:element.textContent,opacity:Number(getComputedStyle(element).opacity),box:rect(element)})):[];
    const cursor=mark?.querySelector('.launch-cursor'),terminal=mark?.querySelector('.launch-terminal'),chatIcon=mark?.querySelector('.launch-chat-icon');
    result.frames.push({at:performance.now(),active:document.documentElement.dataset.launchActive==='true',phase:layer?.dataset.phase??null,
      rendered:Boolean(mark&&style.visibility==='visible'&&getComputedStyle(layer).display!=='none'),
      letters:glyphs.filter(glyph=>glyph.opacity>.9).map(glyph=>glyph.text).join(''),glyphs,
      cursor:cursor?{box:rect(cursor),opacity:Number(getComputedStyle(cursor).opacity)}:null,cursorCount:mark?.querySelectorAll('.launch-cursor').length??0,
      terminalOpacity:terminal?Number(getComputedStyle(terminal).opacity):null,chatIcon:chatIcon?{box:rect(chatIcon),opacity:Number(getComputedStyle(chatIcon).opacity)}:null,
      mark:rect(mark),text:rect(mark?.querySelector('.launch-name')),target:rect(target),targetText:rect(target?.querySelector('.typed-text')),targetIcon:rect(target?.querySelector('.product-brand-icon')),
      textGlyphBounds:union(glyphs.map(glyph=>glyph.box)),targetGlyphBounds:union(target?[...target.querySelectorAll('.typed-text>span')].map(rect):[]),
      targetVisible:target?getComputedStyle(target).visibility==='visible':false,targetLettersOpaque:target?[...target.querySelectorAll('.typed-text>span')].every(glyph=>Number(getComputedStyle(glyph).opacity)>.99):false,
      color:style?.color,viewport:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth>innerWidth+1,
      inert:Boolean(document.querySelector('.launch-content')?.inert)});
    // Fixture-only: make target availability follow an observed release frame,
    // independently of font readiness or the product's mount/layout ordering.
    const heldTarget=document.querySelector('[data-startup-target-hold]'),last=result.frames.at(-1);
    if(rejectPreparedReadiness&&last.phase==='preparing'&&last.inert){
      const rejectReadiness=rejectPreparedReadiness;rejectPreparedReadiness=null;rejectReadiness(last.at);
    }
    if(heldTarget&&!last.active&&last.phase===null&&!last.inert){
      result.targetHoldReleasedAt=performance.now();heldTarget.remove();
    }
    if(performance.now()-result.appObservedAt<6500)requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

async function until(check,label,timeout=12000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=await check();if(value)return value;await delay(35);}
  throw Error(`Timed out: ${label}`);
}
const settled=page=>page.waitForFunction(()=>document.querySelector('.launch-content')&&!document.querySelector('.launch-overlay')&&document.documentElement.dataset.launchActive!=='true'&&!document.querySelector('.launch-content').inert);
const observation=page=>page.evaluate(()=>window.__launchObservation);

async function browserScene(name,{query='?launch=1',readiness,lateTarget=false,prepareFont=Boolean(readiness),viewport={width:1440,height:960},reducedMotion='no-preference',preferences={},brokenAnimation=false,slowFirstPaint=0,busyTyping=0,busyFlight=0,fontDelay=0,fontDelayAfterReadiness=0,rendererDelay=0,skip}={}){
  const page=lastPage=await browser.newPage({viewport,reducedMotion,...(name==='preview-launch'?{recordVideo:{dir:output,size:viewport}}:{})});
  let fontReadinessStarted;
  const fontReadiness=new Promise(resolve=>{fontReadinessStarted=resolve;});
  if(fontDelayAfterReadiness)await page.exposeBinding('__launchFontReadinessStarted',()=>fontReadinessStarted());
  page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(`${name}: ${error.message}`));
  const load=report.sceneLoads??={};load[name]={failedRequests:[],failedResponses:[],fontRequests:[],crashed:false};
  page.on('crash',()=>{load[name].crashed=true;});
  page.on('requestfailed',request=>{if(new URL(request.url()).hostname==='127.0.0.1')load[name].failedRequests.push({url:request.url(),error:request.failure()?.errorText});});
  page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).hostname==='127.0.0.1')load[name].failedResponses.push({url:response.url(),status:response.status()});});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(prepareFont&&/\/assets\/index-[^/]+\.js$/.test(url.pathname)){
      // The CSS and bundled preload may finish while the renderer is held.
      // Prepare the actual CSS face before allowing React's readiness gate.
      await page.waitForFunction(()=>[...document.styleSheets].some(sheet=>sheet.href?.includes('/assets/index-')));
      await page.evaluate(async()=>{
        window.__launchPreparingRealFace=true;
        const faces=await document.fonts.load('500 17px "Inter Variable"','Muse AI');
        window.__launchPreparingRealFace=false;
        if(!faces.length||!faces.every(face=>face.status==='loaded'))throw Error('Real brand face did not prepare');
        window.__launchPreparedFaceCount=faces.length;
        window.__launchObservation.fontLoads=[];
      });
    }
    // Reproduce a delayed renderer bundle without changing presentation timing.
    if(name==='preview-launch'&&process.argv.includes('--slow-renderer')&&/\/assets\/index-[^/]+\.js$/.test(url.pathname))await delay(7000);
    if(rendererDelay&&/\/assets\/index-[^/]+\.js$/.test(url.pathname))await delay(rendererDelay);
    if(/\/inter-latin-wght-normal-[^/]+\.woff2$/.test(url.pathname)){
      const timing={url:route.request().url(),requestedAt:Date.now()};load[name].fontRequests.push(timing);
      if(fontDelayAfterReadiness){await fontReadiness;timing.readinessObservedAt=Date.now();await delay(fontDelayAfterReadiness);}
      if(fontDelay)await delay(fontDelay);
      timing.releasedAt=Date.now();
    }
    return route.continue();
  });
  await page.addInitScript(observeLaunch);
  await page.addInitScript(({preferences,brokenAnimation,slowFirstPaint,busyTyping,busyFlight})=>{
    localStorage.setItem('musebench.preferences.v1',JSON.stringify(preferences));
    if(brokenAnimation)Element.prototype.animate=function(){throw Error('Simulated unavailable animation compositor');};
    if(slowFirstPaint){
      const animate=Element.prototype.animate;let delayed=false;
      Element.prototype.animate=function(...args){
        // Reproduce a busy cold renderer consuming part of the launch deadline.
        if(!delayed&&this.classList.contains('launch-wordmark')){delayed=true;const until=performance.now()+slowFirstPaint;while(performance.now()<until){}}
        return animate.apply(this,args);
      };
    }
    if(busyFlight){
      const animate=Element.prototype.animate;let scheduled=false;
      Element.prototype.animate=function(keyframes,...rest){
        const animation=animate.call(this,keyframes,...rest);
        if(!scheduled&&this.classList.contains('launch-wordmark')&&Array.isArray(keyframes)&&keyframes.some(frame=>typeof frame.transform==='string')){scheduled=true;setTimeout(()=>{const until=performance.now()+busyFlight;while(performance.now()<until){}},80);}
        return animation;
      };
    }
    if(busyTyping){
      const animate=Element.prototype.animate;let scheduled=false;
      Element.prototype.animate=function(...args){
        if(!scheduled&&this.classList.contains('launch-wordmark')){
          scheduled=true;setTimeout(()=>{const until=performance.now()+busyTyping;while(performance.now()<until){}},260);
        }
        return animate.apply(this,args);
      };
    }
  },{preferences,brokenAnimation,slowFirstPaint,busyTyping,busyFlight});
  await page.goto(`${server.resolvedUrls.local[0]}__startup__/index.html${query}${readiness?`&readiness=${readiness}`:''}${lateTarget?'&lateTarget=1':''}`,{waitUntil:'domcontentloaded'});
  if(name==='preview-launch'&&process.argv.includes('--late-animation-assertion'))await delay(3000);
  if(name==='preview-launch'||name==='light-launch'){
    // The animation can finish before a slow inspector starts polling. Its
    // pre-navigation frame observer retains actual rendered typing evidence.
    await page.waitForFunction(()=>window.__launchObservation?.frames.some(frame=>frame.rendered&&frame.letters==='Muse AI'));
    if(await page.locator('.launch-overlay[data-phase="typing"]').count())await page.screenshot({path:path.join(output,name==='preview-launch'?'launch-centered.png':'light-launch-centered.png')});
  }
  if(skip){await page.locator('.launch-overlay[data-phase="typing"]').waitFor();await skip(page);}
  await settled(page);await page.locator('.app').waitFor();
  if(readiness==='over-budget')await page.waitForFunction(()=>{
    const observed=window.__launchObservation,load=observed.fontLoads[0];
    return load?.controlledSettledAt!==undefined&&observed.frames.at(-1)?.at>load.controlledSettledAt;
  });
  if(fontDelayAfterReadiness)await page.waitForFunction(()=>{
    const observed=window.__launchObservation,loaded=observed?.fontLoads.find(load=>load.resolvedAt!==undefined);
    return loaded&&observed.frames.at(-1)?.at>loaded.resolvedAt;
  });
  if(await page.evaluate(()=>['budget-lost','failed'].includes(window.__launchObservation.gate?.outcome)))await page.waitForFunction(()=>{
    const observed=window.__launchObservation,since=observed.fontLoads[0]?.requestedAt;
    return observed.frames.some(frame=>frame.at>=since&&!frame.active&&frame.phase===null&&!frame.inert&&frame.targetVisible);
  });
  const evidence=await observation(page);report.scenes[name]=evidence;
  evidence.renderedCurve=evidence.flight?await verifyRenderedFlight(page,evidence.flight,name==='preview-launch'):null;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name}: no horizontal overflow`);
  assert.equal(await page.locator('.launch-content').getAttribute('inert'),null,`${name}: launch must release app interaction`);
  await page.screenshot({path:path.join(output,`${name}.png`)});
  return {page,frames:evidence.frames,fontLoads:evidence.fontLoads,gate:evidence.gate,renderedCurve:evidence.renderedCurve};
}

async function verifyRenderedFlight(page,flight,rejectControl=false){
  assert(flight,'Actual production flight was captured');
  assert.match(flight.timing.easing,/^cubic-bezier\((?:0)?\.65,\s*0,\s*(?:0)?\.22,\s*1\)$/,'Captured production easing contract is unchanged');
  assert(flight.timing.duration>0&&flight.timing.duration<=740,'Captured flight retains its bounded production duration');
  const curve=await page.evaluate(renderFlightCurve,{flight});assertFlightCurve(curve);
  if(rejectControl){const control=await page.evaluate(renderFlightCurve,{flight,easing:'ease-out'});assert.throws(()=>assertFlightCurve(control),/accelerates gently/);curve.rejectedEaseOutControl=control;}
  return curve;
}

function checkLaunchMotion(frames,label,renderedCurve){
  assert(renderedCurve,`${label}: deterministic rendered production curve evidence exists`);assertFlightCurve(renderedCurve);
  const typed=frames.filter(frame=>frame.rendered&&frame.phase==='typing');
  assert(typed.length>5,'Explicit preview must visibly animate');
  assert(typed.some(frame=>frame.letters.length>0&&frame.letters!=='Muse AI'),'Brand letters appear progressively');
  assert(typed.some(frame=>frame.letters==='Muse AI'),'Typing completes before the flight');
  assert(typed.filter(frame=>frame.glyphs.some(glyph=>glyph.opacity>.1&&glyph.opacity<.9)).length>3,'Glyphs softly fade into view across rendered frames');
  const centered=typed.find(frame=>frame.letters==='Muse AI');
  assert(Math.abs(centered.mark.x+centered.mark.width/2-centered.viewport.width/2)<2,'Large launch title starts centered horizontally');
  assert(Math.abs(centered.mark.y+centered.mark.height/2-centered.viewport.height/2)<2,'Large launch title starts centered vertically');
  assert(centered.mark.height>=74&&centered.mark.height<=84,'Hero uses the optically balanced size of about 80px while remaining larger than the sidebar brand');
  assert.equal(centered.color,'rgb(24, 119, 242)','Launch uses requested Facebook blue');
  assert(typed.every(frame=>frame.cursorCount===1),'Only one terminal typing cursor is rendered');
  const tracking=typed.filter(frame=>frame.cursor?.opacity>.2&&frame.glyphs.some(glyph=>glyph.opacity>.01));
  assert(tracking.length>5,'Cursor accompanies the visibly typed name');
  let atTextEdge=0,leadStarted=null,longestLead=0;
  for(const frame of tracking){
    const fullyVisible=frame.glyphs.filter(glyph=>glyph.opacity>.99).at(-1);
    const revealing=frame.glyphs.filter(glyph=>glyph.opacity>.001).at(-1);
    const minimum=fullyVisible?fullyVisible.box.x+fullyVisible.box.width:frame.text.x;
    // The cursor moves as a glyph begins its short fade. A sample at that exact
    // boundary may see the new cursor position before the glyph's first paint.
    const next=frame.glyphs[frame.glyphs.indexOf(revealing)+1];
    const maximum=(next??revealing).box.x+(next??revealing).box.width;
    assert(frame.cursor.box.x>=minimum-2&&frame.cursor.box.x<=maximum+12,`${label}: cursor tracks the advancing text edge`);
    if(Math.abs(frame.cursor.box.x-revealing.box.x-revealing.box.width)<=8){
      atTextEdge++;
      if(leadStarted!==null){longestLead=Math.max(longestLead,frame.at-leadStarted);leadStarted=null;}
    }else if(leadStarted===null)leadStarted=frame.at;
  }
  if(leadStarted!==null)longestLead=Math.max(longestLead,tracking.at(-1).at-leadStarted);
  // The JS cursor move can precede the new glyph's first compositor paint by
  // one or two frames. Permit that short lead, never a cursor detached ahead.
  assert(atTextEdge/tracking.length>=.7&&longestLead<90,'Cursor stays beside the revealing text with only a brief lead at glyph boundaries');
  const firstCursor=tracking[0].cursor.box.x,lastCursor=tracking.at(-1).cursor.box.x;
  assert(lastCursor-firstCursor>centered.text.width*.45,'Cursor advances with the text instead of blinking beneath the leading symbol');
  assert(typed.at(-1).cursor.opacity<.02,'Cursor withdraws before the wordmark begins travelling');
  const moving=frames.filter(frame=>frame.rendered&&frame.phase==='moving');
  assert(moving.length>5,'Brand visibly travels to the sidebar');
  assert(moving.every(frame=>frame.cursor?.opacity<.02),'The withdrawn cursor stays hidden throughout the flight');
  const landed=moving.at(-1);
  assert(Math.abs(landed.mark.x-landed.target.x)<3,'Flight lands on the real sidebar title position');
  assert(Math.abs(landed.mark.y-landed.target.y)<4,'Flight lands on the real sidebar title height');
  assert(moving.at(0).mark.width>landed.mark.width*2,'Brand scales down smoothly into the sidebar');
  const sampling=analyzeFlightSampling(moving,centered.mark.x);
  (report.motionEvidence??={})[label]={naturalSampling:sampling,naturalCurveObserved:sampling.adequate,renderedCurve};
  if(sampling.adequate)assertFlightCurve({quarter:sampling.quarter.progress,middle:sampling.middle.progress,threeQuarter:sampling.threeQuarter.progress});
  else console.log(`OBSERVED ${label}: natural curve fractions unobserved (maximum frame gap ${sampling.maxGapMs.toFixed(1)}ms); deterministic rendered curve checked separately`);
  for(const key of ['x','y','width','height']){
    assert(Math.abs(landed.text[key]-landed.targetText[key])<2,`${label}: final text ${key} matches the actual sidebar text without a jump`);
    assert(Math.abs(landed.textGlyphBounds[key]-landed.targetGlyphBounds[key])<2,`${label}: final rendered glyph ${key} matches the real title`);
    assert(Math.abs(landed.chatIcon.box[key]-landed.targetIcon[key])<2,`${label}: final chat icon ${key} matches the actual sidebar icon`);
  }
  assert(landed.terminalOpacity<.02&&landed.chatIcon.opacity>.98,'Terminal symbol resolves fully into the sidebar chat icon before handoff');
  const revealed=frames.find(frame=>frame.at>landed.at&&!frame.active&&frame.target);
  assert(revealed?.targetVisible&&revealed.targetLettersOpaque,'The real title is fully visible on the first frame after handoff');
  assert(frames.filter(frame=>frame.active&&frame.phase).every(frame=>frame.inert),'Background controls do not steal launch input');
  const active=frames.filter(frame=>frame.active);
  assert(active.at(-1).at-active[0].at<2350,'Normal animation remains short');
}

function checkNoFontMotion(scene,label){
  assert(scene.frames.some(frame=>frame.phase==='preparing'&&frame.inert),`${label}: preparation gates interaction`);
  assert(!scene.frames.some(frame=>frame.rendered||frame.phase==='typing'||frame.phase==='moving'),`${label}: no fallback-font typing or flight`);
  const released=scene.frames.find(frame=>frame.at>=scene.fontLoads[0].requestedAt&&!frame.active&&frame.phase===null);
  assert(released&&!released.inert,`${label}: launch releases interaction`);
  assert(released.at-scene.fontLoads[0].requestedAt<2100,`${label}: unchanged hard readiness deadline`);
  const visible=scene.frames.find(frame=>frame.at>=released.at&&!frame.active&&frame.phase===null&&!frame.inert&&frame.targetVisible);
  assert(visible,`${label}: released app has a visible sidebar target`);
  return {released,visible};
}

async function checkInteractive(page){
  assert.equal(await page.locator('.launch-overlay').count(),0,'Font readiness releases the overlay');
  await page.getByRole('button',{name:'Muse Code',exact:true}).click();
  await page.getByRole('textbox',{name:'Message Muse',exact:true}).waitFor();
  assert.equal(await page.locator('.launch-overlay').count(),0,'Controls work without replaying launch');
}

async function checkBrowser(){
  // Measure the shipped renderer. Cold Vite module transforms can otherwise
  // consume the launch watchdog after React mounts and before its first paint.
  const fixture=(await build({stdin:{contents:`import {createPreviewBridge} from './src/preview/bridge.ts';
window.musebench=createPreviewBridge();
window.musebench.launch={active:new URLSearchParams(location.search).get('launch')==='1',complete:async()=>{}};
window.fetch=async()=>new Response(JSON.stringify({version:1,pages:{}}));`,resolveDir:root},bundle:true,write:false,loader:{'.md':'text'},format:'iife',platform:'browser'})).outputFiles[0].text;
  server=await createServer({configFile:path.join(root,'vite.preview.config.mjs'),cacheDir:path.join(root,'node_modules/.vite-startup-animation'),server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'startup-production-fixture',configureServer(server){server.middlewares.use('/__startup__',async(req,res)=>{
    const file=(req.url??'').split('?')[0];
    try{
      if(file==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
      if(file!=='/index.html'&&!/^\/assets\/[a-zA-Z0-9._-]+$/.test(file)){res.statusCode=404;res.end();return;}
      let bytes=await readFile(path.join(root,'dist',file));
      if(file==='/index.html'){
        const heldTarget=new URL(req.url,'http://fixture').searchParams.has('lateTarget')?'<style data-startup-target-hold>[data-launch-brand="personal"]{display:none!important}</style>':'';
        bytes=Buffer.from(bytes.toString().replace('<head>',`<head>${heldTarget}<script src="./fixture.js"></script>`));res.setHeader('Content-Type','text/html');
      }
      else res.setHeader('Content-Type',file.endsWith('.woff2')?'font/woff2':file.endsWith('.css')?'text/css':'text/javascript');
      res.end(bytes);
    }catch{res.statusCode=404;res.end();}
  });}}]});await server.listen();
  browser=await chromium.launch({headless:true});
  // A route hold controls release, not actual font delivery/decode/scheduling.
  // Follow the observed race result; controlled prepared-face cases below
  // guarantee the mandatory success, budget-loss and rejection coverage.
  const coldFont=await browserScene('cold-brand-font',{fontDelayAfterReadiness:process.argv.includes('--fault-cold-budget')?650:100,rendererDelay:500});
  assert(report.sceneLoads['cold-brand-font'].fontRequests[0].requestedAt<report.scenes['cold-brand-font'].timeOrigin+coldFont.fontLoads[0].requestedAt,'Brand font preload starts before renderer font readiness');
  assert.equal(coldFont.fontLoads[0].alreadyLoaded,false,'Cold-font motion starts with the real font still pending');
  assert.equal(coldFont.fontLoads[0].count,1,'Cold-font motion resolves the real brand font');
  report.scenes['cold-brand-font'].actualFontLoadMs=coldFont.fontLoads[0].resolvedAt-coldFont.fontLoads[0].requestedAt;
  assert(coldFont.gate,'Cold real-font race outcome was observed');
  if(coldFont.gate.outcome==='ready')checkLaunchMotion(coldFont.frames,'cold brand font',coldFont.renderedCurve);
  else {assert.equal(coldFont.gate.outcome,'budget-lost');checkNoFontMotion(coldFont,'cold brand font');}
  await checkInteractive(coldFont.page);await coldFont.page.close();
  pass(`Cold real font preserves its observed ${coldFont.gate.outcome} contract (${Math.round(report.scenes['cold-brand-font'].actualFontLoadMs)}ms actual readiness)`);
  for(const readiness of ['ready','over-budget','failed']){
    const scene=await browserScene(`controlled-${readiness}-readiness`,{readiness});
    const load=scene.fontLoads[0];
    assert.equal(load.alreadyLoaded,true,'Controlled readiness starts with the actual face prepared');
    assert.equal(load.count,1,'Controlled readiness uses one actual bundled face');
    assert.equal(load.preparedRealFace,true,'Controlled settlement keeps the real loaded face');
    if(readiness==='failed')assert(load.preparationObservedAt-load.requestedAt<400,'Controlled rejection requires an observed preparing/inert frame within the unchanged readiness gate');
    assert.equal(scene.gate?.outcome,{ready:'ready','over-budget':'budget-lost',failed:'failed'}[readiness]);
    if(readiness==='ready'){
      assert(load.controlledSettledAt-load.requestedAt<400,'Prepared-face success settles within the unchanged readiness budget');
      checkLaunchMotion(scene.frames,'controlled under-budget readiness',scene.renderedCurve);
    }
    else checkNoFontMotion(scene,`controlled ${readiness} readiness`);
    if(readiness==='over-budget'){
      assert(load.controlledSettledAt-load.requestedAt>=650,'Controlled readiness remains pending beyond the unchanged budget');
      const released=scene.frames.find(frame=>frame.at>=load.requestedAt&&!frame.active&&frame.phase===null);
      assert(released.at<load.controlledSettledAt,'Budget loss releases the app before controlled readiness settles');
      assert(scene.frames.some(frame=>frame.at>load.controlledSettledAt&&!frame.inert&&frame.targetVisible),'Late controlled settlement cannot replay launch');
    }
    await checkInteractive(scene.page);await scene.page.close();
    pass(`Fixture-controlled ${readiness==='failed'?'rejection after observed preparation':readiness+' readiness'} with the prepared real font satisfies its mandatory motion/interaction contract`);
  }
  const lateTarget=await browserScene('controlled-failed-readiness-late-target',{readiness:'failed',lateTarget:true});
  assert.equal(lateTarget.gate?.outcome,'failed','Controlled late-target rejection requires observed preparation before the unchanged readiness gate wins');
  assert.equal(lateTarget.fontLoads[0].alreadyLoaded,true);assert.equal(lateTarget.fontLoads[0].count,1);assert.equal(lateTarget.fontLoads[0].preparedRealFace,true);
  assert(lateTarget.fontLoads[0].preparationObservedAt-lateTarget.fontLoads[0].requestedAt<400,'Late-target rejection observes preparation within the original readiness gate');
  const {released:lateReleased,visible:lateVisible}=checkNoFontMotion(lateTarget,'controlled late target');
  assert.equal(lateReleased.target,null,'Controlled release precedes measurable branding');assert.equal(lateReleased.targetVisible,false);
  assert(lateVisible.at>lateReleased.at,'Visible branding follows a separately recorded release frame');
  assert(report.scenes['controlled-failed-readiness-late-target'].targetHoldReleasedAt>=lateReleased.at,'Target hold is released by the observed condition');
  await checkInteractive(lateTarget.page);await lateTarget.page.close();
  pass('Controlled rejection after observed preparation releases before late branding without fallback motion or replay and retains working controls');
  const overBudget=await browserScene('over-budget-brand-font',{fontDelayAfterReadiness:650,rendererDelay:500});
  const font=overBudget.fontLoads[0];
  assert.equal(font.alreadyLoaded,false,'Over-budget font starts cold');
  assert.equal(font.count,1,'Over-budget font eventually resolves successfully');
  assert(font.resolvedAt-font.requestedAt>=650,'Over-budget font remains pending beyond the readiness budget');
  assert(overBudget.frames.some(frame=>frame.phase==='preparing'&&frame.inert),'Over-budget launch was mounted and gated interaction while preparing');
  const released=overBudget.frames.find(frame=>frame.at>=font.requestedAt&&!frame.active&&frame.phase===null);
  assert(released&&released.at<font.resolvedAt,'Font timeout releases the app before the delayed font resolves');
  assert(released.at-font.requestedAt<2100,'Font fallback stays within the unchanged hard readiness deadline');
  assert(!released.inert&&released.targetVisible&&released.targetLettersOpaque,'Font fallback reveals a fully visible sidebar title and releases controls');
  assert(!overBudget.frames.some(frame=>frame.rendered),'Over-budget font never starts a mismeasured flourish');
  assert(overBudget.frames.some(frame=>frame.at>font.resolvedAt&&!frame.active&&!frame.inert&&frame.targetVisible),'Late font resolution keeps the app usable without replaying launch');
  await overBudget.page.getByRole('button',{name:'Muse Code',exact:true}).click();
  await overBudget.page.getByRole('textbox',{name:'Message Muse',exact:true}).waitFor();
  assert.equal(await overBudget.page.locator('.launch-overlay').count(),0,'Controls work after font fallback without replaying launch');
  await overBudget.page.close();
  pass('An over-budget cold font releases a visible, usable app before it resolves and cannot replay the launch afterward');
  const normal=await browserScene('preview-launch',{prepareFont:true});
  assert.equal(normal.fontLoads[0].alreadyLoaded,true,'Warm browser integration uses the actual prepared font');
  assert.equal(normal.gate?.outcome,'ready');
  checkLaunchMotion(normal.frames,'dark theme',normal.renderedCurve);
  pass('Preview types the large blue Muse AI wordmark in the center, animates to the actual sidebar brand, and releases interaction in under 2.35 seconds');
  pass('One cursor follows softly revealed glyphs and withdraws before gentle acceleration, deceleration and a seamless text/icon handoff');
  await normal.page.getByRole('button',{name:'Muse Code',exact:true}).click();
  await normal.page.getByRole('textbox',{name:'Message Muse',exact:true}).waitFor();
  assert.equal(await normal.page.locator('.launch-overlay').count(),0);
  await normal.page.getByRole('button',{name:'Muse AI',exact:true}).click();
  assert.equal(await normal.page.locator('.launch-overlay').count(),0);
  pass('Switching between Muse AI and Muse Code does not replay launch');
  const video=normal.page.video();await normal.page.close();if(video)await video.saveAs(path.join(output,'launch-demo.webm'));

  const light=await browserScene('light-launch',{preferences:{theme:'light'}});checkLaunchMotion(light.frames,'light theme',light.renderedCurve);await light.page.close();
  pass('Light theme retains the same typing, cursor, motion and exact sidebar landing');

  const busy=await browserScene('busy-typing',{busyTyping:220});checkLaunchMotion(busy.frames,'busy typing',busy.renderedCurve);await busy.page.close();
  pass('A stalled main thread cannot move the cursor ahead of the compositor-painted letters');

  const busyFlight=await browserScene('busy-flight',{prepareFont:true,busyFlight:330});checkLaunchMotion(busyFlight.frames,'busy flight',busyFlight.renderedCurve);assert.equal(report.motionEvidence['busy flight'].naturalCurveObserved,false);assert.ok(report.motionEvidence['busy flight'].naturalSampling.maxGapMs>=300);await busyFlight.page.close();
  pass('A controlled flight sampling gap retains separate rendered curve and live landing evidence');

  const lateFont=await browserScene('late-brand-font',{fontDelay:350});
  assert(lateFont.gate,'Late-font race outcome was observed');
  if(lateFont.gate.outcome==='ready')checkLaunchMotion(lateFont.frames,'late brand font',lateFont.renderedCurve);
  else {assert.equal(lateFont.gate.outcome,'budget-lost');checkNoFontMotion(lateFont,'late brand font');}
  await lateFont.page.close();
  pass(`A late real font follows its observed ${lateFont.gate.outcome} contract`);
  const stalledFont=await browserScene('stalled-brand-font',{fontDelay:2000});
  assert(!stalledFont.frames.some(frame=>frame.rendered),'A stalled font skips the flourish instead of measuring fallback glyphs');
  await stalledFont.page.close();
  pass('A stalled brand font releases interaction without starting a misaligned animation');

  const slow=await browserScene('slow-first-paint',{slowFirstPaint:550});checkLaunchMotion(slow.frames,'slow first paint',slow.renderedCurve);await slow.page.close();
  pass('A busy cold renderer still completes the flight and icon handoff before the launch deadline');
  const exhausted=await browserScene('low-flight-budget',{slowFirstPaint:1000});
  // With any extra host delay the watchdog can release during typing instead
  // of painting the brief fade. Both outcomes must avoid an unfinished flight.
  assert(exhausted.frames.some(frame=>frame.rendered),'The delayed startup was observed');
  assert(!exhausted.frames.some(frame=>frame.phase==='moving'),'Low flight budget does not begin a flight it cannot complete');
  await exhausted.page.close();
  pass('A severely delayed first paint releases app interaction without starting an unfinished flight');

  const ordinary=await browserScene('preview-normal',{query:''});
  assert(!ordinary.frames.some(frame=>frame.active));await ordinary.page.close();
  pass('Ordinary preview navigation does not show launch; ?launch=1 is an explicit demo');
  for(const [name,options] of [['os-reduced-motion',{reducedMotion:'reduce'}],['preference-reduced-motion',{preferences:{reducedMotion:true}}]]){
    const scene=await browserScene(name,options);assert(!scene.frames.some(frame=>frame.rendered),`${name}: no typing or flight`);await scene.page.close();
  }
  pass('Operating system and in-app reduced motion both skip typing and flight');
  for(const [name,options] of [['collapsed-sidebar',{preferences:{sidebarCollapsed:true}}],['narrow-window',{viewport:{width:390,height:844}}]]){
    const scene=await browserScene(name,options);assert(scene.frames.some(frame=>frame.phase==='fading'));assert(!scene.frames.some(frame=>frame.phase==='moving'));
    assert(!scene.frames.some(frame=>frame.overflow),`${name}: animation stays inside window`);await scene.page.close();
  }
  pass('Collapsed and narrow sidebars fade in place without flying offscreen or overflowing');
  for(const [name,skip] of [['escape-skip',page=>page.keyboard.press('Escape')],['pointer-skip',page=>page.mouse.click(700,480)],['resize-skip',page=>page.setViewportSize({width:1300,height:850})]]){
    const scene=await browserScene(name,{skip});assert(!scene.frames.some(frame=>frame.phase==='moving'));await scene.page.close();
  }
  pass('Escape, click and window resize dismiss launch immediately');
  const failed=await browserScene('animation-failure',{brokenAnimation:true});await failed.page.close();
  pass('A compositor animation failure still opens a usable application');
}

async function launchDesktop({dropCompletion=false,earlyReveal=false}={}){
  const folder=path.join(output,dropCompletion?'desktop-fail-open':earlyReveal?'desktop-early-reveal':'desktop-cold');await mkdir(folder,{recursive:true});
  const env={...process.env,MUSEBENCH_DATA_DIR:path.join(folder,'data'),MUSEBENCH_PROJECTS_DIR:path.join(folder,'projects')};
  delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
  let entry='.';
  if(variant==='source'){
    // Register fictional HTTPS responses before importing the real application.
    // Nothing touches the installed profile or sends a model request.
    entry=path.join(folder,'entry.mjs');
    await writeFile(entry,`import {app,session,ipcMain,BrowserWindow,WebContentsView} from 'electron';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const fixture=globalThis.__launchFixture={requests:[],nativeFrames:[],visibilityChanges:[],completions:[],droppedCompletions:0};
let sequence=0;
const snapshot=()=>BrowserWindow.getAllWindows().filter(window=>!window.getParentWindow()).flatMap(window=>window.contentView.children.filter(view=>view.webContents&&!view.webContents.isDestroyed()).map(view=>({id:view.webContents.id,url:view.webContents.getURL(),visible:view.getVisible()})));
const originalSetVisible=WebContentsView.prototype.setVisible;
WebContentsView.prototype.setVisible=function(...args){const result=originalSetVisible.apply(this,args);fixture.visibilityChanges.push({sequence:++sequence,at:Date.now(),id:this.webContents.id,visible:this.getVisible()});return result;};
const originalExecFile=childProcess.execFile;
childProcess.execFile=function(...args){
 if(['where.exe','which'].includes(args[0])&&args[1]?.[0]==='ffmpeg'){
  fixture.probeStartedAt=Date.now();
  const timer=setTimeout(()=>{fixture.probeFinishedAt=Date.now();args.at(-1)(Error('Optional FFmpeg fixture unavailable'),'','');},5000);timer.unref();return;
 }
 return originalExecFile(...args);
};
syncBuiltinESMExports();
const originalHandle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>originalHandle(name,name==='musebench:launch-complete'?async(...args)=>{fixture.completions.push({sequence:++sequence,at:Date.now(),views:snapshot()});if(${dropCompletion?'true':'false'}){fixture.droppedCompletions++;return;}return handler(...args);}:handler);
app.on('browser-window-created',(_event,window)=>{
 if(window.getParentWindow())return;
 window.webContents.on('dom-ready',()=>window.webContents.executeJavaScript(${JSON.stringify(`(${observeLaunch.toString()})();`)}).catch(()=>{}));
 const started=Date.now(),timer=setInterval(()=>{
  if(window.isDestroyed()||Date.now()-started>6500){clearInterval(timer);return;}
  fixture.nativeFrames.push({sequence:++sequence,at:Date.now(),views:snapshot()});
  if(${earlyReveal?'true':'false'}&&!fixture.forcedReveal&&!fixture.completions.length&&snapshot().length)void window.webContents.executeJavaScript(${JSON.stringify("Boolean(document.querySelector('.launch-overlay[data-phase=typing]'))")}).then(active=>{if(active&&!fixture.forcedReveal&&!fixture.completions.length){const view=window.contentView.children.find(view=>view.webContents);if(view){fixture.forcedReveal=true;view.setVisible(true);view.setVisible(false);}}}).catch(()=>{});
 },16);timer.unref();window.once('closed',()=>clearInterval(timer));
});
app.whenReady().then(async()=>{
 for(const partition of ['persist:musebench-personal-muse','persist:musebench-personal-chat'])for(const scheme of ['https','http'])await session.fromPartition(partition).protocol.handle(scheme,async request=>{
  fixture.requests.push({at:Date.now(),url:request.url,method:request.method});
  if(request.method!=='GET')return new Response('Read-only startup fixture',{status:451});
  await new Promise(resolve=>setTimeout(resolve,350));
  return new Response('<!doctype html><html><head><title>Offline launch fixture</title></head><body><button>Log in</button><main><h1>Meta AI</h1><textarea aria-label="Message Meta AI"></textarea></main></body></html>',{headers:{'content-type':'text/html'}});
 });
});
await import(${JSON.stringify(pathToFileURL(path.join(root,'electron/main.mjs')).href)});
`);
  }
  app=await electron.launch({cwd:root,args:[...(variant==='source'?[entry]:[]),'--host-resolver-rules=MAP * ~NOTFOUND'],...(variant==='packaged'?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env,timeout:30000});
  // Startup may create a hidden account lookup before the main renderer has
  // navigated. Select the trusted local UI, never whichever window reports first.
  const page=lastPage=await until(()=>app.windows().find(candidate=>!candidate.isClosed()&&/\/dist\/index\.html(?:[?#]|$)/.test(candidate.url())),'main local desktop renderer');
  page.setDefaultTimeout(12000);page.on('pageerror',error=>report.errors.push(`desktop: ${error.message}`));
  await page.waitForFunction(()=>Boolean(window.musebench?.launch));
  assert.equal(await page.evaluate(()=>window.musebench.launch.active),true,'Fresh process claims launch exactly once');
  await page.evaluate(observeLaunch);
  if(variant==='packaged'){
    // The packaged entry point cannot be wrapped. Install the same isolated
    // provider fixtures through Electron's test connection, then retry the
    // DNS-blocked first request while the launch visibility gate is still held.
    await app.evaluate(async({session})=>{
      for(const partition of ['persist:musebench-personal-muse','persist:musebench-personal-chat'])for(const scheme of ['https','http'])await session.fromPartition(partition).protocol.handle(scheme,async request=>{
        if(request.method!=='GET')return new Response('Read-only startup fixture',{status:451});
        await new Promise(resolve=>setTimeout(resolve,350));
        return new Response('<!doctype html><html><head><title>Offline launch fixture</title></head><body><button>Log in</button><main><h1>Meta AI</h1><textarea aria-label="Message Meta AI"></textarea></main></body></html>',{headers:{'content-type':'text/html'}});
      });
    });
    await page.evaluate(()=>window.musebench.personal({type:'reload'}));
  }
  return {page,folder};
}

async function checkDesktop(){
  let {page,folder}=await launchDesktop();
  await page.locator('.launch-overlay').waitFor();
  const early=await app.evaluate(({app,BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows().find(window=>!window.getParentWindow());
    return {dataDir:app.getPath('userData'),views:window.contentView.children.filter(view=>view.webContents).map(view=>({url:view.webContents.getURL(),visible:view.getVisible()}))};
  });
  assert.equal(early.dataDir,path.join(folder,'data'));
  assert(early.views.length>0,'Initial Meta chat loads while animation is running');
  assert(early.views.every(view=>!view.visible),'Native website must stay behind the launch screen');
  if(variant==='source'){
    const probe=await app.evaluate(()=>({started:globalThis.__launchFixture.probeStartedAt,finished:globalThis.__launchFixture.probeFinishedAt}));
    assert(probe.started&&!probe.finished,'First window must not wait for the delayed optional FFmpeg probe');
  }
  report.scenes['desktop-initial']=early;
  await settled(page);
  const liveView=await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow())?.contentView.children.some(view=>view.webContents&&view.getVisible())),'native chat reveals after animation');
  assert(liveView);
  const motion=report.scenes['desktop-cold']=await observation(page);
  assert(motion.frames.some(frame=>frame.rendered&&frame.phase==='typing'),'Real desktop visibly types after its initially hidden window appears');
  assert(motion.frames.some(frame=>frame.rendered&&frame.phase==='moving'),'Real desktop visibly flies into the sidebar');
  motion.renderedCurve=await verifyRenderedFlight(page,motion.flight,true);checkLaunchMotion(motion.frames,'desktop',motion.renderedCurve);
  if(variant==='source'){
    const fixture=await app.evaluate(()=>globalThis.__launchFixture);report.scenes['desktop-fixture']=fixture;
    assert(fixture.requests.some(request=>/^https:\/\/(www\.)?meta\.ai\/$/.test(request.url)),'Official initial chat URL was preloaded');
    assert(fixture.requests.every(request=>request.method==='GET'),'Startup makes no model or write request');
    assert(fixture.nativeFrames.some(frame=>frame.views.length>0&&frame.views.every(view=>!view.visible)));
    report.scenes['desktop-native-visibility']=assertNativeLaunchHidden(fixture);
    pass('Optional FFmpeg discovery runs behind the first window and every native sample remains hidden throughout visible typing and flight');
  }
  await page.screenshot({path:path.join(output,'desktop-settled.png')});
  pass('Real Electron cold launch preloads the initial chat behind a hidden native view, then reveals it after animation in an isolated profile');
  await page.reload();await page.waitForFunction(()=>Boolean(window.musebench?.launch));
  assert.equal(await page.evaluate(()=>window.musebench.launch.active),false,'Renderer reload cannot claim process launch again');
  assert.equal(await page.locator('.launch-overlay').count(),0);await settled(page);
  await app.evaluate(({app})=>app.emit('second-instance',{},[],''));
  assert.equal(await page.locator('.launch-overlay').count(),0);
  pass('Renderer reload and second-instance activation do not replay the desktop intro');
  await app.close();app=null;
  if(variant==='source'){
    ({page}=await launchDesktop({earlyReveal:true}));await settled(page);
    const earlyReveal=report.scenes['desktop-early-reveal-control']=await app.evaluate(()=>globalThis.__launchFixture);
    assert.equal(earlyReveal.forcedReveal,true,'Negative control reveals a native view during observed typing');
    assert.throws(()=>assertNativeLaunchHidden(earlyReveal),/visible before renderer completion/);
    pass('A native reveal between polling samples during typing is rejected by ordered visibility proof');
    await app.close();app=null;
    ({page}=await launchDesktop({dropCompletion:true}));
    await settled(page);
    assert((await app.evaluate(()=>globalThis.__launchFixture.droppedCompletions))>0,'Fault fixture drops renderer completion');
    await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow())?.contentView.children.some(view=>view.webContents&&view.getVisible())),'main process deadline releases native view after lost completion',6000);
    report.scenes['desktop-fail-open']=await app.evaluate(()=>globalThis.__launchFixture);
    pass('Main-process deadline releases the native chat even when renderer completion is lost');
    await app.close();app=null;
  }
}

try{
  if(!process.argv.includes('--desktop-only'))await checkBrowser();
  if(!process.argv.includes('--browser-only'))await checkDesktop();
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){
  report.status='failed';report.error=String(error.stack??error);console.error(error);process.exitCode=1;
  report.failureObservation=await lastPage?.evaluate(()=>window.__launchObservation).catch(()=>null);
  report.failureDocument=await lastPage?.evaluate(()=>({url:location.href,title:document.title,readyState:document.readyState,rootChildren:document.querySelector('#root')?.childElementCount??null,launchActive:document.documentElement.dataset.launchActive??null,overlay:document.querySelector('.launch-overlay')?.getAttribute('data-phase')??null})).catch(()=>null);
  console.error('Launch diagnostics:',JSON.stringify(Object.fromEntries(Object.entries(report.scenes).filter(([,scene])=>scene?.frames).map(([name,scene])=>[name,{appMountMs:scene.appObservedAt===undefined?null:Math.round(scene.appObservedAt-scene.startedAt),phases:scene.frames.reduce((counts,frame)=>({...counts,[frame.phase??'settled']:(counts[frame.phase??'settled']??0)+1}),{})}]))));
  console.error('Load diagnostics:',JSON.stringify({document:report.failureDocument,scenes:report.sceneLoads}));
  await lastPage?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
}
finally{await app?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(`Report: ${path.join(output,'report.json')}`);}
