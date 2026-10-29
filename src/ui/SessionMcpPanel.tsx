import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,Plug,RefreshCw} from 'lucide-react';
import {MotionDisclosure} from './MotionDisclosure';
import type {McpInventory,RuntimeState} from '../shared/types';
import './session-mcp.css';

export function SessionMcpPanel({taskId,runtime}:{taskId:string;runtime:RuntimeState}){
 const id=useId(),request=useRef(0),inFlight=useRef(false);
 const [open,setOpen]=useState(false),[attempted,setAttempted]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[data,setData]=useState<McpInventory|null>(null);
 const available=runtime.transport==='msp'&&runtime.permissionVerified===true&&!!runtime.sessionId;
 useEffect(()=>()=>{request.current++;},[]);
 const read=async()=>{
  if(!available||inFlight.current)return;
  const current=++request.current;inFlight.current=true;setAttempted(true);setLoading(true);setError('');setData(null);
  try{
   const value=await window.musebench!.readMcpServers({taskId,sessionId:runtime.sessionId!});
   if(value.sessionId!==runtime.sessionId)throw Error('Session changed');
   if(current===request.current)setData(value);
  }catch(failure){if(current===request.current)setError(failure instanceof Error&&/inventory is not supported/.test(failure.message)?'This Muse version does not support session MCP inventory.':'Could not read MCP configuration. Refresh to try again.');}
  finally{if(current===request.current){inFlight.current=false;setLoading(false);}}
 };
 const toggle=()=>{setOpen(value=>!value);if(!open&&!attempted)void read();};
 if(runtime.transport!=='msp')return null;
 return <section className="session-mcp-inventory child-activity" aria-label="Session MCP configuration">
  <button type="button" className="child-activity-toggle" aria-expanded={open} aria-controls={id} onClick={toggle}><ChevronDown size={14} aria-hidden className={open?'expanded':''}/>Session MCP servers</button>
  <MotionDisclosure id={id} open={open} innerClassName="child-activity-content">
   <div className="child-activity-toolbar"><span>{data?`${data.simulation?'Preview sample · ':''}${new Date(data.readAt).toLocaleTimeString()}`:'Configuration and sign-in state'}</span><button type="button" aria-label="Refresh MCP inventory" title="Refresh MCP inventory" disabled={!available||loading} onClick={()=>void read()}><RefreshCw size={14} aria-hidden/></button></div>
   {!available&&<p className="popover-help">Connect this chat in Interactive mode to inspect its MCP servers.</p>}
   {loading&&<p role="status">Reading MCP configuration…</p>}
   {error&&<p role="alert">{error}</p>}
   {data&&<>
    {data.servers.length===0?<p>No MCP servers reported for this session.</p>:<ul className="session-mcp-list">{data.servers.map((server,index)=><li key={index}><Plug size={16} aria-hidden/><div><strong>{server.name}</strong><span>{{settings:'Settings',plugin:'Plugin',session:'This session',unknown:'Unknown source'}[server.source]} · {{stdio:'Local process',streamableHttp:'HTTP',unknown:'Unknown transport'}[server.transport]} · {{loggedIn:'Signed in',loggedOut:'Signed out',notSupported:'OAuth not supported',unknown:'Unknown sign-in state'}[server.oauth]}</span></div></li>)}</ul>}
    {data.omitted>0&&<p className="popover-help">{data.omitted} more servers are outside this bounded view.</p>}
    <p className="popover-help">Configuration and sign-in facts; tool availability is not checked.</p>
   </>}
  </MotionDisclosure>
 </section>;
}
