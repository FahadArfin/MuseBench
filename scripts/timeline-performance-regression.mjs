// Real DOM regression checks with fictional conversations; no app, model, or network.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

export async function runTimelineRegression({source=new URL('../src/shared/prompt-timeline.mjs',import.meta.url),out}={}){
 const {mountPromptTimeline}=await import(source.href),mountSource=mountPromptTimeline.toString();
 const report={sourceSha256:createHash('sha256').update(mountSource).digest('hex'),fixture:'500 fictional prompt/answer pairs in headless Chromium; native DOM geometry',modelRequests:0,externalRequests:[],checks:[],samples:[],errors:[]};
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 page.on('pageerror',error=>report.errors.push(String(error)));
 await page.route('**/*',route=>{report.externalRequests.push(route.request().url());return route.abort();});
 const check=(name,body)=>{body();report.checks.push(name);};
 const frames=()=>page.evaluate(()=>window.fixture.frames(3));
 try{
  await page.setContent(`<!doctype html><style>
   body{margin:0}#scroll{position:absolute;left:40px;top:20px;width:800px;height:600px;overflow:auto;overflow-anchor:none}
   #root{padding:20px 0}article{box-sizing:border-box;margin:0;padding:8px 30px;height:80px}[data-timeline-answer]{height:120px}
  </style><div id="scroll"><main id="root">${Array.from({length:500},(_,i)=>`<article data-timeline-prompt>Prompt ${i+1}</article><article data-timeline-answer>Answer ${i+1}</article>`).join('')}</main></div><div id="host"></div>`);
  await page.evaluate(()=>{
   const nativeRect=Element.prototype.getBoundingClientRect,nativeSet=Element.prototype.setAttribute,nativeRemove=Element.prototype.removeAttribute;
   const counters={promptReads:0,viewportReads:0,currentWrites:0};
   Element.prototype.getBoundingClientRect=function(){if(this.matches('[data-timeline-prompt]'))counters.promptReads++;if(this.id==='scroll')counters.viewportReads++;return nativeRect.call(this);};
   Element.prototype.setAttribute=function(name,value){if(this.tagName==='BUTTON'&&name==='aria-current')counters.currentWrites++;return nativeSet.call(this,name,value);};
   Element.prototype.removeAttribute=function(name){if(this.tagName==='BUTTON'&&name==='aria-current')counters.currentWrites++;return nativeRemove.call(this,name);};
   window.fixture={counters,reset(){for(const key of Object.keys(counters))counters[key]=0;},frames:async(count=3)=>{for(let i=0;i<count;i++)await new Promise(requestAnimationFrame);},current(){return [...document.querySelector('#host').shadowRoot.querySelectorAll('[aria-current="step"]')].map(node=>Number(node.dataset.index));}};
  });
  // Inject the serialized function just as the guarded personal-page adapter does.
  await page.addScriptTag({content:`window.fixture.dispose=(${mountSource})({host:document.querySelector('#host'),root:document.querySelector('#root'),scrollElement:document.querySelector('#scroll'),userSelector:'[data-timeline-prompt]',answerSelector:'[data-timeline-answer]'});`});
  await frames();
  assert.deepEqual(await page.evaluate(()=>window.fixture.current()),[0]);
  async function sample(name,top,want,{bottom=false,unchanged=false}={}){
   const result=await page.evaluate(async top=>{
    const {fixture}=window,scroll=document.querySelector('#scroll');
    await fixture.frames();fixture.reset();scroll.scrollTop=top;scroll.dispatchEvent(new Event('scroll'));await fixture.frames();
    return {...fixture.counters,current:fixture.current(),scrollTop:scroll.scrollTop};
   },top);
   report.samples.push({name,...result,want,bottom,unchanged});
   assert.deepEqual(result.current,[want],name+' selects exactly one correct prompt');
   assert(result.viewportReads>0,name+' ran positioning');
   return result;
  }
  // Hand-calculated boundaries: padding 20, each pair 200, selection line 50.
  await sample('top',0,0,{unchanged:true});
  await sample('before second prompt threshold',169,0,{unchanged:true});
  await sample('exact second prompt threshold',170,1);
  await sample('after second prompt threshold',171,1,{unchanged:true});
  await sample('middle',49970,250);
  await sample('backward scroll',19970,100);
  await sample('near end',99170,496);
  await sample('four pixels before bottom',99436,497);
  await sample('within three pixels of bottom',99437,499,{bottom:true});
  await sample('bottom',1000000,499,{bottom:true,unchanged:true});
  report.checks.push('Top, exact threshold, middle, backward scroll, near-end and bottom selection');

  await sample('before offscreen answer growth',49970,250);
  await page.locator('[data-timeline-answer]').first().evaluate(node=>node.style.height='520px');
  await sample('after offscreen answer growth',49970,248);
  await page.locator('[data-timeline-answer]').first().evaluate(node=>node.style.height='120px');
  await sample('after offscreen answer shrink',49970,250);
  report.checks.push('Live geometry reflects offscreen answer growth and shrink without cached positions');

  await sample('before viewport resize',99438,499,{bottom:true});
  await page.locator('#scroll').evaluate(node=>node.style.height='400px');
  await page.waitForFunction(()=>JSON.stringify(window.fixture.current())==='[497]');
  report.checks.push('ResizeObserver updates active selection when the bottom moves');
  assert.equal(await page.locator('#host').evaluate(node=>node.style.height),'352px');
  await page.locator('#scroll').evaluate(node=>node.style.height='600px');await frames();

  const jump=await page.evaluate(async()=>{
   const {fixture}=window,shadow=document.querySelector('#host').shadowRoot,scroll=document.querySelector('#scroll');
   fixture.reset();shadow.querySelector('[data-index="400"]').click();await fixture.frames();
   const counters={...fixture.counters},prompt=document.querySelectorAll('[data-timeline-prompt]')[400];
   return {...counters,current:fixture.current(),offset:prompt.getBoundingClientRect().top-scroll.getBoundingClientRect().top};
  });
  check('Jump clears the previous current marker and aligns the requested prompt',()=>{assert.deepEqual(jump.current,[400]);assert.equal(jump.offset,20);});
  report.jump=jump;
  await page.locator('#host').getByRole('button').nth(400).focus();
  await page.keyboard.press('Home');await page.keyboard.press('Enter');await frames();
  assert.deepEqual(await page.evaluate(()=>window.fixture.current()),[0]);
  await page.keyboard.press('End');await page.keyboard.press('Enter');await frames();
  assert.deepEqual(await page.evaluate(()=>window.fixture.current()),[499]);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('tooltip').isVisible(),false);
  report.checks.push('Keyboard Home/End/Enter jumps and Escape closes preview');

  await page.locator('#host').getByRole('button').nth(5).evaluate(node=>node.dispatchEvent(new PointerEvent('pointerover',{bubbles:true})));
  const beforeHover=await page.locator('#scroll').evaluate(node=>node.scrollTop);
  assert.match(await page.getByRole('tooltip').innerText(),/Prompt 6\s+Answer 6/);
  await page.locator('[data-timeline-answer]').nth(5).evaluate(node=>node.textContent='Streaming answer continues');
  await page.waitForFunction(()=>document.querySelector('#host').shadowRoot.querySelector('[role="tooltip"]').textContent.includes('Streaming answer continues'));
  assert.equal(await page.locator('#scroll').evaluate(node=>node.scrollTop),beforeHover);
  await page.locator('#host').getByRole('navigation').evaluate(node=>node.dispatchEvent(new PointerEvent('pointerleave')));
  await page.evaluate(()=>document.querySelector('#host').shadowRoot.activeElement?.blur());
  report.checks.push('Hover preview and answer text mutation preserve scroll position');

  await page.locator('#root').evaluate(root=>{root.insertAdjacentHTML('beforeend','<article data-timeline-prompt>New prompt</article><article data-timeline-answer>New answer</article>');});
  await page.waitForFunction(()=>document.querySelector('#host').shadowRoot.querySelectorAll('button').length===501);
  await sample('appended prompt at bottom',1000000,500,{bottom:true});
  await page.locator('[data-timeline-prompt]').nth(10).evaluate(node=>{node.nextElementSibling.remove();node.remove();});
  await page.waitForFunction(()=>document.querySelector('#host').shadowRoot.querySelectorAll('button').length===500);
  await sample('removed earlier prompt at bottom',1000000,499,{bottom:true});
  report.checks.push('Appended and removed prompts rebuild current markers without stale buttons');

  await page.evaluate(()=>{window.previousTimelineButton=document.querySelector('#host').shadowRoot.querySelector('button');const root=document.querySelector('#root');root.innerHTML=root.innerHTML.replace('Prompt 1</article>','Replacement first prompt</article>');});
  await page.waitForFunction(()=>!window.previousTimelineButton.isConnected);
  assert.deepEqual(await page.evaluate(()=>window.fixture.current()),[499]);
  assert.match(await page.locator('#host').getByRole('button').first().getAttribute('aria-label'),/Replacement first prompt/);
  report.checks.push('Same-length node replacement restores one active marker on the new buttons');

  await page.locator('#root').evaluate(root=>root.innerHTML='<article data-timeline-prompt>Replacement prompt</article><article data-timeline-answer>Replacement answer</article>');
  await page.waitForFunction(()=>document.querySelector('#host').shadowRoot.querySelectorAll('button').length===1);
  assert.deepEqual(await page.evaluate(()=>window.fixture.current()),[0]);
  assert.equal(await page.locator('#host').getByRole('navigation',{includeHidden:true}).evaluate(node=>node.hidden),true);
  await page.locator('#root').evaluate(root=>root.replaceChildren());
  await page.waitForFunction(()=>document.querySelector('#host').shadowRoot.querySelectorAll('button').length===0);
  assert.deepEqual(await page.evaluate(()=>window.fixture.current()),[]);
  report.checks.push('Conversation replacement and empty history clear old markers');

  const disposed=await page.evaluate(async()=>{
   const {fixture}=window,root=document.querySelector('#root'),host=document.querySelector('#host');
   root.innerHTML='<article data-timeline-prompt>Pending refresh</article>';await Promise.resolve();
   document.dispatchEvent(new Event('scroll'));fixture.dispose();fixture.reset();
   root.append(document.createElement('article'));document.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'));
   await new Promise(resolve=>setTimeout(resolve,160));await fixture.frames();
   return {...fixture.counters,children:host.shadowRoot.childNodes.length,style:host.getAttribute('style')};
  });
  check('Disposal cancels pending work and disconnects scroll, resize and mutation updates',()=>assert.deepEqual(disposed,{promptReads:0,viewportReads:0,currentWrites:0,children:0,style:null}));

  // The same serialized function must still discover a scroll parent, or use the document.
  for(const mode of ['ancestor','document']){
   await page.setContent(`<!doctype html><style>body{margin:0;overflow-anchor:none}#scroll{${mode==='ancestor'?'margin:20px 40px;height:600px;width:800px;overflow:auto;overflow-anchor:none':''}}article{height:100px;margin:0}</style><div id="scroll"><main id="root">${Array.from({length:20},(_,i)=>`<article data-timeline-prompt>Prompt ${i+1}</article>`).join('')}</main></div><div id="host"></div>`);
   await page.addScriptTag({content:`window.timelineDispose=(${mountSource})({host:document.querySelector('#host'),root:document.querySelector('#root'),userSelector:'[data-timeline-prompt]',answerSelector:'[data-timeline-answer]'});`});
   await page.evaluate(mode=>{const scroll=mode==='document'?document.scrollingElement:document.querySelector('#scroll');scroll.scrollTop=750;document.dispatchEvent(new Event('scroll'));},mode);
   await page.waitForFunction(()=>document.querySelector('#host').shadowRoot.querySelector('[aria-current="step"]')?.dataset.index==='8');
   await page.evaluate(mode=>{(mode==='document'?document.scrollingElement:document.querySelector('#scroll')).scrollTop=1000000;document.dispatchEvent(new Event('scroll'));},mode);
   await page.waitForFunction(()=>document.querySelector('#host').shadowRoot.querySelector('[aria-current="step"]')?.dataset.index==='19');
   await page.evaluate(()=>window.timelineDispose());report.checks.push(`Serialized timeline supports ${mode} scrolling`);
  }
  await page.setContent(`<!doctype html><style>body{margin:0}#scroll{height:400px;overflow:auto;overflow-anchor:none}#root{padding-top:100px}article{height:100px;margin:0}article:nth-child(5),article:nth-child(6){height:0}footer{height:800px}</style><div id="scroll"><main id="root">${Array.from({length:20},(_,i)=>`<article data-timeline-prompt>Prompt ${i+1}</article>`).join('')}</main><footer></footer></div><div id="host"></div>`);
  await page.addScriptTag({content:`window.timelineDispose=(${mountSource})({host:document.querySelector('#host'),root:document.querySelector('#root'),scrollElement:document.querySelector('#scroll'),userSelector:'[data-timeline-prompt]',answerSelector:'[data-timeline-answer]'});`});
  for(const {top,want} of [{top:0,want:0},{top:449,want:3},{top:450,want:6},{top:451,want:6}]){
   await page.locator('#scroll').evaluate((node,top)=>{node.scrollTop=top;node.dispatchEvent(new Event('scroll'));},top);
   await page.waitForFunction(want=>JSON.stringify([...document.querySelector('#host').shadowRoot.querySelectorAll('[aria-current="step"]')].map(node=>Number(node.dataset.index)))===JSON.stringify([want]),want);
  }
  await page.evaluate(()=>window.timelineDispose());report.checks.push('Before-first fallback and tied prompt tops select the last qualifying prompt');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
  // Read budget is per positioning pass: native geometry remains live, not cached.
  report.budgetFailures=report.samples.flatMap(sample=>{
   const failures=[];
   if(sample.promptReads>(sample.bottom?0:9*sample.viewportReads))failures.push(`${sample.name}: ${sample.promptReads} prompt geometry reads across ${sample.viewportReads} positions`);
   if(sample.currentWrites>2*sample.viewportReads)failures.push(`${sample.name}: ${sample.currentWrites} current-marker writes across ${sample.viewportReads} positions`);
   if(sample.unchanged&&sample.currentWrites!==0)failures.push(`${sample.name}: unchanged selection made ${sample.currentWrites} current-marker writes`);
   return failures;
  });
  assert.deepEqual(report.budgetFailures,[],'Scroll work must stay bounded for a 500-prompt history');
  report.checks.push('At most 9 prompt geometry reads per non-bottom position, zero at bottom, and at most 2 active-marker writes');
  report.status='passed';
 }catch(error){report.status='failed';report.failure=error.stack;throw Object.assign(error,{report});}
 finally{await browser.close();if(out){await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');}}
 return report;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;
 const source=value('--source'),out=path.resolve(value('--out')??'artifacts/timeline-performance/report.json');
 try{const report=await runTimelineRegression({...(source?{source:pathToFileURL(path.resolve(source))}:{}),out});console.log(JSON.stringify({status:report.status,checks:report.checks,samples:report.samples,out},null,2));}
 catch(error){console.error(error.message);console.error('Report: '+out);process.exitCode=1;}
}
