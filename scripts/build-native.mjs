if(process.platform==='win32'){
 const {buildWindowsJob}=await import('./build-windows-job.mjs');
 await buildWindowsJob();
 await import('./build-windows-speech.mjs');
 await import('./build-windows-desktop.mjs');
}else console.log('Using the native Muse host; Windows helpers are not required.');
