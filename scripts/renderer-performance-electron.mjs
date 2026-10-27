import {app} from 'electron';
import path from 'node:path';
const profile=process.env.MUSEBENCH_RENDERER_PROFILE;
if(!profile||!path.isAbsolute(profile))throw Error('Run through renderer-performance.mjs with an owned isolated profile.');
app.setPath('userData',profile);
app.on('window-all-closed',()=>{});
// The measurement runner creates only hidden, sandboxed fixture windows after attach.
app.whenReady().then(()=>{});
