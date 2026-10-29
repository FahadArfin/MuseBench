import {createSitesService} from '../src/sites/index.mjs';
import {createSitesGenerator} from '../src/sites/generator.mjs';

export async function createDesktopSites({dataDir,projectsDir,runtime,safeStorage,work,shell,clipboard}){
 const encrypt=text=>{if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential protection is unavailable. Hosting credentials were not saved.');return safeStorage.encryptString(text);};
 const service=await createSitesService({dataDir,encrypt,decrypt:bytes=>safeStorage.decryptString(bytes),clientId:process.env.MUSEBENCH_NETLIFY_CLIENT_ID??'',
  workArtifact:async id=>{if(work.getState().busy)throw Error('Finish or stop the Work request before copying its artifact.');const artifact=await work.getArtifact(id);if(!artifact)throw Error('This Work item has no saved artifact.');return artifact;},
  generatorFactory:({onGenerated})=>createSitesGenerator({dataDir:dataDir+'/generation',projectsDir,runtime,onGenerated}),
  openExternal:async value=>{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='app.netlify.com'||url.pathname!=='/authorize'||url.username||url.password)throw Error('Invalid hosting sign-in destination.');await shell.openExternal(url.href);}
 });
 function destination(target){
  if(target==='tokens')return'https://app.netlify.com/user/applications#personal-access-tokens';
  if(target==='oauthSetup')return'https://app.netlify.com/user/applications#oauth';
  const site=service.getState().site;
  if(target==='live'){if(site?.status!=='live'||!site.url)throw Error('Publish and verify a site before sharing it.');const parsed=new URL(site.url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Invalid public site URL.');return parsed.href;}
  if(!['dashboard','domains','analytics'].includes(target))throw Error('Unknown hosting destination.');
  if(!site?.remoteName)return'https://app.netlify.com/';
  if(!/^[a-z0-9-]{1,63}$/.test(site.remoteName))throw Error('Invalid hosted site name.');
  return`https://app.netlify.com/projects/${site.remoteName}/${target==='domains'?'domain-management':target==='analytics'?'analytics':'overview'}`;
 }
 return{...service,async open(target){await shell.openExternal(destination(target));},copyUrl(){return clipboard.writeText(destination('live'));}};
}
