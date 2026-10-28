// Real browser font verification against the preview and production renderer.
// Uses fictional data, blocks external requests, and needs `npm run build` first.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {createServer} from 'vite';
import {chromium} from 'playwright';

function installFixture(){
 const sample='### A clearer project overview\n\nReadable interface text with **bold emphasis**, *italic emphasis*, and inline `project.title` code. This is fictional sample content.\n\n```ts\nconst greeting = "Hello, Muse";\nconst ready = items.length >= 1 && status !== "blocked";\n```\n\nKeep the conversation comfortable to read while code remains easy to scan.';
 const transform=state=>{const next=structuredClone(state);if(next.task?.id==='preview-overview')next.task.messages=next.task.messages.map(message=>message.role==='assistant'?{...message,text:sample}:message);return next;};
 let bridge;
 Object.defineProperty(window,'musebench',{configurable:true,get:()=>bridge,set:value=>{bridge={...value,getState:async()=>transform(await value.getState()),onState:listener=>value.onState(state=>listener(transform(state)))};}});
 window.__typographyCsp=[];
 document.addEventListener('securitypolicyviolation',event=>window.__typographyCsp.push({directive:event.effectiveDirective,url:event.blockedURI}));
}

const output=path.resolve(process.argv[2]??'artifacts/typography');
await mkdir(output,{recursive:true});
await readFile('dist/index.html'); // A missing production build is an actionable failure.
const fixture=(await build({stdin:{contents:"import {createPreviewBridge} from './src/preview/bridge.ts';window.musebench=createPreviewBridge();",resolveDir:process.cwd()},bundle:true,write:false,loader:{'.md':'text'},format:'iife',platform:'browser'})).outputFiles[0].text;
const server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-typography',server:{host:'127.0.0.1',port:0,strictPort:true,open:false},plugins:[{name:'typography-production-fixture',configureServer(vite){vite.middlewares.use('/__typography__',async(req,res)=>{
 const file=(req.url??'').split('?')[0];
 try{
  if(file==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
  if(file!=='/index.html'&&!/^\/assets\/[a-zA-Z0-9._-]+$/.test(file)){res.statusCode=404;res.end();return;}
  let bytes=await readFile(path.join(process.cwd(),'dist',file));
  if(file==='/index.html'){bytes=Buffer.from(bytes.toString().replace('</head>','<script src="./fixture.js"></script></head>'));res.setHeader('Content-Type','text/html');}
  else res.setHeader('Content-Type',file.endsWith('.woff2')?'font/woff2':file.endsWith('.css')?'text/css':'text/javascript');
  res.end(bytes);
 }catch{res.statusCode=404;res.end();}
 });}}]});
