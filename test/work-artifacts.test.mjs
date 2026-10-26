import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const engine = await import('../src/shared/work-artifacts.mjs').catch(() => ({}));
const document = (overrides = {}) => ({version:1,kind:'document',title:'Quarterly review',summary:'Local analysis',sections:[{heading:'Findings',body:'Revenue grew.'}],...overrides});
const chart = (overrides = {}) => ({title:'Revenue',type:'bar',labels:['Jan','Feb'],values:[10,20],...overrides});

test('validation supplies arrays and returns an independent whitelist-only artifact', () => {
  assert.equal(typeof engine.validateArtifact, 'function');
  const input = document({script:'alert(1)',sections:[{heading:'Findings',body:'Revenue grew.',html:'<script>evil()</script>'}]});
  const result = engine.validateArtifact(input);
  assert.deepEqual(result, {version:1,kind:'document',title:'Quarterly review',summary:'Local analysis',sources:[],metrics:[],charts:[],sections:[{heading:'Findings',body:'Revenue grew.'}],scenes:[]});
  input.sections[0].body = 'Changed';
  assert.equal(result.sections[0].body, 'Revenue grew.');
});

test('malformed roots, output kinds, fields, and wrong-kind empty output are rejected', () => {
  for (const input of [null,[],{},document({version:2}),document({kind:'html'}),document({title:' '}),document({summary:2}),document({sections:null}),document({sections:[]}),document({kind:'slides',sections:[]}),document({kind:'motion'}),document({kind:'dashboard'}),document({sections:[{heading:'A',body:4}]})]) {
    assert.throws(() => engine.validateArtifact(input), /artifact|version|kind|title|summary|section|scene|dashboard|body/i);
  }
  for (const input of [document(),document({kind:'slides'}),document({kind:'motion',scenes:[{title:'A',body:'B',duration:2}]}),document({kind:'dashboard',metrics:[{label:'Revenue',value:'20'}]})]) assert.equal(engine.validateArtifact(input).kind,input.kind);
});

test('artifact bounds reject oversized collections, strings, and total UTF-8 size', () => {
  const invalid = [
    document({title:'a'.repeat(161)}), document({summary:'a'.repeat(4001)}),
    document({sources:Array.from({length:21},()=>({name:'File',detail:'CSV'}))}),
    document({metrics:Array.from({length:13},()=>({label:'A',value:'1'}))}),
    document({charts:Array.from({length:9},()=>chart())}),
    document({sections:Array.from({length:31},()=>({heading:'A',body:'B'}))}),
    document({scenes:Array.from({length:13},()=>({title:'A',body:'B',duration:2}))}),
    document({table:{columns:Array.from({length:13},()=>'A'),rows:[]}}),
    document({table:{columns:['A'],rows:Array.from({length:201},()=>['B'])}}),
    document({sections:Array.from({length:30},()=>({heading:'A',body:'\u{1f600}'.repeat(6000)}))}),
  ];
  for (const input of invalid) assert.throws(()=>engine.validateArtifact(input),/limit|maximum|long|size|bytes|KiB|at most/i);
  assert.equal(engine.validateArtifact(document({title:'a'.repeat(160)})).title.length,160);
});

test('charts require matching labels, finite numeric points, and bounded data', () => {
  for(const bad of [chart({type:'pie'}),chart({labels:['Jan']}),chart({values:[NaN,1]}),chart({values:[Infinity,1]}),chart({values:['10',20]}),chart({labels:[],values:[]}),chart({labels:Array(121).fill('A'),values:Array(121).fill(1)})]) assert.throws(()=>engine.validateArtifact(document({charts:[bad]})),/chart|point|label|value|type/i);
  assert.deepEqual(engine.validateArtifact(document({charts:[chart({values:[-10,0]})]})).charts[0].values,[-10,0]);
});

test('tables reject ragged rows, executable objects, and non-finite cells', () => {
  for(const table of [{columns:[],rows:[]},{columns:['A'],rows:[[]]},{columns:['A'],rows:[[1,2]]},{columns:['A'],rows:[[{html:'x'}]]},{columns:['A'],rows:[[Infinity]]}]) assert.throws(()=>engine.validateArtifact(document({table})),/table|column|row|cell/i);
});

test('motion enforces finite scene durations and a two-minute total', () => {
  for(const duration of [0,1.9,15.1,Infinity,NaN,'4']) assert.throws(()=>engine.validateArtifact(document({kind:'motion',scenes:[{title:'A',body:'B',duration}]})),/duration/i);
  assert.throws(()=>engine.validateArtifact(document({kind:'motion',scenes:Array.from({length:9},()=>({title:'A',body:'B',duration:15}))})),/120|duration/i);
  assert.equal(engine.validateArtifact(document({kind:'motion',scenes:Array.from({length:8},()=>({title:'A',body:'B',duration:15}))})).scenes.length,8);
});

