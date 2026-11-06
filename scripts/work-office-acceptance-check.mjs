import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {readOfficeArchive} from '../src/work/ooxml-import.mjs';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
const output=path.resolve(process.argv[2]??'artifacts/work-office-acceptance/portable-26.2.4-verified');
const receipt=JSON.parse(await readFile(path.join(output,'report.json'),'utf8'));assert.equal(receipt.status,'passed');
const report={status:'passed',pdfs:{},limitations:[]};
for(const name of ['writer-layout.pdf','impress-layout.pdf']){
 const task=getDocument({data:new Uint8Array(await readFile(path.join(output,name))),isEvalSupported:false});const pdf=await task.promise;let text='',images=0;
 for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);text+=(await page.getTextContent()).items.map(i=>i.str??'').join(' ');const ops=await page.getOperatorList();images+=ops.fnArray.filter(x=>[OPS.paintImageXObject,OPS.paintInlineImageXObject].includes(x)).length;if(n===1||n===pdf.numPages){const viewport=page.getViewport({scale:1.2}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;await writeFile(path.join(output,`${name}-page${n}.png`),canvas.toBuffer('image/png'));}}
 if(name.startsWith('writer')){for(const value of ['Office edited cell','Record 90','FINAL PARAGRAPH'])assert.ok(text.includes(value),`Writer PDF lacks ${value}`);assert.ok(images>0,'Writer image rendered');}
 else for(const value of ['Independent Office editable title','Office edited table'])assert.ok(text.includes(value),`Impress PDF lacks ${value}`);
 report.pdfs[name]={pages:pdf.numPages,imagePaints:images,textCharacters:text.length};await task.destroy();
}
const archive=await readOfficeArchive(await readFile(path.join(output,'office-edited.pptx')),'pptx'),original=await readOfficeArchive(await readFile(receipt.originals.pptx.path),'pptx');
const charts=[...archive.entries].filter(([name])=>/ppt\/charts\/chart\d+\.xml$/.test(name));assert.ok(charts.some(([,bytes])=>/<c:v>99<\/c:v>/.test(bytes.toString())),'Saved native chart cache includes99');
report.chart={nativeChartCacheEdited:true,nativeDataReopened:receipt.pptx.chartAfter,originalHasEmbeddedWorkbook:[...original.entries.keys()].some(n=>n.endsWith('.xlsx')),officeSavedHasEmbeddedWorkbook:[...archive.entries.keys()].some(n=>n.endsWith('.xlsx'))};
if(!report.chart.officeSavedHasEmbeddedWorkbook)report.limitations.push('LibreOffice saves the native chart using internal OOXML chart data without an embedded XLSX workbook. Its native chart provider remained editable after reopen; the unchanged Muse original retains its embedded XLSX.');
await writeFile(path.join(output,'independent-output-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
