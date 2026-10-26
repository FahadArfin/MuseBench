import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const args=process.argv.slice(2);const port=Number(args[args.indexOf('--port')+1]||0);
const allowed=new Map([['/','index.html'],['/index.html','index.html'],['/style.css','style.css'],['/app.js','app.js']]);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const file=allowed.get(new URL(req.url,'http://localhost').pathname);
  if(!file){res.writeHead(404);res.end('Not found');return;}
  try{const data=await readFile(fileURLToPath(new URL(file,import.meta.url)));res.writeHead(200,{'content-type':types[file.split('.').at(-1)],'cache-control':'no-store','content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'"});res.end(data);}catch{res.writeHead(500);res.end('Could not read storefront file');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Willow & Leaf preview: http://127.0.0.1:${server.address().port}/`));