const report={status:'running',scenes:[],typing:[],errors:[]};
let browser;
try{
 await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({headless:true});
 for(const target of ['preview','production']){
  const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),fontRequests=[],external=[];
  page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(`${target}: ${error.message}`));
  page.on('response',response=>{if(response.request().resourceType()==='font')fontRequests.push({url:response.url(),status:response.status()});});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/__musebench_snapshots/manifest.json')return route.fulfill({json:{version:1,pages:{}}});
   if(url.origin===origin)return route.continue();
   external.push(url.href);return route.abort();
  });
  await page.addInitScript(installFixture);
  await page.goto(origin+(target==='preview'?'/preview.html':'/__typography__/index.html'),{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('button',{name:'Muse Code',exact:true}).click();
  await page.locator('.assistant-message pre code').waitFor();
  const cdp=await context.newCDPSession(page),loadedFaces=new Map();await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  async function renderedFont(selector,family){
   await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
   // Record each face while its content is present; later scenes may release it.
   for(const face of await page.evaluate(()=>[...document.fonts].filter(font=>font.status==='loaded').map(font=>({family:font.family,style:font.style,weight:font.weight,status:font.status}))))loadedFaces.set(`${face.family}:${face.style}:${face.weight}`,face);
   const {root}=await cdp.send('DOM.getDocument'),{nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});
   assert(nodeId,`${target}: missing ${selector}`);
   const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
   assert(fonts.some(font=>font.isCustomFont&&font.glyphCount>0&&font.familyName.includes(family)),`${target}: ${selector} did not render bundled ${family}: ${JSON.stringify(fonts)}`);
   return {selector,computed:await page.locator(selector).first().evaluate(node=>{const s=getComputedStyle(node);return {family:s.fontFamily,weight:s.fontWeight,style:s.fontStyle};}),rendered:fonts};
  }
  async function capture(name){
   await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
   await page.waitForFunction(()=>document.getAnimations().filter(animation=>animation.effect?.target?.matches('.typed-text > span')&&animation.effect.target.getBoundingClientRect().width>0).every(animation=>animation.playState==='finished'));
   const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
   assert(overflow.scrollWidth<=overflow.width+1,`${target}/${name}: horizontal viewport overflow`);
   await page.screenshot({path:path.join(output,`${target}-${name}.png`)});
   report.scenes.push({target,name,viewport:page.viewportSize(),overflow});
  }
  const fonts=[];
  for(const selector of ['.assistant-message .markdown > p','.assistant-message strong','.assistant-message em','textarea[aria-label="Message Muse"]','button[aria-label="Approval access"]','.product-name .typed-text'])fonts.push(await renderedFont(selector,'Inter'));
  fonts.push(await renderedFont('.assistant-message pre code','JetBrains Mono'));
  fonts.push(await renderedFont('.assistant-message p code','JetBrains Mono'));
  await capture('conversation-desktop');
  for(const width of [700,430,390]){await page.setViewportSize({width,height:844});await capture(`conversation-${width}`);}
  await page.setViewportSize({width:1440,height:960});
  await page.keyboard.press('Control+,');
  const settings=page.getByRole('dialog',{name:'Settings',exact:true});
  await settings.getByRole('combobox',{name:'Response font',exact:true}).selectOption('mono');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.documentElement.dataset.font==='mono');
  for(const selector of ['.assistant-message .markdown > p','.assistant-message strong','.assistant-message em'])fonts.push(await renderedFont(selector,'JetBrains Mono'));
  for(const selector of ['textarea[aria-label="Message Muse"]','button[aria-label="Approval access"]','.response-actions'])fonts.push(await renderedFont(selector,'Inter'));
  await capture('monospace-response');
  await page.keyboard.press('Control+,');await settings.getByRole('combobox',{name:'Response font',exact:true}).selectOption('system');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await page.getByRole('heading',{name:'What would you like to build?',exact:true}).waitFor();
  await page.waitForFunction(()=>document.getAnimations().filter(animation=>animation.effect?.target?.matches('.typed-text > span')&&animation.effect.target.getBoundingClientRect().width>0).every(animation=>animation.playState==='finished'));
  report.typing.push({target,letters:await page.evaluate(()=>[...document.querySelectorAll('.typed-text > span')].filter(node=>node.getBoundingClientRect().width>0).map(node=>({text:node.textContent,opacity:Number(getComputedStyle(node).opacity)})))});
  fonts.push(await renderedFont('.typed-welcome .typed-text','Inter'));
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.typed-text').length>0&&[...document.querySelectorAll('.typed-text > span')].every(node=>getComputedStyle(node).animationIterationCount!=='infinite')),true,'Typing animation must finish');
  await capture('new-chat-desktop');
  await page.setViewportSize({width:390,height:844});await capture('new-chat-390');
  const loaded=[...loadedFaces.values()];
  report[target]={fonts,loaded,fontRequests,external};
  for(const family of ['Inter Variable','JetBrains Mono Variable'])for(const style of ['normal','italic'])assert(loaded.some(font=>font.family.replaceAll('"','')===family&&font.style===style),`${target}: ${family} ${style} did not load`);
  assert(fontRequests.length>=4,`${target}: expected local sans and mono font files, including italics`);
  assert(fontRequests.every(request=>new URL(request.url).origin===origin&&request.status===200),`${target}: font request failed or went off origin`);
  assert.deepEqual(external,[],`${target}: attempted external request`);
  const csp=await page.evaluate(()=>window.__typographyCsp);report[target].csp=csp;assert.deepEqual(csp,[],`${target}: CSP violation`);
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert(report.typing.every(scene=>scene.letters.every(letter=>letter.opacity>.99)),'Finished typing animation left visible letters transparent');report.status='passed';console.log(`Typography smoke passed: ${report.scenes.length} scenes; real bundled fonts, local requests, strict production CSP, responsive layouts, and response preferences.`);
}catch(error){report.status='failed';report.failure=String(error);throw error;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();}
