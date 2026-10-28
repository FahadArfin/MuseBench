import path from 'node:path';
export function isolatedDesktopEnvironment(profile,{platform=process.platform,source=process.env}={}){
 const env={...source,MUSEBENCH_DATA_DIR:profile,MUSEBENCH_PROJECTS_DIR:path.join(profile,'projects'),HOME:profile,XDG_CONFIG_HOME:path.join(profile,'.config'),XDG_DATA_HOME:path.join(profile,'.local','share'),XDG_CACHE_HOME:path.join(profile,'.cache')};
 for(const key of Object.keys(env))if(['USERPROFILE','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA','ELECTRON_RUN_AS_NODE','MUSEBENCH_DEV'].includes(key.toUpperCase()))delete env[key];
 if(platform==='win32')Object.assign(env,{USERPROFILE:profile,LOCALAPPDATA:path.join(profile,'Local'),APPDATA:path.join(profile,'Roaming')});
 return env;
}
