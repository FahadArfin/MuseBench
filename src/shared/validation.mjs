export function validateCheckScripts(value){
 if(!Array.isArray(value)||!value.length||value.length>8||new Set(value).size!==value.length||value.some(s=>typeof s!=='string'||s.length>100||!/^\w[\w:.-]*$/.test(s)))throw Error('Choose 1–8 distinct package scripts.');
 return [...value];
}
export function missingChecks(task,revision,scripts){
 return scripts.filter(script=>{const receipt=task.check?.script===script?task.check:[...(task.checkReceipts??[])].reverse().find(c=>c.script===script);return !receipt||receipt.status!=='passed'||receipt.revision!==revision;});
}
export function checkDiagnostics(log){
 return String(log).split('\n').flatMap(line=>{
  const m=line.replace(/\u001b\[[0-9;]*m/g,'').match(/^(.+?)(?:\((\d+),(\d+)\)|:(\d+):(\d+)):\s*(error|warning)\b\s*(.*)$/i);if(!m)return[];
  const file=m[1].replaceAll('\\','/');if(file.startsWith('/')||file.includes(':')||file.split('/').some(p=>p==='..'||p==='.')||file.length>1024)return[];
  return[{path:file,line:Number(m[2]??m[4]),column:Number(m[3]??m[5]),severity:m[6].toLowerCase(),message:m[7].slice(0,1000)}];
 }).slice(0,100);
}