test('HTML treats every model field as text and contains only the trusted CSP-authorized script', () => {
  const hostile = '</script><script>window.pwned=true</script><img src=https://evil.invalid onerror=alert(1)>';
  const data = document({title:hostile,summary:hostile,sources:[{name:hostile,detail:hostile}],metrics:[{label:hostile,value:hostile,change:hostile,detail:hostile}],charts:[chart({title:hostile,labels:[hostile,'B'],unit:'</script><script>window.pwned=true</script>',calculation:hostile,source:hostile})],table:{columns:[hostile],rows:[[hostile]]},sections:[{heading:hostile,body:hostile}],scenes:[{title:hostile,body:hostile,kicker:hostile,duration:2}]});
  const html=engine.renderArtifactHtml(data,{updatedAt:hostile,theme:'light'});
  assert.equal((html.match(/<script\b/gi)||[]).length,1);
  assert.equal((html.match(/<\/script>/gi)||[]).length,1);
  assert.doesNotMatch(html,/<img\b|<script[^>]*src=/i);
  assert.match(html,/&lt;\/script&gt;/);
  const csp=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1].replaceAll('&apos;',"'").replaceAll('&#39;',"'");
  assert(csp?.includes("default-src 'none'"));
  assert(csp?.includes("connect-src 'none'"));
  assert(!/script-src[^;]*(unsafe-inline|unsafe-eval|https?:)/.test(csp));
  const script=html.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
  const nonce=script[1].match(/nonce="([^"]+)"/)?.[1];
  const hash=createHash('sha256').update(script[2]).digest('base64');
  assert(csp.includes(`'nonce-${nonce}'`)||csp.includes(`'sha256-${hash}'`));
});

test('SVG rendering supports empty scales, negative values, and extreme finite magnitudes', () => {
  for(const values of [[0,0],[-4,-2],[-Number.MAX_VALUE,Number.MAX_VALUE],[1e-300,2e-300]]) for(const type of ['bar','line']) {
    const html=engine.renderArtifactHtml(document({charts:[chart({type,values})]}));
    assert.match(html,/<svg/);
    assert.doesNotMatch(html,/(?:NaN|Infinity)/);
  }
});

test('CSV quotes fields and neutralizes spreadsheet formulas including whitespace prefixes', () => {
  const csv=engine.artifactCsv(document({table:{columns:['Name','=SUM(A1:A2)'],rows:[['hello,"world"','line\nbreak'],['=1+1',' +cmd'],['\t=BAD()','@SUM(1)'],[-42,'-cmd']]}}));
  assert.equal(csv,'"Name","\'=SUM(A1:A2)"\r\n"hello,""world""","line\nbreak"\r\n"\'=1+1","\' +cmd"\r\n"\'\t=BAD()","\'@SUM(1)"\r\n"-42","\'-cmd"\r\n');
});

test('Markdown exports analysis and provenance as escaped content', () => {
  const md=engine.artifactMarkdown(document({summary:'<script>bad()</script>',metrics:[{label:'Revenue',value:'20',detail:'10 + 10'}],charts:[chart({calculation:'Sum invoices',source:'ledger.csv'})],sources:[{name:'ledger.csv',detail:'Rows 2-3'}]}));
  assert.match(md,/Quarterly review/); assert.match(md,/10 \+ 10/);assert.match(md,/Sum invoices/);assert.match(md,/ledger\.csv/);assert.match(md,/Rows 2-3/);assert.doesNotMatch(md,/<script>/);
});

test('all demo kinds and teams validate and clearly identify fictional sample provenance', () => {
  for(const kind of ['dashboard','document','slides','motion']) for(const team of ['finance','operations','marketing','sales','analytics','engineering']) {
    const artifact=engine.validateArtifact(engine.demoArtifact(kind,team));
    assert.equal(artifact.kind,kind);assert.match(artifact.title,/fictional/i);assert.match(artifact.summary,/fictional/i);assert(artifact.sources.some(source=>/fictional/i.test(source.name+' '+source.detail)));
    assert(engine.artifactMarkdown(artifact)); assert(engine.artifactCsv(artifact));assert(engine.renderArtifactHtml(artifact));
  }
});

test('validation rejects explicit null summaries and sparse arrays',()=>{
  for(const data of [document({summary:null}),document({sections:Array(1)}),document({charts:[chart({labels:Array(2)})]})]) assert.throws(()=>engine.validateArtifact(data));
});

