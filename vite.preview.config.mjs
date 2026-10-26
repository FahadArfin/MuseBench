import {desktopSnapshotsPlugin} from './scripts/preview-snapshot-server.mjs';
import {mergeConfig} from 'vite';
import base from './vite.config.mjs';
export default mergeConfig(base,{optimizeDeps:{entries:['preview.html']},server:{host:'127.0.0.1',port:4319,strictPort:true,open:false},plugins:[desktopSnapshotsPlugin(),{name:'preview-entry',configureServer(server){server.middlewares.use((request,_response,next)=>{if(request.url==='/')request.url='/preview.html';next();});}}]});
