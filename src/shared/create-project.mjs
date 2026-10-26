export function projectDetails(input){
 if(typeof input.name!=='string')throw Error('Name your project.');
 const name=input.name.trim();
 if(!name||name.length>80)throw Error('Use a project name between 1 and 80 characters.');
 if(/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^\./.test(name)||/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name))throw Error('Choose a folder-friendly name without slashes or special characters.');
 const goals=input.goals??'',context=input.context??'';
 if(typeof goals!=='string'||goals.length>1500||typeof context!=='string'||context.length>2000)throw Error('Keep goals under 1,500 characters and context under 2,000 characters.');
 const instructions=[goals.trim(),context.trim()?`Context:\n${context.trim()}`:''].filter(Boolean).join('\n\n');
 return {name,instructions};
}
