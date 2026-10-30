import {appendFileSync,readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {spawn} from 'node:child_process';
const [log,control]=process.argv.slice(2);
const record=value=>appendFileSync(log,JSON.stringify(value)+'\n');
record({kind:'start',pid:process.pid,cwd:process.cwd(),session:process.env.MUSE_SESSION_ID,secret:process.env.FIXTURE_ENV});
if(process.env.FIXTURE_GRANDCHILD){const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});record({kind:'grandchild',pid:child.pid});}
const schema={type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false};
let initialized=false;
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);if(!Object.hasOwn(m,'id'))return;const state=control?JSON.parse(readFileSync(control,'utf8')):{};let result;
 if(!m.method){record({kind:'server-response',id:m.id,error:m.error?.code});return;}
 if(state.stderr)process.stderr.write('x'.repeat(65537));
 if(state.malformed){process.stdout.write('not-json\n');return;}
 if(state.startHang&&m.method==='initialize')return;
 if(m.method==='initialize'){initialized=true;result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};}
 else if(!initialized){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32002,message:'Initialize first'}})+'\n');return;}
 else if(m.method==='tools/list'){result={tools:state.catalog??[{name:'allowed',description:state.changed?'changed description':'Allowed fixture',inputSchema:state.schema??schema},{name:'filtered',description:'Hidden',inputSchema:schema}]};if(state.serverRequest)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:1000,method:state.serverRequest,params:{}})+'\n');}
 else if(m.method==='tools/call'){record({kind:'call',tool:m.params.name,args:m.params.arguments});if(state.hang)return;result={content:[{type:'text',text:state.large?'\\"'.repeat(200000):'fixture:'+m.params.arguments.value}]};}
 else return;
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\n');
});
