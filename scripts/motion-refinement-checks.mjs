import assert from 'node:assert/strict';

const settle=page=>page.evaluate(async()=>{
 document.body.getBoundingClientRect();
 await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished));
});

async function frames(button,native=false){
 return button.evaluate((button,native)=>new Promise(resolve=>{
  const content=native?button.closest('details'):document.getElementById(button.getAttribute('aria-controls'));
  const samples=[],start=performance.now();
  const sample=()=>{samples.push({t:performance.now()-start,height:content.getBoundingClientRect().height,...(native?{summaryFocused:document.activeElement===button}:{} )});if(performance.now()-start<450)requestAnimationFrame(sample);else resolve(samples);};
  samples.push({t:0,height:content.getBoundingClientRect().height});button.click();requestAnimationFrame(sample);
 }),native);
}
const interpolates=samples=>{
 const low=Math.min(samples[0].height,samples.at(-1).height),high=Math.max(samples[0].height,samples.at(-1).height);
 return high-low>5&&samples.some(s=>s.t>0&&s.height>low+1&&s.height<high-1);
};

export async function checkMotionRefinements({page,pass,report,shot}){
 const activity=page.locator('.run-activity-toggle').first();
 report.samples.activityExpand=await frames(activity);
 assert(interpolates(report.samples.activityExpand),'Request activity must expand through intermediate heights');
 await shot('activity-expanded');
 const summary=page.locator('.work-activity-item > summary').first();
 report.samples.toolExpand=await frames(summary,true);
 assert(interpolates(report.samples.toolExpand),'Native tool details must expand smoothly');
 const output=page.locator('.work-item-body pre').first();
 await output.focus();
 report.samples.toolCollapse=await frames(summary,true);
 assert(interpolates(report.samples.toolCollapse),'Native tool details must collapse smoothly');
 assert(report.samples.toolCollapse.slice(1).every(s=>s.summaryFocused),'Closing tool details must immediately return descendant focus to the summary');
 await settle(page);
 assert.equal(await output.isVisible(),false,'Closed native details must hide their output');
 assert(await summary.evaluate(el=>!el.closest('details').querySelector('.work-item-body').contains(document.activeElement)),'Closed tool details must not retain focus in hidden output');
 await summary.press('Enter');await settle(page);
 assert(await output.isVisible(),'Native summary keyboard activation remains available');
 await summary.press('Enter');await page.keyboard.press('Tab');
 assert(await output.evaluate(el=>document.activeElement!==el),'Tab must skip output while native details is still collapsing');
 await settle(page);await summary.press('Enter');await settle(page);
 await output.focus();assert(await output.evaluate(el=>document.activeElement===el),'Reopening details must restore keyboard access');
 const nested=await page.evaluate(async()=>{
  const outer=document.createElement('details');outer.open=true;
  outer.innerHTML='<summary>Outer fixture</summary><details open><summary>Inner fixture</summary><button>Nested action</button></details><div inert>Unavailable action</div>';
  document.querySelector('.app').append(outer);
  const inner=outer.querySelector('details'),action=inner.querySelector('button'),unavailable=outer.lastElementChild;
  outer.open=false;await Promise.resolve();inner.open=false;await Promise.resolve();
  outer.open=true;await Promise.resolve();
  const closedInnerProtected=action.inert&&!inner.inert&&unavailable.inert;
  inner.open=true;await Promise.resolve();const reopenedAccessible=!action.inert&&unavailable.inert;
  outer.remove();return {closedInnerProtected,reopenedAccessible};
 });assert.deepEqual(nested,{closedInnerProtected:true,reopenedAccessible:true},'Nested disclosures must retain their own closed state and existing inert restrictions');
 await shot('tool-detail');
 await output.focus();
 report.samples.activityCollapse=await frames(activity);
 assert(interpolates(report.samples.activityCollapse),'Activity collapse must retain content until motion ends');
 assert(await activity.evaluate(button=>document.activeElement===button));
 assert.equal(await page.locator('.run-activity .work-item-body').count(),0,'Closed activity releases its hidden output DOM');
 const reversal=await activity.evaluate(button=>new Promise(resolve=>{
  const content=document.getElementById(button.getAttribute('aria-controls'));let count=0;
  const toggle=()=>{button.click();if(++count<7)setTimeout(toggle,38);else setTimeout(()=>resolve({open:button.getAttribute('aria-expanded'),height:content.getBoundingClientRect().height,inert:content.inert,rows:content.querySelectorAll('.work-activity-item').length,animations:content.getAnimations({subtree:true}).length}),420);};toggle();
 }));
 assert.equal(reversal.open,'true');assert.equal(reversal.inert,false);assert(reversal.height>20);assert(reversal.rows>0);assert.equal(reversal.animations,0);
 await activity.click();await settle(page);
 pass('Activity and native tool details interpolate, reverse, preserve keyboard use and release closed output');

 await page.getByRole('button',{name:'View changes',exact:true}).click();await settle(page);
 const diff=page.locator('.diff-file-toggle').first();
 await page.locator('.diff-code').first().focus();
 report.samples.diffCollapse=await frames(diff);
 assert(interpolates(report.samples.diffCollapse),'File diff collapse must interpolate');
 assert(await diff.evaluate(button=>document.activeElement===button));
 assert.equal(await page.locator('.diff-code').count(),0,'Collapsed diffs release their code rows');
 report.samples.diffExpand=await frames(diff);assert(interpolates(report.samples.diffExpand));
 await shot('file-diff');
 const editor=page.locator('.diff-editor-menu > summary').first();
 await editor.click();assert(await page.getByRole('button',{name:'Open in VS Code',exact:true}).isVisible());
 await editor.press('Escape');await page.getByRole('button',{name:'Close details panel',exact:true}).click();
 pass('Diff collapse preserves focus and laziness; the positioned editor menu remains usable');

 await page.getByRole('button',{name:'Toggle Sub-Agents panel',exact:true}).click();await settle(page);
 const nav=await page.getByRole('tab',{name:/Agents & workflows/}).evaluate(button=>new Promise(resolve=>{
  button.click();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(document.querySelector('.work-thread-list').getAnimations().filter(a=>a.playState==='running').length)));
 }));assert(nav>0,'Sub-Agent tab navigation should fade its content');await settle(page);await shot('sub-agents');
 await page.getByRole('button',{name:'Close Sub-Agents',exact:true}).click();
 pass('Sub-Agent navigation uses a content fade');

 await page.getByRole('button',{name:'Muse AI',exact:true}).click();await settle(page);
 // Chat and Work are mounted separately; the arriving control must animate too.
 if(await page.getByRole('button',{name:'Expand Meta AI Chat',exact:true}).count())await page.getByRole('button',{name:'Expand Meta AI Chat',exact:true}).click();
 await settle(page);
 const indicator=await page.getByRole('button',{name:'Work',exact:true}).evaluate(button=>new Promise(resolve=>{
  button.click();requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const switcher=[...document.querySelectorAll('.work-mode-switch')].find(e=>e.checkVisibility());
   const thumb=switcher?.querySelector('.work-mode-indicator');
   resolve({running:thumb?.getAnimations().filter(a=>a.playState==='running').length??0,hostTransform:getComputedStyle(document.querySelector('.personal-browser-slot')).transform});
  }));
 }));assert(indicator.running>0,'The arriving Work control should move its selected indicator');assert.equal(indicator.hostTransform,'none');
 await settle(page);await shot('work-selector');
 const workRecents=page.locator('.work-recents-heading .sidebar-section-toggle');
 report.samples.workRecents=await frames(workRecents);
 assert(interpolates(report.samples.workRecents),'Saved Work recents must collapse smoothly');
 await workRecents.click();await settle(page);
 const aligned=await page.locator('.work-workspace .work-mode-switch').evaluate(el=>{
  const a=el.querySelector('.work-mode-indicator').getBoundingClientRect(),b=el.querySelector('[aria-pressed="true"]').getBoundingClientRect();
  return Math.max(Math.abs(a.x-b.x),Math.abs(a.width-b.width),Math.abs(a.y-b.y),Math.abs(a.height-b.height));
 });assert(aligned<1.1,'Selection pill should align with its selected button');
 const selectorReversals=()=>page.evaluate(async()=>{
  const result=[];
  const visible=()=>[...document.querySelectorAll('.work-mode-switch')].find(el=>el.checkVisibility());
  const fraction=el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41/(el.getBoundingClientRect().width+2);
  for(const label of ['Chat','Work','Chat','Work']){
   await new Promise(resolve=>setTimeout(resolve,55));
   const before=fraction(visible().querySelector('.work-mode-indicator'));
   visible().querySelector(`[aria-label="${label}"]`).click();
   await new Promise(resolve=>requestAnimationFrame(()=>{
    const el=visible().querySelector('.work-mode-indicator'),animation=el.getAnimations()[0];
    if(animation){animation.pause();animation.currentTime=0;}
    result.push({before,after:fraction(el)});animation?.play();resolve();
   }));
  }
  return result;
 });
 const reversals=await selectorReversals();report.samples.selectorReversals=reversals;
 assert(reversals.every(({before,after})=>Math.abs(before-after)<.04),'Rapid mode reversals must begin at the previous visible pill position');
 await settle(page);
 await page.getByRole('button',{name:'All spaces',exact:true}).click();await settle(page);
 const spaceReversals=await selectorReversals();report.samples.spaceSelectorReversals=spaceReversals;
 assert(spaceReversals.every(({before,after})=>Math.abs(before-after)<.04),'The remounted Spaces selector must continue from its previous visible position');
 await settle(page);
 await page.getByRole('button',{name:'New work',exact:true}).click();await settle(page);
 await page.getByRole('button',{name:'Chat',exact:true}).click();await settle(page);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'Work',exact:true}).click();
 assert.equal(await page.locator('.work-workspace .work-mode-indicator').evaluate(el=>el.getAnimations().length),0);
 await page.getByRole('button',{name:'Chat',exact:true}).click();
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();await settle(page);
 const noMotion=await frames(activity);assert(noMotion.slice(1).every(s=>Math.abs(s.height-noMotion.at(-1).height)<1));
 const nativeNoMotion=await frames(summary,true);assert(nativeNoMotion.slice(1).every(s=>Math.abs(s.height-nativeNoMotion.at(-1).height)<1));
 await activity.click();await settle(page);
 await page.emulateMedia({reducedMotion:'no-preference'});
 pass('Chat/Work selection moves in place, aligns, and settles instantly with reduced motion');
}
