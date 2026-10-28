import {BillingSourceSettings,BillingPlans} from './CodeBilling';
import {UsageAnalytics} from './UsageAnalytics';
import {UsageResets} from './UsageResets';
import {useCallback,useEffect,useState,useRef} from 'react';
import {useSurfaceMotion} from './useSurfaceMotion';
import {money,type AccountUsage} from '../shared/account-usage.mjs';
import {nextUsageRefreshDelay,USAGE_REFRESH_MS} from '../shared/usage-resets.mjs';
import './account-usage.css';
export function useAccountUsage(active=true){
 const [usage,setUsage]=useState<AccountUsage|null>(null),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const [refreshId,setRefreshId]=useState(0);const refresh=useCallback(()=>setRefreshId(n=>n+1),[]);
 useEffect(()=>{if(!active)return;let live=true,inFlight=false,timer:ReturnType<typeof setTimeout>|undefined;
 const load=async()=>{if(inFlight||!live)return;clearTimeout(timer);inFlight=true;setLoading(true);let delay=USAGE_REFRESH_MS;
  try{const r=await window.musebench!.commandInfo('usage');if(live){setUsage(r.usage??null);setMessage(r.message??'');delay=nextUsageRefreshDelay(r.usage);}}
  catch{if(live){setUsage(null);setMessage('Could not refresh Meta usage.');}}
  finally{inFlight=false;if(live){setLoading(false);timer=setTimeout(()=>void load(),delay);}}
 };
 setUsage(null);void load();const off=window.musebench!.onBillingChanged(refresh);const focus=()=>void load();window.addEventListener('focus',focus);return()=>{live=false;off();clearTimeout(timer);window.removeEventListener('focus',focus);};},[active,refreshId,refresh]);
 return {usage,loading,message,refresh};
}
function AccountUsageOverview({showPlans}:{showPlans:()=>void}){
 const {usage,loading,message,refresh}=useAccountUsage();const [error,setError]=useState('');
 const payment=async(destination:'subscriptions'|'apiBilling')=>{try{const result=await window.musebench!.codeBilling({type:'checkout',destination});setError(result.simulation?'Preview only. No checkout was opened.':'Meta checkout opened. Refresh after completing your changes.');}catch{setError('Could not open Meta checkout. Use Plans to open it in your browser.');}};const b=usage?.billing;
 return <section className="account-usage" aria-label="Account usage">
 {usage?.simulation&&<p className="usage-note">Preview · Sample figures</p>}
 <BillingSourceSettings onChanged={refresh}/><div className="usage-section-title"><h3>Plans &amp; payments</h3><button className="text-link" onClick={showPlans}>View plans</button></div>
 <p className="usage-note">Choose a monthly subscription or manage API payments. Meta handles checkout.</p>
 <div className="usage-section-title"><h3>Subscription allowance</h3><button className="text-link" onClick={()=>void payment('subscriptions')}>Manage plan</button></div>
 {usage?.billingSource==='api'?<p className="usage-note">API billing is selected. Subscription allowance is separate.</p>:usage?.windows.length?usage.windows.map(w=><article className="usage-card" key={w.label}><header><strong>{w.label}</strong><span>{Math.floor(w.remainingPercent)}% left</span></header><progress aria-label={`${w.label} remaining`} max={100} value={w.remainingPercent}/></article>):<p className="usage-note">{loading?'Refreshing allowance...':'Subscription allowance unavailable'}</p>}
 <UsageResets usage={usage} loading={loading} onRefresh={refresh} onViewPlans={showPlans}/>
 <div className="usage-section-title"><h3>API balance &amp; spending</h3><button className="text-link" onClick={()=>void payment('apiBilling')}>Meta billing</button></div>
 {b?<article className="usage-card">
 {b.freeCredits!==undefined&&<header><strong>Free credits in use</strong><span>{money(b.freeCredits,b.currency)}</span></header>}
 {b.currentBalance!==undefined&&<header><strong>Current balance</strong><span>{money(b.currentBalance,b.currency)}</span></header>}
 {b.spent!==undefined&&<header><strong>{b.period}</strong><span>{money(b.spent,b.currency)} spent</span></header>}
 {b.spent!==undefined&&b.alertLimit!==undefined&&<><progress aria-label="Spending toward alert" max={Math.max(1,b.alertLimit)} value={Math.min(b.spent,b.alertLimit)}/><p>{money(Math.max(0,b.alertLimit-b.spent),b.currency)} before alert · {money(b.alertLimit,b.currency)} alert</p><small>This is an alert, not a spending cap.</small></>}
 {b.paymentThreshold!==undefined&&<small>Meta charges when your balance reaches {money(b.paymentThreshold,b.currency)}, or on your billing date. This is not a spending limit.</small>}
 {b.alertStatus==='not-set'&&<small>No monthly spend alert configured.</small>}
 {usage?.billingSource==='api'&&!usage.billingMatched&&<div className="usage-billing-match"><p>These figures are for the connected Meta billing account. Confirm it belongs to the API key you selected.</p>{b.accountId&&<button className="button" onClick={()=>void window.musebench!.codeBilling({type:'linkBilling',accountId:b.accountId!}).then(()=>{setError('Billing account linked to this API key’s usage display.');refresh();}).catch(e=>setError(e.message))}>This is my API billing account</button>}</div>}
 <small>Reported by {b.source}. Recent activity can take up to an hour to appear.</small></article>:<p className="usage-note">Billing unavailable. Connect Meta billing, then refresh once the billing page has loaded.</p>}
 {message&&<p className="usage-note" role="status">{message}</p>}<div className="usage-actions"><button className="button" onClick={()=>void window.musebench!.commandInfo('billing').then(()=>setError(usage?.simulation?'Preview only. No account connection is made.':'Meta billing opened. Sign in if needed, then refresh usage. Closing the billing window keeps syncing active until MuseBench exits.')).catch(()=>setError('Could not open Meta billing.'))}>Connect Meta billing</button></div>
 {error&&<p className="usage-note" role="status">{error}</p>}{usage?.observedAt&&<p className="usage-note">Allowance observed {new Date(usage.observedAt).toLocaleString()}</p>}{usage?.checkedAt&&<p className="usage-note">Checked {new Date(usage.checkedAt).toLocaleTimeString()} · Updates every 5 minutes while open</p>}</section>;
}

export function AccountUsagePanel(){const [tab,setTab]=useState<'overview'|'plans'|'analytics'>('overview');const content=useRef<HTMLDivElement>(null);useSurfaceMotion(content,tab);const labels={overview:'Overview',plans:'Plans',analytics:'Analytics'};return <><div className="usage-tabs" role="tablist" aria-label="Usage and billing sections">{(['overview','plans','analytics'] as const).map(id=><button type="button" role="tab" key={id} aria-selected={tab===id} onClick={()=>setTab(id)}>{labels[id]}</button>)}</div><div ref={content} role="tabpanel" aria-label={labels[tab]}>{tab==='overview'?<AccountUsageOverview showPlans={()=>setTab('plans')}/>:tab==='plans'?<BillingPlans/>:<UsageAnalytics/>}</div></>;}
