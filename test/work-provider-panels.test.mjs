import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
test('unconfigured image, narration, footage and STT panels advertise Coming soon with disabled sends',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'work-provider-ui-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const built=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {ImageGenerationPanel} from './src/ui/work/image/ImageGenerationPanel';import {VoiceoverPanel,TranscriptionPanel} from './src/ui/work/video/VoiceoverPanel';import {GeneratedClipPanel} from './src/ui/work/video/GeneratedClipPanel';import {ImageMaskEditor} from './src/ui/work/image/ImageMaskEditor';export function panels(){return [ImageGenerationPanel,VoiceoverPanel,GeneratedClipPanel,TranscriptionPanel].map(Panel=>renderToStaticMarkup(<Panel itemId="item" revision={1}/>));}export function invertedMask(){return renderToStaticMarkup(<ImageMaskEditor mask={{version:1,sourceAssetId:'image',width:100,height:100,feather:0,inverted:true,strokes:[]}} onChange={()=>{}}/>);}`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 const file=path.join(dir,'panels.cjs');await writeFile(file,built.outputFiles[0].contents);const {panels,invertedMask}=require(file);
 for(const markup of panels()){const buttons=[...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match=>match[0]);assert(buttons.length);for(const button of buttons){assert.match(button,/disabled=""/);assert.match(button,/Coming soon/);}assert.doesNotMatch(markup,/api[_-]?key|Authorization|Bearer /i);}
 assert.match(panels()[1],/Generate voiceover/);assert.match(invertedMask(),/fill="white"/);
});
