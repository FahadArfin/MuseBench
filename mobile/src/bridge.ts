export type Chat={id:string;title:string;projectId:string;status:string;busy:boolean};
export type Message={id:string;role:string;text:string;truncated?:boolean};
export type RemoteState={name:string;selectedTaskId:string|null;busy:boolean;chats:Chat[];projects:{id:string;name:string}[];needsAttention:boolean;notice:string|null;receipts:{requestId:string;status:string;error?:string}[]};
export type ChatPage={taskId:string;title:string;messages:Message[];before:string|null;selected:boolean;status:string};
export type Connection={paired:boolean;name?:string;url?:string};
declare global {interface Window {MuseMobile?:{postMessage:(message:string)=>void;onmessage:((event:{data:string})=>void)|null}}}
const waiting=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
if(window.MuseMobile)window.MuseMobile.onmessage=event=>{try{const response=JSON.parse(event.data),pending=waiting.get(response.id);if(!pending)return;clearTimeout(pending.timer);waiting.delete(response.id);if(response.ok)pending.resolve(response.value);else pending.reject(Error(response.error||'Could not complete this request.'));}catch{}};
export function native<T=any>(method:string,input:unknown={}):Promise<T>{
 if(!window.MuseMobile)return Promise.reject(Error('Open this screen in MuseBench for Android.'));
 const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiting.delete(id);reject(Error('The desktop did not respond. Check the connection before retrying.'));},method==='scan'?180000:30000);waiting.set(id,{resolve,reject,timer});window.MuseMobile!.postMessage(JSON.stringify({id,method,input}));});
}
