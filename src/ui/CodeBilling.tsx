import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,ChevronRight,CreditCard,ExternalLink,KeyRound,Sparkles} from 'lucide-react';
import {MUSE_PLANS} from '../shared/billing-plans.mjs';
import type {CodeBillingCommand,CodeBillingState,SignInState} from '../shared/types';
import {customizeBlocked} from '../shared/customize-policy.mjs';

export function BillingSourceSettings({onChanged}:{onChanged:()=>void}){
 const [state,setState]=useState<CodeBillingState|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[editing,setEditing]=useState(false),[key,setKey]=useState(''),[login,setLogin]=useState<SignInState|null>(null);
 const generation=useRef(0),alive=useRef(true);
 const load=useCallback(async()=>{const ticket=++generation.current;try{const r=await window.musebench!.codeBilling({type:'status'});if(alive.current&&ticket===generation.current)setState(r.state??null);}catch{if(alive.current&&ticket===generation.current)setMessage('Could not read billing source settings.');}},[]);
 useEffect(()=>{
  alive.current=true;void load();
  void window.musebench!.onboarding({type:'status'}).then(r=>{if(alive.current&&r.code.status==='pending')setLogin(r.code);}).catch(()=>{});
  const off=window.musebench!.onBillingChanged(()=>void load()),lastBusy:(boolean|undefined)[]=[];
  const changed=(slot:number,active:boolean)=>{if(active!==lastBusy[slot]){lastBusy[slot]=active;void load();}};
  const offState=window.musebench!.onState(s=>changed(0,customizeBlocked(s)||!!s.task?.goal?.driver?.armed||!!s.task?.promptQueue?.length&&!s.task?.queuePaused));
  const offWork=window.musebench!.onWorkState(s=>changed(1,customizeBlocked(s)||!!s.task?.goal?.driver?.armed));
  const offSites=window.musebench!.onSitesState(s=>changed(2,customizeBlocked(s,s.generation)));
  const focus=()=>void load();window.addEventListener('focus',focus);
  return()=>{alive.current=false;generation.current++;off();offState();offWork();offSites();window.removeEventListener('focus',focus);};
 },[load]);
 const change=async(command:CodeBillingCommand)=>{
  setBusy(true);setMessage('');
  try{const r=await window.musebench!.codeBilling(command);if(!alive.current)return;if(r.state)setState(r.state);setEditing(false);setKey('');setMessage(r.simulation||r.state?.simulation?'Preview only. No credentials or payments were used.':'Billing source saved for your next Muse Code request.');onChanged();await load();}
  catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'Could not change the billing source.');}
  finally{if(alive.current)setBusy(false);}
 };
 useEffect(()=>{
  if(login?.status!=='pending')return;let live=true,inFlight=false;
  const poll=async()=>{if(inFlight)return;inFlight=true;try{const r=await window.musebench!.onboarding({type:'status'});if(!live)return;setLogin(r.code);if(r.code.status==='ready')await change({type:'select',source:'account'});}catch{if(live)setMessage('Could not check sign-in. Try again.');}finally{inFlight=false;}};
  const timer=setInterval(()=>void poll(),1500);return()=>{live=false;clearInterval(timer);};
 },[login?.status]);
 const checkout=async(destination:'apiKeys')=>{try{const r=await window.musebench!.codeBilling({type:'checkout',destination});setMessage(r.simulation?'Preview only. No payment page was opened.':'Open API keys in the Meta developer dashboard to create a key.');}catch{setMessage('Could not open Meta. Try again.');}};
 const selected=state?.mode==='cli'?state.source:state?.mode,disabled=busy||state?.busy||login?.status==='pending';
 return <section className="billing-source" aria-label="Muse Code billing source">
  <div className="usage-section-title"><h3>Pay for Muse Code with</h3><span className="usage-note">{state?.mode==='cli'?'Current CLI sign-in':'Next Code request'}</span></div>
  <div className="billing-source-options" role="radiogroup" aria-label="Billing source">
   <button type="button" role="radio" aria-checked={selected==='account'} disabled={disabled} onClick={()=>void change({type:'select',source:'account'})}><Sparkles size={19}/><span><strong>Muse Code account</strong><small>Use your subscription, when available</small></span>{selected==='account'&&<Check size={16}/>}</button>
   <button type="button" role="radio" aria-checked={selected==='api'} disabled={disabled} onClick={()=>state?.hasApiKey?void change({type:'select',source:'api'}):setEditing(true)}><KeyRound size={19}/><span><strong>API billing</strong><small>Pay as you go with your own key</small></span>{selected==='api'&&<Check size={16}/>}</button>
  </div>
  <p className="usage-note">Switching closes idle Code connections. Your chats stay saved. MuseBench never switches to API billing when a plan runs out.</p>
  <div className="usage-actions compact">
   <button type="button" className="text-link" disabled={disabled} onClick={async()=>{setMessage('');try{const r=await window.musebench!.onboarding({type:'loginCode'});setLogin(r.code);if(r.code.status==='ready')await change({type:'select',source:'account'});}catch(error){setMessage(error instanceof Error?error.message:'Could not start sign-in.');}}}>Sign in to Muse Code</button>
   <button type="button" className="text-link" disabled={disabled} onClick={()=>setEditing(v=>!v)}>{state?.hasApiKey?'Replace API key':'Add API key'}</button>
  </div>
  {editing&&<form className="billing-key-form" onSubmit={event=>{event.preventDefault();const value=key;setKey('');void change({type:'saveApiKey',key:value});}}>
   <label htmlFor="billing-api-key">Meta API key</label><input id="billing-api-key" type="password" autoComplete="off" spellCheck={false} value={key} maxLength={8192} onChange={e=>setKey(e.target.value)} placeholder="Paste your key"/>
   <small>Protected on this device. Your Muse account login is kept separately. Meta checks key access when you send a request.</small>
   <div className="usage-actions compact"><button className="button primary" type="submit" disabled={busy||key.trim().length<10}>Save &amp; use API</button><button type="button" className="text-link" onClick={()=>void checkout('apiKeys')}>Get an API key <ExternalLink size={12}/></button><button className="text-link" type="button" onClick={()=>{setKey('');setEditing(false);}}>Cancel</button></div>
  </form>}
  {login?.status==='pending'&&<div className="usage-card"><p>{login.message}</p>{login.userCode&&<code>{login.userCode}</code>}<div className="usage-actions compact">{login.loginUrl&&<button className="button" onClick={()=>void window.musebench!.openExternal(login.loginUrl!)}>Open sign-in</button>}<button className="text-link" onClick={()=>void window.musebench!.onboarding({type:'cancel'}).then(r=>setLogin(r.code))}>Cancel sign-in</button></div></div>}
  {(message||state?.message)&&<p className="usage-note" role="status">{message||state?.message}</p>}
 </section>;
}

