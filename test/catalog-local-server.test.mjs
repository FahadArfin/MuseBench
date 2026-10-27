import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {resolveLocalCatalogServer,PLAYWRIGHT_MCP_VERSION} from '../electron/catalog-local-server.mjs';
const recipe={name:'playwright',transport:'npm',package:'@playwright/mcp',version:'0.0.83'};
async function fixture(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'catalog node '));t.after(()=>rm(directory,{recursive:true,force:true}));
 await mkdir(path.join(directory,'node_modules','npm','bin'),{recursive:true});
 await writeFile(path.join(directory,'node.exe'),'fixture only - never execute');
 await writeFile(path.join(directory,'node_modules','npm','bin','npx-cli.js'),'throw Error("must not execute")');
 await writeFile(path.join(directory,'node_modules','npm','package.json'),JSON.stringify({name:'npm',bin:{npx:'bin/npx-cli.js'}}));
 return directory;
}
test('resolves a pinned Node/npx argument vector without executing the fixture',async t=>{
 const directory=await fixture(t),actual=await resolveLocalCatalogServer(recipe,{environment:{Path:directory}});
 assert.equal(PLAYWRIGHT_MCP_VERSION,'0.0.83');
 assert.deepEqual(actual,{name:'playwright',transport:'stdio',command:path.join(directory,'node.exe'),args:[path.join(directory,'node_modules','npm','bin','npx-cli.js'),'--yes','--ignore-scripts','--package','@playwright/mcp@0.0.83','--','playwright-mcp']});
});
test('ignores empty relative quoted and network PATH entries',async t=>{
 const directory=await fixture(t),environment={PATH:['','.','relative','"'+directory+'"','\\\\server\\share',directory].join(path.delimiter)};
 assert.equal((await resolveLocalCatalogServer(recipe,{environment})).command,path.join(directory,'node.exe'));
 await assert.rejects(resolveLocalCatalogServer(recipe,{environment:{PATH:['','.','relative','"'+directory+'"','\\\\server\\share'].join(path.delimiter)}}),/Node.js.*npm.*PATH/i);
});
test('rejects recipe substitutions and arbitrary arguments before filesystem resolution',async()=>{
 for(const change of [{name:'other'},{transport:'stdio'},{package:'evil'},{version:'latest'},{version:'0.0.83;calc'},{args:['--init-script','evil.js']},{command:'cmd.exe'},{env:{NODE_OPTIONS:'--require=evil'}}])await assert.rejects(resolveLocalCatalogServer({...recipe,...change},{environment:{}}),/approved|recipe/i);
});
test('requires Node and genuine npm layout together, never a cmd shim',async t=>{
 const directory=await fixture(t);await rm(path.join(directory,'node_modules','npm','bin','npx-cli.js'));
 await writeFile(path.join(directory,'npx.cmd'),'must not execute');
 await assert.rejects(resolveLocalCatalogServer(recipe,{environment:{PATH:directory}}),/Node.js.*npm.*PATH/i);
});
test('skips a mismatched npm package and incomplete first candidate',async t=>{
 const first=await fixture(t),second=await fixture(t);
 await writeFile(path.join(first,'node_modules','npm','package.json'),JSON.stringify({name:'impostor',bin:{npx:'bin/npx-cli.js'}}));
 const result=await resolveLocalCatalogServer(recipe,{environment:{PATH:[first,second].join(path.delimiter)}});
 assert.equal(result.command,path.join(second,'node.exe'));
});
test('missing runtime remains setup-required',async()=>{
 await assert.rejects(resolveLocalCatalogServer(recipe,{environment:{}}),error=>error.code==='CATALOG_PREREQUISITE_REQUIRED'&&error.message.includes('18'));
});
