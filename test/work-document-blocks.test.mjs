import test from 'node:test';
import assert from 'node:assert/strict';

test('structured documents validate, paginate long tables, preserve source and edit immutably', async () => {
 const mod = await import('../src/shared/work-document-blocks.mjs').catch(()=>null);
 assert.ok(mod, 'structured document model must exist');
 const data=mod.createDocumentData();
 data.blocks=[{id:'h',type:'heading',level:1,runs:[{text:'日本語 report',bold:true}],source:{label:'Evidence',url:'https://example.com'}},{id:'t',type:'table',columns:['Name','Value'],rows:Array.from({length:90},(_,i)=>[String(i),'Entry'])},{id:'break',type:'pageBreak'},{id:'p',type:'paragraph',runs:[{text:'Last page'}]}];
 const clean=mod.validateDocumentData(data); assert.deepEqual(clean,data);
 const pages=mod.paginateDocument(data); assert.ok(pages.length>=4); assert.ok(pages.some(p=>p.blocks.some(b=>b.id==='t'&&b.continuation)));
 const next=mod.applyDocumentOperation(data,{type:'replaceBlock',blockId:'h',block:{...data.blocks[0],runs:[{text:'Changed'}]}});
 assert.equal(data.blocks[0].runs[0].text,'日本語 report'); assert.equal(next.blocks[0].source.url,'https://example.com');
 assert.throws(()=>mod.validateDocumentData({...data,page:{...data.page,marginLeft:900}}),/margin|page/i);
 assert.throws(()=>mod.validateDocumentData({...data,blocks:[{id:'x',type:'image',assetId:'a',width:100,height:0,alt:''}]}),/height/i);
 assert.throws(()=>mod.validateDocumentData({...data,blocks:[{id:'x',type:'paragraph',runs:[{text:'x',onclick:'bad'}]}]}),/unknown|onclick/i);
});

test('HTML document export escapes content and uses physical page dimensions', async()=>{
 const mod=await import('../src/shared/work-document-blocks.mjs').catch(()=>null);assert.ok(mod,'document rendering must exist');
 const data=mod.createDocumentData(); data.page.header='<Header>';data.blocks=[{id:'a',type:'paragraph',runs:[{text:'<script>&',bold:true}]}];
 const html=mod.renderDocumentHtml(data); assert.ok(html.includes('&lt;script&gt;&amp;'));assert.ok(!html.includes('<script>')); assert.match(html,/@page/);assert.match(html,/595.28pt/);assert.match(html,/&lt;Header&gt;/);
});
test('newlines paginate without exceeding the physical content height',async()=>{const mod=await import('../src/shared/work-document-blocks.mjs');const data=mod.createDocumentData();data.blocks=[{id:'manylines',type:'paragraph',runs:[{text:'Line\n'.repeat(100),bold:true}]}];const pages=mod.paginateDocument(data);assert.ok(pages.length>1);assert.ok(pages.every(p=>p.usedHeight<=data.page.height-data.page.marginTop-data.page.marginBottom));assert.equal(pages.flatMap(p=>p.blocks).map(b=>b.runs.map(r=>r.text).join('')).join(''),'Line\n'.repeat(100));});
