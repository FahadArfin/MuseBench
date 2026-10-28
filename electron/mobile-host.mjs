import https from 'node:https';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash,X509Certificate,timingSafeEqual} from 'node:crypto';
import {networkInterfaces,hostname} from 'node:os';
import path from 'node:path';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const id=value=>typeof value==='string'&&/^[\w-]{1,100}$/.test(value);
const clean=value=>String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,300);
function validateCommand(value){
 if(!value||Object.keys(value).some(k=>!['kind','taskId','requestId','issuedAt','text'].includes(k))||!['select','send','stop'].includes(value.kind)||!id(value.taskId)||!/^[-a-f0-9]{36}$/.test(value.requestId??'')||!Number.isSafeInteger(value.issuedAt))fail(400,'Invalid companion command.');
 if(value.kind==='send'&&(typeof value.text!=='string'||!value.text.trim()||value.text.length>16000))fail(400,'Use a message up to 16,000 characters.');
 if(value.kind!=='send'&&value.text!==undefined)fail(400,'Unexpected command text.');
 return value;
}
async function readBody(req){
 if(req.headers['content-type']!=='application/json')fail(400,'JSON is required.');
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>70000)fail(413,'Request is too large.');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'Invalid JSON.');}
}

/** Opt-in companion server. No renderer IPC, file paths or shell commands cross this boundary. */
export async function createMobileHost({dataDir,protection,service,now=Date.now,port=0}){
 const file=path.join(dataDir,'mobile-devices.bin');let record,server,pairing,closed=false,queue=Promise.resolve(),initializing;
 const workers=new Set(),rates=new Map();
 const serialize=fn=>{const work=queue.then(fn);queue=work.catch(()=>{});return work;};
 const protectedStorage=()=>protection.isEncryptionAvailable()&&protection.getSelectedStorageBackend?.()!=='basic_text';
 async function save(){
  if(!protectedStorage())throw Error('Set up your system keyring before pairing a device.');
  await mkdir(dataDir,{recursive:true});await writeFile(file+'.tmp',protection.encryptString(JSON.stringify(record)),{mode:0o600});await rename(file+'.tmp',file);
 }
 async function init(){
  if(record)return;
  if(initializing)return initializing;
  initializing=(async()=>{
   try{
    const bytes=await readFile(file);if(bytes.length>2*1024*1024||!protectedStorage())throw Error('Protected storage unavailable.');
    const loaded=JSON.parse(protection.decryptString(bytes));
    if(loaded.version!==1||!Array.isArray(loaded.devices)||loaded.devices.length>20||!Array.isArray(loaded.receipts)||loaded.receipts.length>2000)throw Error('Invalid device store.');
    record=loaded;for(const receipt of record.receipts)if(receipt.status==='pending')receipt.status='unknown';
   }catch(error){if(error.code!=='ENOENT')throw Error('Could not unlock paired devices. Check your system keyring.');record={version:1,devices:[],receipts:[],port};}
  })().finally(()=>initializing=null);return initializing;
 }
 const addresses=()=>[...new Set(['127.0.0.1',...Object.values(networkInterfaces()).flat().filter(i=>i?.family==='IPv4'&&!i.internal).map(i=>i.address)])];
 const snapshot=()=>({running:!!server,port:server?.address()?.port??null,name:hostname(),addresses:server?addresses():[],devices:(record?.devices??[]).map(({id,name,createdAt})=>({id,name,createdAt})),pairing:pairing&&now()<pairing.expiresAt?{link:pairing.link,expiresAt:pairing.expiresAt}:null});
 function send(res,status,body){if(res.destroyed)return;const bytes=JSON.stringify(body);if(Buffer.byteLength(bytes)>512*1024){res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"Response exceeds companion limit."}');return;}res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(bytes);}
 async function handle(req,res){
  try{
   if(closed||!server)fail(503,'Companion is off.');
   if(req.headers.origin||req.headers['sec-fetch-site'])fail(403,'Use the paired MuseBench app.');
   const address=req.socket.remoteAddress,minute=Math.floor(now()/60000),rate=rates.get(address);
   if(!rate||rate.minute!==minute){if(rates.size>256)rates.clear();rates.set(address,{minute,count:1});}else if(++rate.count>120)fail(429,'Too many requests. Try again shortly.');
   const url=new URL(req.url,'https://localhost');if(url.pathname.length>200||url.search.length>500)fail(400,'Invalid companion route.');
   const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization??'')?.[1];
   if(req.method==='POST'&&url.pathname==='/v1/pair'){
    const input=await readBody(req);
    const result=await serialize(async()=>{
     if(!pairing||now()>=pairing.expiresAt||!same(token,pairing.secret))fail(401,'Pairing expired or already used.');
     if(typeof input?.name!=='string'||!input.name.trim()||input.name.length>80)fail(400,'Enter a device name.');
     if(record.devices.length>=20)fail(409,'Remove a paired device first.');
     const credential=randomBytes(32).toString('base64url'),device={id:randomUUID(),name:clean(input.name),tokenHash:hash(credential),createdAt:now()};
     const previous=pairing;pairing=null;record.devices.push(device);
     try{await save();}catch(error){record.devices.pop();pairing=previous;throw error;}
     return{token:credential,deviceId:device.id,name:hostname(),protocol:1};
    });send(res,200,result);return;
   }
   const device=token&&record.devices.find(d=>same(d.tokenHash,hash(token)));if(!device)fail(401,'Pair this device again.');
   if(req.method==='GET'&&url.pathname==='/v1/state'){send(res,200,{...service.snapshot(),receipts:record.receipts.filter(r=>r.deviceId===device.id).slice(-40).map(({requestId,status,error})=>({requestId,status,...(error?{error}:{})}))});return;}
   if(req.method==='GET'&&url.pathname==='/v1/chat'){
    const taskId=url.searchParams.get('taskId'),before=url.searchParams.get('before');if(!id(taskId)||before!==null&&!id(before))fail(400,'Invalid chat.');
    send(res,200,service.readChat({taskId,...(before?{before}:{})}));return;
   }
   if(req.method!=='POST'||url.pathname!=='/v1/command')fail(404,'Unknown companion route.');
   const input=validateCommand(await readBody(req)),fingerprint=hash(JSON.stringify(input));
   const receipt=await serialize(async()=>{
    if(!record.devices.some(d=>d.id===device.id))fail(401,'Device was revoked.');
    const prior=record.receipts.find(r=>r.deviceId===device.id&&r.requestId===input.requestId);
    if(prior){if(prior.fingerprint!==fingerprint)fail(409,'Request ID was already used.');return prior;}
    if(Math.abs(now()-input.issuedAt)>600000)fail(400,'Command expired. Check the device clock and try again.');
    record.receipts=record.receipts.filter(r=>r.status==='pending'||now()-r.issuedAt<86400000);
    if(record.receipts.length>=2000)fail(429,'Companion request limit reached. Try again later.');
    const item={deviceId:device.id,requestId:input.requestId,issuedAt:input.issuedAt,fingerprint,status:'pending'};record.receipts.push(item);
    try{await save();}catch(error){record.receipts.pop();throw error;}
    const work=Promise.resolve().then(()=>service.command(input)).then(()=>({status:'completed'}),error=>({status:error.outcome==='unknown'?'unknown':'failed',error:clean(error.message)})).then(result=>serialize(async()=>{Object.assign(item,result);await save();})).catch(()=>{item.status='unknown';}).finally(()=>workers.delete(work));workers.add(work);
    return item;
   });send(res,202,{requestId:receipt.requestId,status:receipt.status,...(receipt.error?{error:receipt.error}:{})});
  }catch(error){send(res,error.status||500,{error:error.status?error.message:'Companion request could not be completed.'});}
 }
 async function stop(){pairing=null;const old=server;server=null;if(old){old.closeAllConnections();await new Promise(resolve=>old.close(resolve));}}
 return{
  isBusy:()=>workers.size>0,
  async command(input){
   if(closed)throw Error('Companion is closed.');
   return serialize(async()=>{
    await init();
    if(input?.type==='start'&&!server){
     if(!protectedStorage())throw Error('Set up your system keyring before pairing a device.');
     if(record.cert&&Date.parse(new X509Certificate(record.cert).validTo)<=now()+86400000){record.cert=null;record.key=null;record.devices=[];record.receipts=[];}
     if(!record.cert){const {generate}=await import('selfsigned');const pems=await generate([{name:'commonName',value:'MuseBench desktop'}],{keySize:2048,algorithm:'sha256',extensions:[{name:'basicConstraints',cA:true},{name:'subjectAltName',altNames:[{type:2,value:'localhost'},{type:7,ip:'127.0.0.1'}]}]});record.cert=pems.cert;record.key=pems.private;}
     const instance=https.createServer({key:record.key,cert:record.cert,minVersion:'TLSv1.2'},(req,res)=>void handle(req,res));instance.maxConnections=32;instance.requestTimeout=10000;instance.headersTimeout=10000;
     try{await new Promise((resolve,reject)=>{instance.once('error',reject);instance.listen(record.port||port,'0.0.0.0',resolve);});server=instance;record.port=instance.address().port;await save();}catch(error){instance.closeAllConnections();instance.close();server=null;throw Error('Could not start the desktop connection. Check the local port and keyring.');}
    }else if(input?.type==='stop')await stop();
    else if(input?.type==='pair'){
     if(!server||!addresses().includes(input.address))throw Error('Choose a local desktop address.');
     const secret=randomBytes(32).toString('base64url'),expiresAt=now()+600000,fingerprint=new X509Certificate(record.cert).fingerprint256.replaceAll(':','').toLowerCase();
     const payload={version:1,url:`https://${input.address}:${server.address().port}`,fingerprint,secret,expiresAt};
     pairing={secret,expiresAt,link:'musebench://pair?data='+Buffer.from(JSON.stringify(payload)).toString('base64url')};
    }else if(input?.type==='revoke'){
     if(!id(input.id))throw Error('Choose a paired device.');const before=record.devices;record.devices=before.filter(d=>d.id!==input.id);try{await save();}catch(error){record.devices=before;throw error;}
    }else if(!['status','start'].includes(input?.type))throw Error('Unsupported device action.');
    return snapshot();
   });
  },
  async close(){closed=true;await serialize(stop);await Promise.allSettled([...workers]);await queue;},
 };
}
