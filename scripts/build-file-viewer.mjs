import {build} from 'esbuild';
import {mkdir,cp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'dist','file-viewer');
await mkdir(out,{recursive:true});
await build({entryPoints:[path.join(root,'src/ui/file-preview/frame.ts')],outfile:path.join(out,'frame.js'),bundle:true,format:'iife',platform:'browser',target:'chrome140',minify:true,legalComments:'eof'});
for(const name of ['pdf.worker.min.mjs','cmaps','standard_fonts','wasm'])await cp(path.join(root,'node_modules/pdfjs-dist',name==='pdf.worker.min.mjs'?'build/'+name:name),path.join(out,name),{recursive:true});
await mkdir(path.join(out,'licenses'),{recursive:true});
for(const [name,folder,file]of [['pdfjs','pdfjs-dist','LICENSE'],['docx-preview','docx-preview','LICENSE'],['pptx-renderer','@aiden0z/pptx-renderer','LICENSE']]){
 await cp(path.join(root,'node_modules',folder,file),path.join(out,'licenses',name+'.txt'));
}
await writeFile(path.join(out,'frame.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#file-root{margin:0;width:100%;height:100%;overflow:auto}body{font:14px system-ui;background:#eef0f4;color:#20252e}#comment-layer{display:none;position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:transparent}.annotating #comment-layer{display:block}</style></head><body><main id="file-root"></main><div id="comment-layer"></div><script src="./frame.js"></script></body></html>`);
console.log('Built local file viewer.');
