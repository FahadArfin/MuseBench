import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),arch=process.arch;
if(!['x64','arm64'].includes(arch))throw Error('Release packaging supports x64 and ARM64.');
const targets={win32:['--win','nsis'],linux:['--linux','AppImage','deb'],darwin:['--mac','dmg','zip']}[process.platform];
if(!targets)throw Error('Unsupported desktop platform.');
execFileSync(process.execPath,[require.resolve('electron-builder/out/cli/cli.js'),...targets,`--${arch}`,'--publish','never',...(process.platform==='win32'&&arch==='arm64'?['--config.nsis.artifactName=MuseBench-Setup-${version}-arm64.${ext}']:[])],{stdio:'inherit',env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'}});
