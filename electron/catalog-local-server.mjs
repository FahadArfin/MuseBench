import {lstat,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';

// Qualified from https://registry.npmjs.org/@playwright%2fmcp/0.0.83:
// engines.node >=18; bin.playwright-mcp = cli.js; microsoft/playwright-mcp.
// Bump only after requalifying package identity, binary and prerequisites.
export const PLAYWRIGHT_MCP_VERSION='0.0.83';
export const APPROVED_LOCAL_CATALOG_RECIPES=Object.freeze({playwright:Object.freeze({name:'playwright',transport:'npm',package:'@playwright/mcp',version:PLAYWRIGHT_MCP_VERSION})});
const prerequisite=()=>Object.assign(Error('Install Node.js 18 or newer with npm and add its installation folder to PATH, then reopen MuseBench. A supported browser must also be available; file discovery does not verify runtime or browser readiness. See https://github.com/microsoft/playwright-mcp#requirements.'),{code:'CATALOG_PREREQUISITE_REQUIRED'});
function safeAbsolute(value){
 return typeof value==='string'&&value.length<=2048&&path.isAbsolute(value)&&!/["\u0000-\u001f]/.test(value)&&!/^[/\\]{2}/.test(value)&&(process.platform!=='win32'||/^[a-z]:[/\\]/i.test(value));
}
async function regular(file){const info=await lstat(file);return info.isFile()&&!info.isSymbolicLink();}

/** Main-process allowlist resolution only. Reads files; never installs or runs Node/npm. */
export async function resolveLocalCatalogServer(recipe,{environment=process.env}={}){
 const approved=APPROVED_LOCAL_CATALOG_RECIPES.playwright;
 if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||Object.keys(recipe).some(key=>!Object.hasOwn(approved,key))||Object.entries(approved).some(([key,value])=>recipe[key]!==value))throw Error('Only the exact approved local catalog recipe is supported.');
 const search=Object.entries(environment??{}).find(([name])=>name.toLowerCase()==='path')?.[1];
 if(typeof search!=='string'||search.length>32768)throw prerequisite();
 for(const entry of search.split(path.delimiter).slice(0,128)){
  if(!safeAbsolute(entry))continue;
  try{
   const root=await realpath(entry);if(!safeAbsolute(root))continue;
   const command=path.join(root,'node.exe'),npmRoot=path.join(root,'node_modules','npm'),npx=path.join(npmRoot,'bin','npx-cli.js'),manifest=path.join(npmRoot,'package.json');
   if(!await regular(command)||!await regular(npx)||!await regular(manifest))continue;
   // Reject an npm tree redirected outside this Node installation by a junction.
   if(await realpath(npx)!==npx||await realpath(command)!==command||await realpath(manifest)!==manifest)continue;
   if((await lstat(manifest)).size>65536)continue;
   const bytes=await readFile(manifest);if(bytes.length>65536)continue;
   const metadata=JSON.parse(bytes.toString('utf8'));if(metadata.name!=='npm'||metadata.bin?.npx!=='bin/npx-cli.js')continue;
   return{name:'playwright',transport:'stdio',command,args:[npx,'--yes','--ignore-scripts','--package',`${approved.package}@${approved.version}`,'--','playwright-mcp']};
  }catch{ /* Missing, inaccessible or malformed candidates remain setup-required. */ }
 }
 throw prerequisite();
}
