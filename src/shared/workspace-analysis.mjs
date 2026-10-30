// App-owned operations only. Discovery is ordinary gateway content, not native
// deferred function registration or permission to call another MCP server.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const fail=(code,message)=>{throw Object.assign(Error(message),{code:'SEMANTIC_'+code});};
const sourcePath={type:'string',minLength:1,maxLength:1000,description:'Workspace-relative TypeScript or JavaScript source path.'};
const position={path:sourcePath,line:{type:'integer',minimum:1,maximum:1000000,description:'One-based line.'},column:{type:'integer',minimum:1,maximum:1000000,description:'One-based UTF-16 column.'}};
const schema=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const catalog=[
 ['definition','Find the declaration of the symbol at a source position.',position],
 ['references','Find references to the same symbol, excluding unrelated names.',position],
 ['implementation','Find workspace implementations of an interface or symbol.',position],
 ['hover','Read the type signature and documentation at a source position.',position],
 ['workspace_symbols','Search named symbols across the bounded workspace source snapshot.',{query:{type:'string',maxLength:100,description:'Symbol name or part of a name; empty lists bounded results.'}}],
 ['document_symbols','Read a file outline of named symbols and their source positions.',{path:sourcePath}],
 ['syntax_diagnostics','Find syntax errors in a source file. Fixed compiler settings; not project type checking or a build.',{path:sourcePath}],
].map(([name,description,properties])=>({name,description,inputSchema:schema(properties)}));

export function normalizeWorkspaceToolset(value='navigation-v1'){
 if(!['navigation-v1','analysis-v1'].includes(value))fail('INPUT','Choose a supported workspace tool set.');
 return value;
}
export function workspaceOperations(toolset='navigation-v1',query=''){
 normalizeWorkspaceToolset(toolset);
 if(typeof query!=='string'||query.length>200)fail('INPUT','Tool search exceeds its limit.');
 const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return structuredClone(catalog.slice(0,toolset==='analysis-v1'?7:4).filter(item=>terms.every(term=>(item.name+' '+item.description).toLowerCase().includes(term))));
}
export function validateWorkspaceQuery(input,toolset='analysis-v1'){
 normalizeWorkspaceToolset(toolset);
 const descriptor=object(input)&&catalog.slice(0,toolset==='analysis-v1'?7:4).find(item=>item.name===input.operation);
 if(!descriptor||!exact(input,['operation',...descriptor.inputSchema.required]))fail('INPUT','Choose an operation with its exact arguments.');
 if(input.operation==='workspace_symbols'){
  if(typeof input.query!=='string'||input.query.length>100||/[\x00-\x1f\x7f]/.test(input.query))fail('INPUT','Symbol search exceeds its limit.');
  return{operation:input.operation,query:input.query};
 }
 const name=typeof input.path==='string'?input.path.replace(/\\/g,'/'):'';
 const parts=name.split('/');
 if(!name||name.length>1000||/[:\x00-\x1f\x7f]/.test(name)||parts.some(p=>!p||p==='.'||p==='..')||parts.slice(0,-1).some(p=>p.startsWith('.')||['node_modules','vendor','dist','build','out','coverage','release'].includes(p.toLowerCase()))||! /\.(?:[cm]?[jt]s|[jt]sx)$/i.test(name))fail('PATH','Choose a relative workspace TypeScript or JavaScript source path.');
 const result={operation:input.operation,path:name};
 if(descriptor.inputSchema.required.includes('line')){
  if(![input.line,input.column].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=1000000))fail('POSITION','Use positive one-based source positions.');
  Object.assign(result,{line:input.line,column:input.column});
 }
 return result;
}
export function validateWorkspaceBatch(calls){
 if(!Array.isArray(calls)||calls.length<1||calls.length>8)fail('INPUT','A batch needs one to eight calls.');
 const seen=new Set();
 return calls.map(call=>{
  if(!object(call)||typeof call.id!=='string'||! /^[A-Za-z0-9_-]{1,40}$/.test(call.id)||seen.has(call.id))fail('INPUT','Batch call IDs must be unique and bounded.');
  seen.add(call.id);const {id,...args}=call;return{id,...validateWorkspaceQuery(args)};
 });
}
