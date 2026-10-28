// Render the editable vector at Windows' native icon sizes; no runtime dependency.
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=fileURLToPath(new URL('../electron/assets/',import.meta.url));
const svg=await readFile(path.join(directory,'musebench.svg'),'utf8');
const sizes=[16,20,24,32,40,48,64,128,256];
const browser=await chromium.launch({headless:true});
const frames=[];let large;
try {
  const page=await browser.newPage({deviceScaleFactor:1});
  for(const size of sizes) {
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    frames.push(await page.screenshot({omitBackground:true}));
  }
  await page.setViewportSize({width:1024,height:1024});
  large=await page.screenshot({omitBackground:true});
} finally {await browser.close();}

// ICO directory entries point to PNG frames, preserving alpha at every scale.
const header=Buffer.alloc(6+16*sizes.length);
header.writeUInt16LE(1,2);
header.writeUInt16LE(sizes.length,4);
let offset=header.length;
for(let index=0;index<sizes.length;index++) {
  const entry=6+index*16,size=sizes[index],frame=frames[index];
  header[entry]=header[entry+1]=size===256?0:size;
  header.writeUInt16LE(1,entry+4);
  header.writeUInt16LE(32,entry+6);
  header.writeUInt32LE(frame.length,entry+8);
  header.writeUInt32LE(offset,entry+12);
  offset+=frame.length;
}
await writeFile(path.join(directory,'musebench.ico'),Buffer.concat([header,...frames]));
await writeFile(path.join(directory,'musebench.png'),large);
console.log(`Rendered MuseBench icon at ${sizes.join(', ')} px`);
