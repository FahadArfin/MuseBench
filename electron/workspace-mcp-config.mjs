import path from 'node:path';
import {realpath,lstat} from 'node:fs/promises';

const key=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
async function checked(value,kind){
 if(typeof value!=='string'||!value||value.includes('\0')||!path.isAbsolute(value))throw Error('Workspace tools require canonical absolute paths.');
 let canonical,info;
 try{canonical=await realpath(value);info=await lstat(value);}catch{throw Error('Workspace tools files are unavailable.');}
 if(info.isSymbolicLink()||key(value)!==key(canonical))throw Error('Workspace tools require canonical paths without symbolic links.');
 const valid=kind==='file'?info.isFile():kind==='app'?info.isDirectory()||info.isFile()&&path.extname(canonical).toLowerCase()==='.asar':info.isDirectory();
 if(!valid)throw Error('Workspace tools paths have an unsupported file type.');
 return canonical;
}

/** Main-process-only factory. appRoot and executable are supplied by the trusted
 * application, never renderer IPC. The caller still owns consent and host lifetime. */
export function createWorkspaceMcpConfig({appRoot,executable=process.execPath}={}){
 return async workspaceRoot=>{
  const root=await checked(workspaceRoot,'directory'),app=await checked(appRoot,'app'),command=await checked(executable,'file');
  const expected=path.join(app,'src','runtime','workspace-mcp.mjs'),script=await checked(expected,'file');
  if(key(script)!==key(expected))throw Error('Workspace tools script does not belong to the application.');
  return Object.freeze({transport:'stdio',command,args:Object.freeze([script,'--root',root]),env:Object.freeze({ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:''}),framing:'lineDelimitedJson',mode:'required'});
 };
}
