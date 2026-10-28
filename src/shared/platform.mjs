import path from 'node:path';

export function userProfile(environment=process.env,platform=process.platform){
 const value=platform==='win32'?environment.USERPROFILE:environment.HOME;
 if(typeof value!=='string'||!path.isAbsolute(value))throw Error('A local user home directory is required.');
 return value;
}

export function isNativeExecutable(value,platform=process.platform){
 return typeof value==='string'&&!/[\x00-\x1f]/.test(value)&&path.isAbsolute(value)&&(platform!=='win32'||path.extname(value).toLowerCase()==='.exe');
}
