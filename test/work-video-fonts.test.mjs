import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readFontCoverage,selectCoveredVideoFonts,createVideoTextRenderer,centerVideoTitleRaster} from '../electron/work-video-fonts.mjs';

function font(points){const groups=points.map((p,i)=>[p,p,i+1]),cmap=Buffer.alloc(12+16+groups.length*12);cmap.writeUInt16BE(1,2);cmap.writeUInt16BE(3,4);cmap.writeUInt16BE(10,6);cmap.writeUInt32BE(12,8);cmap.writeUInt16BE(12,12);cmap.writeUInt32BE(16+groups.length*12,16);cmap.writeUInt32BE(groups.length,24);groups.forEach((g,i)=>g.forEach((v,j)=>cmap.writeUInt32BE(v,28+i*12+j*4)));const data=Buffer.alloc(28+cmap.length);data.writeUInt32BE(0x00010000);data.writeUInt16BE(1,4);data.write('cmap',12);data.writeUInt32BE(28,20);data.writeUInt32BE(cmap.length,24);cmap.copy(data,28);return data;}
async function optionalInstalledRenderer(t,texts){
  try{const renderer=await createVideoTextRenderer({texts});t.after(()=>renderer.close());return renderer;}
  catch(error){
    if(!error.message?.startsWith('No installed video font covers '))throw error;
    assert.match(error.message,/U\+[0-9A-F]{4,6}/);
    assert.match(error.message,/Install a font supporting these characters before exporting; missing glyphs will not be substituted\./);
    t.skip(`Optional native raster check: ${error.message}`);return null;
  }
}
test('font coverage checks actual nonzero cmap glyphs instead of font names',()=>{
  const cmap=readFontCoverage(font([65,0x631,0x4e16]));assert(cmap(65)>0);assert(cmap(0x631)>0);assert.equal(cmap(0x632),0);assert(cmap(0x4e16)>0);assert.throws(()=>readFontCoverage(Buffer.alloc(2)),/font|cmap/i);
});
test('font fallback chooses per-character coverage and rejects missing Unicode explicitly',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'video-fonts-'));t.after(()=>rm(root,{recursive:true,force:true}));const latin=path.join(root,'latin.ttf'),arabic=path.join(root,'arabic.ttf'),cjk=path.join(root,'cjk.ttf');await writeFile(latin,font([65]));await writeFile(arabic,font([0x631]));await writeFile(cjk,font([0x4e16]));
  const result=await selectCoveredVideoFonts({texts:['Aر世'],fontFiles:[latin,arabic,cjk]});assert.equal(result.length,3);assert(result.every(f=>f.sha256.length===64));
  await assert.rejects(selectCoveredVideoFonts({texts:['Aر世'],fontFiles:[latin,cjk]}),/U\+0631/);await assert.rejects(selectCoveredVideoFonts({texts:['A\u{10ffff}'],fontFiles:[latin]}),/U\+10FFFF/);
});
test('native text renderer verifies installed Arabic and CJK coverage before rasterizing',async t=>{
  const renderer=await optionalInstalledRenderer(t,['مرحبا بالعالم 世界 字幕 محفوظ 完成']);if(!renderer)return;assert(renderer.fonts.some(f=>f.coveredCodepoints.includes('U+0631')));assert(renderer.fonts.some(f=>f.coveredCodepoints.includes('U+4E16')));
  const result=await renderer.render({text:'مرحبا بالعالم 世界 字幕',fontSize:48,color:'#ffffff',background:'#000000',maxWidth:1100,padding:8});assert.equal(result.png.subarray(1,4).toString(),'PNG');assert(result.width>100&&result.height>30);assert(result.fonts.length>=1);
  await assert.rejects(renderer.render({text:'\u{10ffff}',fontSize:48,maxWidth:1000}),/coverage|U\+10FFFF/);
  await assert.rejects(renderer.render({text:'مرحبا بالعالم 世界 字幕',fontSize:2000,maxWidth:1}),/limit|width/i);
  renderer.close();await assert.rejects(renderer.render({text:'مرحبا',fontSize:48}),/closed/);
});
test('glyph bearings, accents and Arabic marks survive zero user padding',async t=>{
  const texts=['j','Á','قُرْآن','世界'];const renderer=await optionalInstalledRenderer(t,texts);if(!renderer)return;const {createCanvas,loadImage}=await import('@napi-rs/canvas');
  const alpha=async png=>{const image=await loadImage(png),canvas=createCanvas(image.width,image.height),context=canvas.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,image.width,image.height).data;let count=0,total=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i])count++;total+=pixels[i];}return{count,total};};
  for(const text of texts){const compact=await renderer.render({text,fontSize:48,maxWidth:1000,padding:0}),reference=await renderer.render({text,fontSize:48,maxWidth:1000,padding:64});assert.deepEqual(await alpha(compact.png),await alpha(reference.png),`${text} lost glyph pixels without padding`);}
});
test('title centering preserves glyph bleed or rejects a raster that cannot fit',()=>{
  const raster={logicalWidth:100,logicalHeight:40,width:106,height:44,bleed:{left:4,top:2}};
  assert.deepEqual(centerVideoTitleRaster(raster,200,100),{x:46,y:28});
  assert.throws(()=>centerVideoTitleRaster(raster,100,100),/title.*frame|reduce|wrap/i);
});
