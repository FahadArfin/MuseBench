import {createServer} from 'vite';
import {build} from 'esbuild';
import {chromium,_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

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
  const result=window.__launchObservation={frames:[],startedAt:performance.now(),timeOrigin:performance.timeOrigin};
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

async function browserScene(name,{query='?launch=1',viewport={width:1440,height:960},reducedMotion='no-preference',preferences={},brokenAnimation=false,slowFirstPaint=0,skip}={}){
  const page=lastPage=await browser.newPage({viewport,reducedMotion,...(name==='preview-launch'?{recordVideo:{dir:output,size:viewport}}:{})});
  page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(`${name}: ${error.message}`));
  const load=report.sceneLoads??={};load[name]={failedRequests:[],failedResponses:[],crashed:false};
  page.on('crash',()=>{load[name].crashed=true;});
  page.on('requestfailed',request=>{if(new URL(request.url()).hostname==='127.0.0.1')load[name].failedRequests.push({url:request.url(),error:request.failure()?.errorText});});
  page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).hostname==='127.0.0.1')load[name].failedResponses.push({url:response.url(),status:response.status()});});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    // Reproduce a delayed renderer bundle without changing presentation timing.
    if(name==='preview-launch'&&process.argv.includes('--slow-renderer')&&/\/assets\/index-[^/]+\.js$/.test(url.pathname))await delay(7000);
    return route.continue();
  });
  await page.addInitScript(observeLaunch);
  await page.addInitScript(({preferences,brokenAnimation,slowFirstPaint})=>{
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
  },{preferences,brokenAnimation,slowFirstPaint});
  await page.goto(`${server.resolvedUrls.local[0]}__startup__/index.html${query}`,{waitUntil:'domcontentloaded'});
  if(name==='preview-launch'||name==='light-launch'){
    await page.waitForFunction(()=>{const letter=document.querySelector('.launch-name>span:last-child');return letter&&Number(getComputedStyle(letter).opacity)>.9;});
    await page.screenshot({path:path.join(output,name==='preview-launch'?'launch-centered.png':'light-launch-centered.png')});
  }
  if(skip){await page.locator('.launch-overlay[data-phase="typing"]').waitFor();await skip(page);}
  await settled(page);await page.locator('.app').waitFor();
  const evidence=await observation(page);report.scenes[name]=evidence;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name}: no horizontal overflow`);
  assert.equal(await page.locator('.launch-content').getAttribute('inert'),null,`${name}: launch must release app interaction`);
  await page.screenshot({path:path.join(output,`${name}.png`)});
  return {page,frames:evidence.frames};
}

function checkLaunchMotion(frames,label){
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
  const duration=landed.at-moving[0].at;
  const progress=frame=>(centered.mark.x-frame.mark.x)/(centered.mark.x-landed.mark.x);
  const atFraction=fraction=>moving.reduce((nearest,frame)=>Math.abs(frame.at-moving[0].at-duration*fraction)<Math.abs(nearest.at-moving[0].at-duration*fraction)?frame:nearest,moving[0]);
  const quarter=progress(atFraction(.25)),middle=progress(atFraction(.5)),threeQuarter=progress(atFraction(.75));
  assert(quarter>.01&&quarter<.25,'Flight accelerates gently instead of darting across most of the distance immediately');
  assert(middle>.35&&middle<.8,'Flight develops its main movement through the middle of the transition');
  assert(middle-quarter>quarter&&middle-quarter>1-threeQuarter,'Flight accelerates out and slows down into the title');
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
      if(file==='/index.html'){bytes=Buffer.from(bytes.toString().replace('<head>','<head><script src="./fixture.js"></script>'));res.setHeader('Content-Type','text/html');}
      else res.setHeader('Content-Type',file.endsWith('.woff2')?'font/woff2':file.endsWith('.css')?'text/css':'text/javascript');
      res.end(bytes);
    }catch{res.statusCode=404;res.end();}
  });}}]});await server.listen();
  browser=await chromium.launch({headless:true});
  const normal=await browserScene('preview-launch');
  checkLaunchMotion(normal.frames,'dark theme');
  pass('Preview types the large blue Muse AI wordmark in the center, animates to the actual sidebar brand, and releases interaction in under 2.35 seconds');
  pass('One cursor follows softly revealed glyphs and withdraws before gentle acceleration, deceleration and a seamless text/icon handoff');
  await normal.page.getByRole('button',{name:'Muse Code',exact:true}).click();
  await normal.page.getByRole('textbox',{name:'Message Muse',exact:true}).waitFor();
  assert.equal(await normal.page.locator('.launch-overlay').count(),0);
  await normal.page.getByRole('button',{name:'Muse AI',exact:true}).click();
  assert.equal(await normal.page.locator('.launch-overlay').count(),0);
  pass('Switching between Muse AI and Muse Code does not replay launch');
  const video=normal.page.video();await normal.page.close();if(video)await video.saveAs(path.join(output,'launch-demo.webm'));

  const light=await browserScene('light-launch',{preferences:{theme:'light'}});checkLaunchMotion(light.frames,'light theme');await light.page.close();
  pass('Light theme retains the same typing, cursor, motion and exact sidebar landing');

  const slow=await browserScene('slow-first-paint',{slowFirstPaint:550});checkLaunchMotion(slow.frames,'slow first paint');await slow.page.close();
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

async function launchDesktop({dropCompletion=false}={}){
  const folder=path.join(output,dropCompletion?'desktop-fail-open':'desktop-cold');await mkdir(folder,{recursive:true});
  const env={...process.env,MUSEBENCH_DATA_DIR:path.join(folder,'data'),MUSEBENCH_PROJECTS_DIR:path.join(folder,'projects')};
  delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
  let entry='.';
  if(variant==='source'){
    // Register fictional HTTPS responses before importing the real application.
    // Nothing touches the installed profile or sends a model request.
    entry=path.join(folder,'entry.mjs');
    await writeFile(entry,`import {app,session,ipcMain} from 'electron';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const fixture=globalThis.__launchFixture={requests:[],nativeFrames:[],droppedCompletions:0};
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
ipcMain.handle=(name,handler)=>originalHandle(name,${dropCompletion?'true':'false'}&&name==='musebench:launch-complete'?async()=>{fixture.droppedCompletions++;}:handler);
app.on('browser-window-created',(_event,window)=>{
 if(window.getParentWindow())return;
 window.webContents.on('dom-ready',()=>window.webContents.executeJavaScript(${JSON.stringify(`(${observeLaunch.toString()})();`)}).catch(()=>{}));
 const started=Date.now(),timer=setInterval(()=>{
  if(window.isDestroyed()||Date.now()-started>6500){clearInterval(timer);return;}
  fixture.nativeFrames.push({at:Date.now(),views:window.contentView.children.filter(view=>view.webContents).map(view=>({id:view.webContents.id,url:view.webContents.getURL(),visible:view.getVisible()}))});
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
  checkLaunchMotion(motion.frames,'desktop');
  if(variant==='source'){
    const fixture=await app.evaluate(()=>globalThis.__launchFixture);report.scenes['desktop-fixture']=fixture;
    assert(fixture.requests.some(request=>/^https:\/\/(www\.)?meta\.ai\/$/.test(request.url)),'Official initial chat URL was preloaded');
    assert(fixture.requests.every(request=>request.method==='GET'),'Startup makes no model or write request');
    assert(fixture.nativeFrames.some(frame=>frame.views.length>0&&frame.views.every(view=>!view.visible)));
    const active=motion.frames.filter(frame=>frame.active);
    const first=motion.timeOrigin+active[0].at,last=motion.timeOrigin+active.at(-1).at;
    assert(fixture.nativeFrames.filter(frame=>frame.at>=first&&frame.at<=last).every(frame=>frame.views.every(view=>!view.visible)),'Every sampled native view stays hidden throughout the actual launch animation');
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
  report.failureDocument=await lastPage?.evaluate(()=>({url:location.href,title:document.title,readyState:document.readyState,rootChildren:document.querySelector('#root')?.childElementCount??null,launchActive:document.documentElement.dataset.launchActive??null,overlay:document.querySelector('.launch-overlay')?.getAttribute('data-phase')??null})).catch(()=>null);
  console.error('Launch diagnostics:',JSON.stringify(Object.fromEntries(Object.entries(report.scenes).filter(([,scene])=>scene?.frames).map(([name,scene])=>[name,{appMountMs:scene.appObservedAt===undefined?null:Math.round(scene.appObservedAt-scene.startedAt),phases:scene.frames.reduce((counts,frame)=>({...counts,[frame.phase??'settled']:(counts[frame.phase??'settled']??0)+1}),{})}]))));
  console.error('Load diagnostics:',JSON.stringify({document:report.failureDocument,scenes:report.sceneLoads}));
  await lastPage?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
}
finally{await app?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(`Report: ${path.join(output,'report.json')}`);}
