import {AccountUsagePanel} from './AccountUsage';
import {WorkspaceTools} from './WorkspaceTools';
import {useEffect,useState} from 'react';
import {Modal} from './WorkspacePanels';
import type {Action,AppState,RunOptions} from '../shared/types';
import {COMMANDS,findCommand} from '../shared/slash-commands.mjs';
import {modelSettingsView} from '../shared/model-settings.mjs';
import {ModelSettingsSummary} from './ModelSettingsSummary';
export interface CommandView {id:string;args?:string;detail?:string;}
type Props={requestedOptions?:RunOptions;onNavigate:(command:string)=>void;command:CommandView;state:AppState;busy:boolean;act:(action:Action)=>Promise<AppState|null>;close:()=>void;onDraft:(text:string,newChat?:boolean)=>void;onError:(text:string)=>void;};
export function CommandDialog({command,state,busy,act,close,onDraft,onError,onNavigate,requestedOptions}:Props){
 const id=command.id,task=state.task;
 const [text,setText]=useState(command.args||(id==='memories'?state.memories??'':id==='goal'?task?.goal?.objective??'':id==='rename'?task?.title??'':''));
 const [rounds,setRounds]=useState(3),[minutes,setMinutes]=useState(10);
 const [message,setMessage]=useState('');
 const title=id==='unknown'?'Unknown command':findCommand(id)?.label??'MuseBench';
 const save=async()=>{
  const action:Action=id==='memories'?{type:'setMemories',text}:id==='goal'?{type:'setGoal',objective:text,status:'active'}:{type:'renameTask',title:text};
  const result=await act(action);if(result&&!result.error)close();
 };
 const settings=modelSettingsView({options:requestedOptions??task?.runOptions,runtime:task?.mode==='muse'?state.runtime:{modelCatalog:state.runtime.modelCatalog}});
 const facts=[['Project',state.activeProject?.name??'No project selected'],['Directory',state.activeProject?.root??'Choose a folder'],['Chat ID',task?.id??'New chat'],['Connection',state.runtime.status],['Next approval mode',task?.runOptions?.approval??'ask'],['Sandbox',state.runtime.fullAccess?'Off · Full access':state.runtime.permissionVerified?'On · Verified':'Not verified'],['Session',task?.nativeSession?'Persistent native session':'No persistent session attached']];
 return <Modal title={title} close={close} className={id==='usage'?'command-dialog usage-dialog':'command-dialog'}><div className="command-body">
  {['goal','memories','rename'].includes(id)?<>
   <p>{id==='goal'?'Keep this objective with the chat. Active goals accompany requests you send; this does not start background work.':id==='memories'?'Instructions you explicitly save here accompany future Muse Code requests across your projects. Clear the field to stop including them.':'Change the name shown in your project and chat history.'}</p>
   {id!=='memories'&&!task?<p>Start or open a chat first to use this command.</p>:<><label className="sr-only" htmlFor="command-editor">{title}</label>{id==='rename'?<input id="command-editor" data-autofocus value={text} onChange={e=>setText(e.target.value)} maxLength={100}/>:<textarea id="command-editor" data-autofocus value={text} onChange={e=>setText(e.target.value)} maxLength={id==='goal'?1000:1500}/>}
    <div className="command-actions">{id==='goal'&&task?.goal&&<><button className="button" disabled={busy} onClick={async()=>{const result=await act({type:'setGoal',objective:task.goal!.objective,status:task.goal!.status==='paused'?'active':'paused'});if(result&&!result.error)close();}}>{task.goal.status==='paused'?'Resume goal':'Pause goal'}</button><button className="button" disabled={busy} onClick={async()=>{const result=await act({type:'setGoal',objective:'',status:'active'});if(result&&!result.error)close();}}>Clear goal</button></>}<button className="button primary" disabled={busy||(id==='rename'&&!text.trim())} onClick={()=>void save()}>Save</button></div></>}
   {id==='goal'&&task?.goal&&<section className="context-receipt"><h3>Bounded continuation</h3><p>Opt in to separate runs followed by your saved validation profile. Stops on passing checks for your review, repeated failure, uncertain outcome, user input or budget. Restart and switching chats disarm it.</p><label>Maximum rounds<input aria-label="Goal round budget" type="number" min={1} max={8} value={rounds} onChange={e=>setRounds(Number(e.target.value))}/></label><label>Time limit (minutes)<input aria-label="Goal time budget" type="number" min={1} max={60} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><p>{task.goal.driver?`${task.goal.driver.rounds}/${task.goal.driver.maxRounds} rounds · ${task.goal.driver.armed?'Enabled':task.goal.driver.reason}`:'Not enabled'}</p>{task.goal.driver?.armed?<button className="button" onClick={()=>void act({type:'pauseGoalContinuation'})}>Stop continuation</button>:<button className="button" disabled={busy||!state.activeProject?.validationScripts?.length} onClick={()=>void act({type:'continueGoal',maxRounds:rounds,minutes})}>Start bounded continuation</button>}{!state.activeProject?.validationScripts?.length&&<p>Save a validation profile in Checks first.</p>}</section>}
  </>:id==='status'?<><dl className="command-facts">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><ModelSettingsSummary view={settings}/></>
  :id==='model'?<><ModelSettingsSummary view={settings}/><p>Choose the model and effort from the composer. Changes apply to your next request; queued prompts keep their saved settings.</p></>
  :id==='usage'?<AccountUsagePanel/>
  :id==='feedback'?<><p>Describe the issue, then copy a report to share yourself. MuseBench does not send feedback or logs automatically.</p><textarea data-autofocus aria-label="Feedback" value={text} onChange={e=>setText(e.target.value)} maxLength={4000} placeholder="What happened? What did you expect?"/><div className="command-actions"><button className="button primary" disabled={!text.trim()} onClick={()=>void navigator.clipboard.writeText(`MuseBench feedback\n\n${text}\n\nRuntime: ${state.runtime.status}\nTransport: ${state.runtime.transport??'unknown'}\nVersion: ${state.runtime.hostVersion??state.runtime.sdkVersion}\nSandbox: enabled`).then(()=>setMessage('Report copied.')).catch(()=>setMessage('Clipboard unavailable. Select and copy your text.'))}>Copy report</button></div>{message&&<p role="status">{message}</p>}</>
  :id==='side'||id==='fork'?<p>{command.detail||'Open a saved chat first to use this command.'}</p>
  :id==='tools'?<WorkspaceTools projectId={state.activeProject?.id} taskId={task?.id} navigate={onNavigate}/>
  :id==='help'?<><p>Type / on its own line to open commands. Use ↑ ↓ to select, Enter or Tab to choose, → for a submenu, and Escape to go back. Skills fill an editable prompt. No command selection automatically sends a model request.</p><div className="command-help">{COMMANDS.map(item=><div key={item.id}><code>/{item.id}</code><span>{item.description}{item.kind==='info'?' · Availability info':''}</span></div>)}</div></>
  :id==='unknown'?<p>/{command.args||''} is not a MuseBench command. Type / to browse commands, or /help for the full list. Your request has not been sent.</p>
  :<p>{command.detail||findCommand(id)?.detail||'This feature is not available in the current Muse connection.'}</p>}
 </div></Modal>;
}
