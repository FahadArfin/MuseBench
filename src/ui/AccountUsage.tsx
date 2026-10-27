import {UsageAnalytics} from './UsageAnalytics';
import {useCallback,useEffect,useState} from 'react';
import {money,usageHeadline,type AccountUsage} from '../shared/account-usage.mjs';
import './account-usage.css';
export function useAccountUsage(active=true){
 const [usage,setUsage]=useState<AccountUsage|null>(null),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const [refreshId,setRefreshId]=useState(0);const refresh=useCallback(()=>setRefreshId(n=>n+1),[]);
 useEffect(()=>{if(!active)return;let live=true,inFlight=false;
 const load=async()=>{if(inFlight)return;inFlight=true;setLoading(true);setUsage(null);try{const r=await window.musebench!.commandInfo('usage');if(live){setUsage(r.usage??null);setMessage(r.message??'');}}catch{if(live){setUsage(null);setMessage('Could not refresh Meta usage.');}}finally{inFlight=false;if(live)setLoading(false);}};
 void load();const timer=setInterval(()=>void load(),300000);const focus=()=>void load();window.addEventListener('focus',focus);return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',focus);};},[active,refreshId]);
 return {usage,loading,message,refresh};
}
function AccountUsageOverview(){
 const {usage,loading,message,refresh}=useAccountUsage();const [error,setError]=useState('');
 const external=(url:string)=>void window.musebench!.openExternal(url).catch(()=>setError('Could not open the official page.'));const b=usage?.billing;
 return <section className="account-usage" aria-label="Account usage">
 {usage?.simulation&&<p className="usage-note">Preview · Sample figures</p>}
 <div className="usage-section-title"><h3>Subscription allowance</h3><button className="text-link" onClick={()=>external('https://accountscenter.meta.com/')}>Manage plan</button></div>
 {usage?.windows.length?usage.windows.map(w=><article className="usage-card" key={w.label}><header><strong>{w.label}</strong><span>{Math.floor(w.remainingPercent)}% left</span></header><progress aria-label={`${w.label} remaining`} max={100} value={w.remainingPercent}/>{w.resetsAt&&<small>Resets {new Date(w.resetsAt).toLocaleString()}</small>}</article>):<p className="usage-note">{loading?'Refreshing allowance...':'Subscription allowance unavailable'}</p>}
 <div className="usage-section-title"><h3>API spending</h3><button className="text-link" onClick={()=>external('https://dev.meta.ai/billing/')}>Meta billing</button></div>
 {b?<article className="usage-card"><header><strong>{b.period}</strong><span>{money(b.spent,b.currency)} spent</span></header>{b.alertLimit!==undefined&&<><progress aria-label="Spending toward alert" max={Math.max(1,b.alertLimit)} value={Math.min(b.spent,b.alertLimit)}/><p>{usageHeadline({windows:[],billing:b})} · {money(b.alertLimit,b.currency)} alert</p><small>This is an alert, not a spending cap.</small></>}<small>Reported by {b.source}. Recent charges may be delayed.</small></article>:<p className="usage-note">Spending unavailable. Connect Meta billing, then refresh once the billing page has loaded.</p>}
 {message&&<p className="usage-note" role="status">{message}</p>}<div className="usage-actions"><button className="button" disabled={loading} onClick={refresh}>Refresh usage</button><button className="button" onClick={()=>void window.musebench!.commandInfo('billing').then(()=>setError(usage?.simulation?'Preview only. No account connection is made.':'Meta billing opened. Sign in if needed, keep the page open, then refresh usage.')).catch(()=>setError('Could not open Meta billing.'))}>Connect Meta billing</button></div>
 {error&&<p className="usage-note" role="status">{error}</p>}{usage?.checkedAt&&<p className="usage-note">Checked {new Date(usage.checkedAt).toLocaleTimeString()} · Updates every 5 minutes while open</p>}</section>;
}

export function AccountUsagePanel(){const [tab,setTab]=useState<'overview'|'analytics'>('overview');return <><div className="usage-tabs" role="tablist" aria-label="Usage and billing sections">{(['overview','analytics'] as const).map(id=><button type="button" role="tab" key={id} aria-selected={tab===id} onClick={()=>setTab(id)}>{id==='overview'?'Overview':'Analytics'}</button>)}</div><div role="tabpanel" aria-label={tab==='overview'?'Overview':'Analytics'}>{tab==='overview'?<AccountUsageOverview/>:<UsageAnalytics/>}</div></>;}
