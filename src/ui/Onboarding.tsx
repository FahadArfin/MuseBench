import {useEffect,useState} from 'react';
import {ArrowUpRight,LoaderCircle,MessagesSquare,Terminal} from 'lucide-react';
import type {AccountProfile,OnboardingCommand,OnboardingState} from '../shared/types';
import {AvatarPicker} from './AvatarPicker';
import {TypedText} from './TypedText';
import './onboarding.css';

export function useOnboarding(){
 const [state,setState]=useState<OnboardingState|null>(null),[error,setError]=useState('');
 const bridge=window.musebench;
 const command=async(input:OnboardingCommand)=>{try{const next=await bridge!.onboarding(input);setState(next);setError('');}catch{setError('Setup could not complete. Check your connection and official Muse installation, then try again.');}};
 useEffect(()=>{let alive=true,pending=false;const refresh=async()=>{if(pending)return;pending=true;try{const next=await bridge?.onboarding({type:'status'});if(alive&&next){setState(next);setError('');}}catch{if(alive)setError('Could not check sign-in. Retry setup.');}finally{pending=false;}};void refresh();const timer=setInterval(()=>void refresh(),5000);window.addEventListener('focus',refresh);return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh);};},[bridge]);
 return {state,error,command};
}
export function Onboarding({product,onProduct,state,error,command,profile,onSave}:{product:'code'|'personal';onProduct:(v:'code'|'personal')=>void;state:OnboardingState|null;error:string;command:(v:OnboardingCommand)=>Promise<void>;profile:AccountProfile;onSave:(v:AccountProfile)=>void}){
 const [draft,setDraft]=useState<AccountProfile>({...profile,avatarSeed:undefined,avatarImage:undefined}),[key,setKey]=useState(''),[api,setApi]=useState(false),[saveError,setSaveError]=useState('');
 const status=state?.[product==='code'?'code':'personal'],ready=status?.status==='ready',pending=status?.status==='pending';
 const external=async(url:string)=>{try{await window.musebench?.openExternal(url);}catch{setSaveError('The link could not open. Try again.');}};
 const selected=Boolean(draft.avatarImage||draft.avatarSeed?.startsWith('mascot-'));
 return <main className="onboarding"><div className="onboarding-drag"/><section className="onboarding-card" aria-label="Muse setup">
  <h1 aria-label="Muse AI & Muse Code"><Terminal size={32}/><TypedText text="Muse AI & Muse Code" delay={250} interval={65}/></h1>
  {state?.simulation&&<p className="onboarding-preview">Preview setup · Sign-in is simulated.</p>}
  <div className="onboarding-modes" role="group" aria-label="Choose workspace"><button aria-pressed={product==='personal'} onClick={()=>onProduct('personal')}><MessagesSquare size={18}/>Muse AI</button><button aria-pressed={product==='code'} onClick={()=>onProduct('code')}><Terminal size={18}/>Muse Code</button></div>
  {!ready?<><h2 aria-label="Log in"><Terminal size={22}/><TypedText key={product} text="Log in" delay={400} interval={100}/></h2><p>{product==='code'?'Sign in to Muse Code with a subscription or a Meta API key.':'Sign in to your Muse account to continue.'}</p>
   {product==='code'&&<div className="onboarding-plans"><div><strong>Subscription</strong><p>Start with Everyday Usage. High, Power and Maximum offer more capacity.</p><button className="text-link" onClick={()=>void external('https://accountscenter.meta.com/')}>View subscriptions<ArrowUpRight size={13}/></button><button className="text-link" onClick={()=>void external('https://dev.meta.ai/docs/muse-code/subscriptions')}>Compare plans<ArrowUpRight size={13}/></button></div><div><strong>Pay as you go</strong><p>Use a Meta Model API key with billing enabled.</p><button className="text-link" onClick={()=>void external('https://dev.meta.ai/billing')}>Set up API billing<ArrowUpRight size={13}/></button></div></div>}
   <button className="button primary onboarding-login" disabled={pending||!state} onClick={()=>void command({type:product==='code'?'loginCode':'loginPersonal'})}>{pending?<LoaderCircle size={18} className="spin"/>:<Terminal size={18}/>}Log in to {product==='code'?'Muse Code':'Muse AI'}</button>
   {status?.loginUrl&&<button className="text-link" onClick={()=>void external(status.loginUrl!)}>Open sign-in page<ArrowUpRight size={13}/></button>}{status?.userCode&&<p>Your sign-in code: <strong>{status.userCode}</strong></p>}
   {pending&&<button className="text-link" onClick={()=>void command({type:'cancel'})}>Cancel sign-in</button>}
   {product==='code'&&!pending&&<><button className="text-link" onClick={()=>setApi(!api)}>Use an API key</button>{api&&<form onSubmit={e=>{e.preventDefault();const secret=key;setKey('');void command({type:'apiKey',key:secret});}}><label>Meta API key<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} required maxLength={8192}/></label><button className="button" disabled={!key.trim()}>Save key in Muse CLI</button></form>}</>}
   <button className="text-link" onClick={()=>void command({type:'status'})}>Check sign-in</button>{product==='code'&&<button className="text-link" onClick={()=>void external('https://dev.meta.ai/docs/muse-code')}>Install Muse CLI<ArrowUpRight size={13}/></button>}
  </>:<><h2>Make it yours</h2><AvatarPicker value={draft} onChange={setDraft}/><label>Display name<input value={draft.displayName==='Your account'?'':draft.displayName} maxLength={60} placeholder="Your name" onChange={e=>setDraft({...draft,displayName:e.target.value})}/></label><button className="button primary onboarding-login" disabled={!selected||!draft.displayName.trim()||draft.displayName==='Your account'} onClick={()=>{try{onSave({...draft,displayName:draft.displayName.trim(),setupComplete:true});}catch{setSaveError('Could not save your profile. Try a smaller photo.');}}}>Continue to {product==='code'?'Muse Code':'Muse AI'}</button></>}
  {status?.message&&<p role="status">{status.message}</p>}{(error||saveError)&&<p role="alert">{saveError||error}</p>}
 </section></main>;
}
