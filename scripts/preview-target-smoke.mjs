// Real DOM capture/privacy tests; no provider or personal data.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const module=await import('../src/shared/preview-target.mjs').catch(()=>({}));
assert.equal(typeof module.capturePreviewTarget,'function','Fixed visible-target capture must exist');
const {capturePreviewTarget}=module;
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}});
 await page.setContent(`<!doctype html><html><head><title>Preview title</title><style>body{margin:20px;font:16px sans-serif}section{width:500px;min-height:150px;padding:20px}button{padding:10px} .hidden{display:none}.invisible{visibility:hidden}.away{position:absolute;top:10000px}</style></head><body><button onclick="window.clicked=true">Build something</button><section>Visible summary <input value="INPUT_SECRET"><textarea>TEXTAREA_SECRET</textarea><select><option>SELECT_SECRET</option></select><span contenteditable>EDIT_SECRET</span><span hidden>HIDDEN_SECRET</span><span class="hidden">DISPLAY_SECRET</span><span class="invisible">VISIBILITY_SECRET</span><span aria-hidden="true">ARIA_SECRET</span><span class="away">AWAY_SECRET</span><script type="application/json">SCRIPT_SECRET</script></section><p id="long"></p><iframe srcdoc="<h1>INNER_SECRET</h1>"></iframe></body></html>`);
 const read=request=>page.evaluate('('+capturePreviewTarget.toString()+')(document,'+JSON.stringify(request)+')');
 const button=await page.locator('button').boundingBox(),selected=await read({x:(button.x+10)/900,y:(button.y+10)/700});
 assert.equal(selected.tag,'button');assert.equal(selected.text,'Build something');assert.equal(selected.title,'Preview title');assert.equal(await page.evaluate(()=>window.clicked),undefined);
 const privacy=await read({selector:'html > body:nth-of-type(1) > section:nth-of-type(1)'});assert.equal(privacy.text,'Visible summary');assert.doesNotMatch(JSON.stringify(privacy),/SECRET|value=/);
 const inputBox=await page.locator('input').boundingBox();const control=await read({x:(inputBox.x+2)/900,y:(inputBox.y+2)/700});assert.equal(control.text,'');
 const frame=await read({selector:'html > body:nth-of-type(1) > iframe:nth-of-type(1)'});assert.equal(frame.text,'');
 await page.locator('#long').evaluate(element=>{for(let i=0;i<1500;i++)element.append(document.createTextNode('visible text '));});
 const long=await read({selector:'html > body:nth-of-type(1) > p:nth-of-type(1)'});assert(long.text.length<=600);
 await page.locator('button').evaluate(e=>e.style.display='none');assert.equal(await read({selector:selected.selector}),null);
 assert.equal(await read({x:-1,y:.2}),null);assert.equal(await read({x:.2,y:2}),null);
 console.log('PASS visible DOM evidence, form/editable/hidden/offscreen privacy, bounded text, nested frame isolation, no click activation');
}finally{await browser.close();}
