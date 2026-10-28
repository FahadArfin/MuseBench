import path from 'node:path';
export function packagePaths(){
 const suffix=process.arch==='x64'?'':`-${process.arch}`;
 const folder=process.platform==='darwin'?`mac${suffix}/MuseBench.app`:process.platform==='linux'?`linux${suffix}-unpacked`:`win${suffix}-unpacked`;
 const packageDir=process.env.MUSEBENCH_PACKAGE_DIR||path.resolve('release',folder);
 return{packageDir,resources:path.join(packageDir,process.platform==='darwin'?'Contents/Resources':'resources'),executable:path.join(packageDir,process.platform==='darwin'?'Contents/MacOS/MuseBench':process.platform==='win32'?'MuseBench.exe':'musebench')};
}
