import {useEffect,useState} from 'react';
import {Clock3,RotateCcw,Ticket} from 'lucide-react';
import type {AccountUsage} from '../shared/account-usage.mjs';
import {formatResetCountdown,subscriptionResets} from '../shared/usage-resets.mjs';

export function UsageResets({usage,loading,onRefresh,onViewPlans}:{usage:AccountUsage|null;loading:boolean;onRefresh:()=>void;onViewPlans:()=>void}){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{const tick=()=>setNow(Date.now());tick();const timer=setInterval(tick,30000);window.addEventListener('focus',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);};},[usage]);
 const resets=subscriptionResets(usage,now);
 return <section className="usage-resets" aria-label="Subscription resets">
  <div className="usage-section-title"><h3>Resets</h3><button className="text-link" disabled={loading} onClick={onRefresh}><RotateCcw size={13}/> {loading?'Refreshing…':'Refresh usage'}</button></div>
  <div className="usage-card usage-resets-card">
   {resets.kind==='api'?<p className="usage-note">API billing uses pay-as-you-go credits. Subscription resets do not apply.</p>:<>
    <div className="usage-reset-heading"><Clock3 size={17}/><strong>Automatic resets</strong></div>
    {resets.windows.length?<ul className="usage-reset-windows">{resets.windows.map(window=><li key={window.label}>
     <div><strong>{window.label}</strong>{window.resetsAt?<time dateTime={window.resetsAt}>{new Date(window.resetsAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time>:<small>No reset time reported</small>}</div>
     <span className={window.status==='scheduled'?'usage-reset-countdown':'usage-note'}>{window.status==='scheduled'?'Resets ':''}{formatResetCountdown(window.remainingMs)}</span>
    </li>)}</ul>:<p className="usage-note">{loading?'Checking Meta reset times…':'Meta has not reported subscription reset times yet.'}</p>}
    <p className="usage-note usage-reset-footnote">Allowance updates when Meta reports new usage.</p>
   </>}
   <div className="usage-reset-banked"><div className="usage-reset-heading"><Ticket size={17}/><strong>Banked resets</strong><span className="usage-reset-badge">Not available</span></div><p className="usage-note">Meta’s current integration does not offer resets to claim or use.</p><button className="text-link" onClick={onViewPlans}>View subscription plans</button></div>
  </div>
 </section>;
}