export function BillingPlans(){
 const [selected,setSelected]=useState('everyday'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[lastDestination,setLastDestination]=useState<'subscriptions'|'apiBilling'>('subscriptions');
 const plan=MUSE_PLANS.find(p=>p.id===selected)!;
 const open=async(destination:'subscriptions'|'apiBilling'|'planDetails',external=false)=>{setBusy(true);if(destination!=='planDetails')setLastDestination(destination);try{const r=await window.musebench!.codeBilling({type:'checkout',destination,external});setMessage(r.simulation?'Preview only. No checkout or purchase was started.':destination==='subscriptions'?`Choose Muse Code → ${plan.name} in Meta Accounts Center. Meta shows the price and confirms your purchase.`:'Meta opened. Manage payment methods, pay a balance or available credits there.');}catch(error){setMessage(error instanceof Error?error.message:'Could not open Meta checkout.');}finally{setBusy(false);}};
 return <section className="billing-plans" aria-label="Muse Code plans">
  <div className="billing-plans-heading"><Sparkles size={22}/><div><h3>Choose your Muse Code plan</h3><p>One monthly subscription for coding with Muse.</p></div></div>
  <div className="billing-plan-grid" role="radiogroup" aria-label="Muse Code subscription plans">{MUSE_PLANS.map(item=><button type="button" key={item.id} role="radio" aria-checked={selected===item.id} onClick={()=>setSelected(item.id)}><header><strong>{item.name}</strong>{selected===item.id&&<Check size={16}/>}</header><span>{item.allowance}</span><p>{item.description}</p><small>Price shown by Meta</small></button>)}</div>
  <p className="usage-note">Prices and availability vary by region. Select Muse Code and your plan on Meta’s checkout page. Contributor mode can affect your allowance and how Meta uses your content.</p>
  <div className="usage-actions"><button className="button primary" disabled={busy} onClick={()=>void open('subscriptions')}>Continue to Meta checkout <ChevronRight size={15}/></button><button className="text-link" disabled={busy} onClick={()=>void open('subscriptions')}>Manage subscription</button><button className="text-link" disabled={busy} onClick={()=>void open('planDetails',true)}>Plan details <ExternalLink size={12}/></button></div>
  <article className="usage-card billing-api-plan"><CreditCard size={21}/><div><h3>Prefer pay as you go?</h3><p>Manage API payments, payment methods and credits in Meta billing.</p><button className="text-link" disabled={busy} onClick={()=>void open('apiBilling')}>Open API payments <ChevronRight size={14}/></button></div></article>
  {message&&<p className="usage-note" role="status">{message}</p>}
  <p className="usage-note">Checkout not working in the app? <button className="text-link" onClick={()=>void open(lastDestination,true)}>Open in browser</button>. After purchase, return to Overview and refresh usage.</p>
 </section>;
}
