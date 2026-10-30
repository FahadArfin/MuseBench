const platforms=['win32','darwin','linux'];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
export function validateProjectAction(value){
 if(!object(value)||Object.keys(value).some(key=>!['id','name','cwd','commands','timeoutSeconds'].includes(key))||!id(value.id))throw Error('Use a valid project action ID.');
 if(typeof value.name!=='string'||!value.name.trim()||value.name.length>80||/[\x00-\x1f\x7f]/.test(value.name))throw Error('Use an action name up to 80 characters.');
 const cwd=typeof value.cwd==='string'?value.cwd.replaceAll('\\','/'):'',parts=cwd.split('/');
 if(!cwd||cwd.length>1000||cwd!=='.'&&(parts.some(part=>!part||part==='.'||part==='..')||/[\x00-\x1f\x7f:]/.test(cwd)))throw Error('Choose a folder relative to this project without traversal.');
 if(!object(value.commands)||!Object.keys(value.commands).length||Object.keys(value.commands).some(key=>!platforms.includes(key)))throw Error('Add a command for Windows, macOS or Linux.');
 const commands={};for(const [platform,command]of Object.entries(value.commands)){if(typeof command!=='string'||!command.trim()||command.length>4000||command.includes('\0'))throw Error('Use a command up to 4,000 characters.');commands[platform]=command;}
 const timeoutSeconds=value.timeoutSeconds??120;if(!Number.isInteger(timeoutSeconds)||timeoutSeconds<1||timeoutSeconds>600)throw Error('Choose a timeout between 1 and 600 seconds.');
 return{id:value.id,name:value.name.trim(),cwd,commands,timeoutSeconds};
}
export function validateProjectActionRequest(value){
 if(!object(value)||!['saveProjectAction','runProjectAction'].includes(value.type))throw Error('Invalid project action request.');
 const keys=['type','projectId','taskId','revision',value.type==='saveProjectAction'?'definition':'actionId'];
 if(Object.keys(value).some(key=>!keys.includes(key))||['projectId','taskId'].some(key=>typeof value[key]!=='string'||!value[key]||value[key].length>200)||typeof value.revision!=='string'||!/^[a-f0-9]{64}$/.test(value.revision))throw Error('Review the current project action first.');
 if(value.type==='saveProjectAction')return{...value,definition:validateProjectAction(value.definition)};
 if(!id(value.actionId))throw Error('Choose a saved project action.');return{...value};
}
