import path from 'node:path';
import {readFile} from 'node:fs/promises';
export function desktopSnapshotsPlugin(){return {name:'private-desktop-snapshots',configureServer(server){
 const directory=path.resolve(server.config.root,'artifacts/preview-snapshots');
 server.middlewares.use('/__musebench_snapshots',async(req,res)=>{
  const file=(req.url??'').split('?')[0].slice(1);
  if(req.method!=='GET'||!(/^(manifest\.json|(bot|ideas|goals|chat|media|artifacts|scheduled|vibes|search)\.png)$/.test(file))){res.statusCode=404;res.end();return;}
  try{const bytes=await readFile(path.join(directory,file));res.setHeader('Content-Type',file.endsWith('.png')?'image/png':'application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(bytes);}catch{res.statusCode=404;res.end();}
 });
}};}
