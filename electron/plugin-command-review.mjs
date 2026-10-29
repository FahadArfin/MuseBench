const hidden='[redacted]';
const refuse=()=>{throw Error('This command contains credentials that cannot be safely separated for review. Move them into separate credential arguments before reviewing it.');};
const credentialName=name=>/^(?:apiKey|accessToken|refreshToken|clientSecret|authToken)$/i.test(name)||/(?:^|[_-])(?:key|token|password|secret|authorization|credentials?)$/i.test(name);
const credentialFlag=arg=>/^--?[a-z][a-z0-9_-]*$/i.test(arg)&&credentialName(arg.replace(/^--?/,''));

function secret(value){
 if(!value)return value;
 const scheme=value.match(/^(Bearer|Basic)( +)([A-Za-z0-9._~+/=@:%-]+)$/i);
 if(scheme)return scheme[1]+scheme[2]+hidden;
 // A hidden value must not also hide shell syntax, code, or another flag.
 if(value.startsWith('-')||!/^[A-Za-z0-9._~+/=@:%-]+$/.test(value))refuse();
 return hidden;
}

function parameters(value){
 return value.split('&').map(part=>{
  const separator=part.indexOf('=');if(separator<0)return part;
  let name;try{name=decodeURIComponent(part.slice(0,separator).replace(/\+/g,' '));}catch{return part;}
  return credentialName(name)?part.slice(0,separator+1)+hidden:part;
 }).join('&');
}

function urlArgument(arg){
 // Only transform an entire URL argument. Never let a URL matcher consume the
 // rest of an inline program, as a diagnostic-oriented sanitizer might do.
 if(!/^[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>\\{}();]+$/i.test(arg))return null;
 try{new URL(arg);}catch{return null;}
 const parts=arg.match(/^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i);
 if(!parts)return null;
 const [,scheme,authority,pathname,query='',fragment='']=parts;
 const at=authority.lastIndexOf('@');
 return scheme+(at<0?authority:hidden+authority.slice(at))+pathname+
  (query?'?'+parameters(query.slice(1)):'')+(fragment?'#'+parameters(fragment.slice(1)):'');
}

function argument(arg){
 const url=urlArgument(arg);if(url!==null)return url;
 const assignment=arg.match(/^((?:--?)?[a-z_][a-z0-9_-]*)=(.*)$/i);
 if(assignment&&credentialName(assignment[1].replace(/^--?/,'')))return assignment[1]+'='+secret(assignment[2]);
 // Embedded credential syntax is ambiguous: refuse the review, rather than
 // exposing its value or hiding some of the program the user is approving.
 for(const match of arg.matchAll(/(?:^|[^a-z0-9_-])([a-z_][a-z0-9_-]*)["']?\s*[:=]/gi))if(credentialName(match[1]))refuse();
 for(const match of arg.matchAll(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>\\{}();]+/gi)){
  const display=urlArgument(match[0]);if(display!==null&&display!==match[0])refuse();
 }
 return arg;
}

/** Preserve every argument and all non-secret syntax; never truncate code. */
export function displayPluginCommand(command){
 return command.map((arg,index)=>{
  const display=index>0&&credentialFlag(command[index-1])?secret(arg):argument(arg);
  if(index===0&&display!==arg)refuse();
  return display;
 });
}
