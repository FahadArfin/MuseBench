import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function buildNativeMcp({outfile=path.resolve('dist/native-mcp.mjs')}={}){
 const result=await build({entryPoints:[fileURLToPath(new URL('../electron/native-mcp-server.mjs',import.meta.url))],outfile,bundle:true,platform:'node',format:'esm',target:'node22',legalComments:'inline',metafile:true,banner:{js:"import {createRequire as createBundleRequire} from 'node:module'; const require = createBundleRequire(import.meta.url);"}});
 for(const output of Object.values(result.metafile.outputs))for(const imported of output.imports)if(!imported.path.startsWith('node:'))throw Error('Native MCP bundle has an external dependency: '+imported.path);
 return outfile;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildNativeMcp();