test('generation request embeds only local source manifests and preserves source paths',()=>{
  const prompt=engine.artifactPrompt({item:{kind:'document',title:'Review'},text:'Explain the quarter.',sources:[{name:'Revenue.csv',path:'inputs/id-Revenue.csv',bytes:40,content:'PRIVATE FILE CONTENT'}]});
  assert.match(prompt,/inputs\/id-Revenue\.csv/);assert.match(prompt,/Explain the quarter\./);assert.doesNotMatch(prompt,/PRIVATE FILE CONTENT/);
  assert.throws(()=>engine.artifactPrompt({item:{kind:'script'},text:''}));
});

test('content-only generation uses native file tools while retaining managed source analysis',()=>{
  const prompt=engine.artifactPrompt({item:{kind:'document',title:'Review'},text:'Change the heading only; no shell commands.'});
  assert.match(prompt,/native read_file and write_file tools/i);
  assert.match(prompt,/For content-only changes, do not run shell commands/i);
  assert.match(prompt,/app validates the artifact schema/i);
  assert.match(prompt,/managed sandbox commands only when the user requests them or source-data analysis requires them/i);
  assert.match(prompt,/including necessary calculations/i);
  assert.match(prompt,/existing sandbox and permission controls/i);
});

test('standalone dashboard interactions, CSP, slide navigation, and Motion seek work in Chromium', {timeout:30000}, async()=>{
  assert.equal(typeof engine.renderArtifactHtml,'function');
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({reducedMotion:'reduce'});
    const requests=[],errors=[];page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});page.on('pageerror',error=>errors.push(error.message));
    const navigate=async(artifact,options)=>page.goto('data:text/html;charset=utf-8,'+encodeURIComponent(engine.renderArtifactHtml(artifact,options)));
    await navigate(document({kind:'dashboard',table:{columns:['City','Total'],rows:[['Boston',25],['Toronto',80]]},metrics:[{label:'Total',value:'105',detail:'25 + 80 = 105'}]}));
    await page.getByRole('searchbox').fill('toronto');
    assert.equal(await page.locator('tbody tr:visible').count(),1);
    assert.match(await page.locator('tbody tr:visible').innerText(),/Toronto/);
    await page.locator('.metric summary').click(); assert.match(await page.locator('.metric').innerText(),/25 \+ 80 = 105/);
    await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.pwned=true';document.body.append(script);});
    assert.equal(await page.evaluate(()=>window.pwned),undefined);
    await navigate(document({kind:'slides',sections:[{heading:'One',body:'First'},{heading:'Two',body:'Second'}]}));
    await page.getByRole('button',{name:'Next slide'}).click();assert.match(await page.locator('.slide:visible').innerText(),/Two/);
    await page.keyboard.press('ArrowLeft');assert.match(await page.locator('.slide:visible').innerText(),/One/);
    await navigate(document({kind:'motion',charts:[chart()],scenes:[{title:'First scene',body:'Opening',duration:3},{title:'Second scene',body:'Closing',duration:5}]}));
    const duration=await page.evaluate(()=>window.museMotion.duration);assert.equal(duration,8);
    await page.evaluate(()=>window.museMotion.seek(4));assert.match(await page.locator('.motion-scene:visible').innerText(),/Second scene/);
    const frame=await page.locator('.motion-stage').innerHTML();
    await page.evaluate(()=>window.museMotion.seek(1));assert.match(await page.locator('.motion-scene:visible').innerText(),/First scene/);
    await page.evaluate(()=>window.museMotion.seek(4));assert.equal(await page.locator('.motion-stage').innerHTML(),frame);
    await page.evaluate(()=>window.museMotion.seek(Infinity));assert.equal(await page.locator('.motion-timeline').inputValue(),'0');
    await page.evaluate(()=>window.museMotion.seek(100));assert.equal(await page.locator('.motion-timeline').inputValue(),'8');
    await page.getByRole('button',{name:'Play motion'}).click();assert.equal(await page.getByRole('button',{name:'Pause motion'}).count(),1);
    await page.evaluate(()=>window.museMotion.pause());assert.equal(await page.getByRole('button',{name:'Play motion'}).count(),1);
    await page.setViewportSize({width:1280,height:720});
    await navigate(engine.demoArtifact('motion','finance'),{exportMode:true,width:1280,height:720});
    assert.deepEqual(await page.locator('.motion-stage').boundingBox(),{x:0,y:0,width:1280,height:720});
    assert.equal(await page.locator('.motion-controls:visible').count(),0);
    assert.equal(await page.locator('.artifact-header:visible').count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  } finally {await browser.close();}
});
