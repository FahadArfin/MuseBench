import {AvatarPicker} from './AvatarPicker';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,Check,FolderCode,LockKeyhole,Pencil,Plug} from 'lucide-react';
import type {AccountProfile,Project,TaskSummary} from '../shared/types';
import {profileStats} from '../shared/profile-stats.mjs';
import {ProfileAvatar} from './ProfileMenu';
import {Modal} from './WorkspacePanels';
import './profile-page.css';

type Props={profile:AccountProfile;tasks:TaskSummary[];projects:Project[];onBack:()=>void;onProject:(id:string)=>void;onSave:(profile:AccountProfile)=>void;busy:boolean};
const number=(value:number)=>value.toLocaleString();
const calendarDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

function EditProfile({profile,onSave,close}:{profile:AccountProfile;onSave:(value:AccountProfile)=>void;close:()=>void}){
 const [draft,setDraft]=useState(profile),[error,setError]=useState('');
 const previousProfile=useRef(profile);
 useEffect(()=>{
  const previous=previousProfile.current;previousProfile.current=profile;
  setDraft(current=>{
   let next=current;
   for(const field of ['displayName','handle','bio','avatarSeed','avatarImage'] as const){
    if(current[field]===previous[field]&&current[field]!==profile[field])next={...next,[field]:profile[field]};
   }
   return next;
  });
 },[profile]);
 return <Modal title="Edit profile" close={close} className="profile-edit"><form onSubmit={event=>{event.preventDefault();try{onSave({...draft,displayName:draft.displayName.trim(),handle:draft.handle?.trim().replace(/^@/,'')});close();}catch{setError('Your profile could not be saved on this device. Please try again.');}}}>
  <p>Personalize your profile on this device.</p>
  <AvatarPicker value={draft} onChange={setDraft}/>
  <label>Display name<input data-autofocus required maxLength={60} value={draft.displayName} onChange={e=>setDraft({...draft,displayName:e.target.value})}/></label>
  {profile.accountName&&draft.displayName.trim()!==profile.accountName&&<button type="button" className="text-link" onClick={()=>setDraft({...draft,displayName:profile.accountName!})}>Use account name</button>}
  <label>Handle<input maxLength={30} pattern="[a-zA-Z0-9_.-]*" title="Use letters, numbers, underscores, dots or hyphens" placeholder="your-name" value={draft.handle||''} onChange={e=>setDraft({...draft,handle:e.target.value})}/></label>
  <label>Bio<textarea maxLength={160} rows={3} placeholder="What are you building?" value={draft.bio||''} onChange={e=>setDraft({...draft,bio:e.target.value})}/></label>
  {error&&<p role="alert">{error}</p>}<div className="profile-edit-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={!draft.displayName.trim()}>Save profile</button></div>
 </form></Modal>;
}

export function ProfilePage({profile,tasks,projects,onBack,onProject,onSave,busy}:Props){
 const [editing,setEditing]=useState(false),[mode,setMode]=useState<'Daily'|'Weekly'|'Cumulative'>('Daily');
 const [plugins,setPlugins]=useState<{title:string;id:string}[]>([]),[pluginStatus,setPluginStatus]=useState('Loading installed plugins…');
 const [focusedDay,setFocusedDay]=useState(0),[detail,setDetail]=useState('');
 const heading=useRef<HTMLHeadingElement>(null),grid=useRef<HTMLDivElement>(null);
 const stats=useMemo(()=>profileStats(tasks),[tasks]);
 const ranked=useMemo(()=>projects.map(project=>({...project,chats:tasks.filter(t=>t.projectId===project.id).length})).sort((a,b)=>b.chats-a.chats),[projects,tasks]);
 useEffect(()=>{heading.current?.focus();let active=true;if(!window.musebench){setPluginStatus('Plugin information is unavailable.');return;}window.musebench.customize({type:'refresh'}).then(result=>{if(!active)return;const installed=result.state?.plugins.filter(p=>p.enabled&&p.valid)||[];setPlugins(installed);setPluginStatus(result.state?.errors?.length?'Some plugin information could not be loaded.':installed.length?'':'No enabled plugins yet.');}).catch(()=>{if(active)setPluginStatus('Plugin information is unavailable.');});return()=>{active=false;};},[]);
 const levels=Math.max(1,...stats.days.map(d=>d.count)),weekMax=Math.max(1,...stats.weeks.map(w=>mode==='Cumulative'?w.cumulative:w.count));
 const metrics=[['Saved chats',stats.total],['Projects',projects.length],['Chats this month',stats.thisMonth],['Longest streak',`${stats.longest} ${stats.longest===1?'day':'days'}`],['Current streak',`${stats.current} ${stats.current===1?'day':'days'}`]];
 return <main className="profile-page" aria-label="User profile">
  <div className="profile-page-toolbar"><button className="profile-back" onClick={onBack}><ArrowLeft size={16}/>Back</button><div><span><LockKeyhole size={13}/>Only you</span><button className="profile-edit-button" onClick={()=>setEditing(true)}><Pencil size={14}/>Edit profile</button></div></div>
  <div className="profile-content">
   <header className="profile-hero"><ProfileAvatar profile={profile} size={54}/><h1 ref={heading} tabIndex={-1}>{profile.displayName}</h1>{profile.handle&&<p className="profile-handle">@{profile.handle}</p>}{profile.bio&&<p className="profile-bio">{profile.bio}</p>}{profile.sample&&<span className="profile-sample">Sample profile</span>}</header>
   <dl className="profile-metrics">{metrics.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{typeof value==='number'?number(value):value}</dd></div>)}</dl>
   <p className="profile-data-note">Based on Code chats saved on this device. Streaks count consecutive days you started a chat.</p>
   <section className="profile-section" aria-labelledby="profile-showcase"><div className="profile-section-heading"><h2 id="profile-showcase">Showcase</h2><span>Your projects</span></div><div className="profile-showcase">{ranked.slice(0,6).map((project,i)=><button className={`profile-project profile-project-${i%3}`} key={project.id} disabled={busy} onClick={()=>onProject(project.id)} title={`Open ${project.name}`}><div className="profile-project-art"><FolderCode size={35} strokeWidth={1.2}/><span className="profile-project-monogram">{project.name.slice(0,1).toUpperCase()}</span></div><div><strong>{project.name.replace(' · tutorial','')}</strong><span>{number(project.chats)} {project.chats===1?'chat':'chats'}<ArrowUpRight size={14}/></span></div></button>)}</div>{!projects.length&&<p className="profile-empty">Your projects will appear here when you open a folder.</p>}</section>
   <section className="profile-section" aria-labelledby="profile-activity"><div className="profile-section-heading"><h2 id="profile-activity">Chat activity</h2><div className="profile-activity-tabs" role="group" aria-label="Activity view">{(['Daily','Weekly','Cumulative'] as const).map(item=><button key={item} aria-pressed={mode===item} onClick={()=>{setMode(item);setDetail('');}}>{item}</button>)}</div></div>
    <div className="profile-chart-scroll" tabIndex={0} aria-label="Chat activity chart; scroll horizontally for all dates">
     {mode==='Daily'?<div ref={grid} className="profile-heatmap" role="group" aria-label="Daily chats started. Use arrow keys to explore dates.">{stats.days.map((day,i)=>{const label=`${calendarDate(day.date)}: ${day.future?'Future date':`${day.count} chats started`}`;return <button key={day.date} tabIndex={focusedDay===i?0:-1} aria-label={label} title={label} className={`activity-cell activity-level-${day.future?0:day.count?Math.min(4,Math.ceil(day.count/levels*4)):0} ${day.future?'future':''}`} onFocus={()=>{setFocusedDay(i);setDetail(label);}} onMouseEnter={()=>setDetail(label)} onClick={()=>setDetail(label)} onKeyDown={event=>{const step=({ArrowRight:7,ArrowLeft:-7,ArrowUp:-1,ArrowDown:1} as Record<string,number>)[event.key];if(step){event.preventDefault();const next=Math.min(stats.days.length-1,Math.max(0,i+step));(grid.current?.children[next] as HTMLButtonElement)?.focus();}}}/>;})}</div>:<div className="profile-week-chart" aria-label={`${mode} chats started`}>{stats.weeks.map(week=>{const count=mode==='Cumulative'?week.cumulative:week.count,label=`Week of ${calendarDate(week.date)}: ${count} ${mode==='Cumulative'?'cumulative ':''}chats`;return <button key={week.date} title={label} aria-label={label} onFocus={()=>setDetail(label)} onMouseEnter={()=>setDetail(label)} onClick={()=>setDetail(label)} style={{height:`${Math.max(3,count/weekMax*100)}%`}}/>;})}</div>}
     <div className="profile-chart-months">{stats.weeks.filter((week,i,all)=>i===0||week.date.slice(0,7)!==all[i-1].date.slice(0,7)).map(week=><span key={week.date}>{new Date(`${week.date}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}</span>)}</div>
    </div><div className="profile-chart-caption"><span aria-live="polite">{detail||(mode==='Cumulative'?'Running total within the displayed year.':'Chats started during the past year.')}</span>{mode==='Daily'&&<span className="profile-chart-legend">Less{[0,1,2,3,4].map(i=><i key={i} className={`activity-level-${i}`}/>)}More</span>}</div>
   </section>
   <section className="profile-section" aria-labelledby="profile-plugins"><div className="profile-section-heading"><h2 id="profile-plugins">Installed plugins</h2><span>{plugins.length?`${plugins.length} enabled`:''}</span></div><div className="profile-plugins">{plugins.map(plugin=><div key={plugin.id} title={plugin.title}><Plug size={20}/><span>{plugin.title}</span></div>)}</div>{pluginStatus&&<p className="profile-empty" role="status">{pluginStatus}</p>}</section>
   <section className="profile-section" aria-labelledby="profile-insights"><h2 id="profile-insights">Insights</h2><dl className="profile-insights"><div><dt>Most active project</dt><dd>{ranked[0]?.chats?ranked[0].name:'No activity yet'}</dd></div><div><dt>Days with new chats</dt><dd>{number(stats.activeDays)}</dd></div><div><dt>Pinned chats</dt><dd>{number(tasks.filter(t=>t.pinned&&!t.archived).length)}</dd></div><div><dt>Archived chats</dt><dd>{number(tasks.filter(t=>t.archived).length)}</dd></div><div><dt>Token usage</dt><dd className="profile-unavailable">Not connected</dd></div></dl></section>
  </div>{editing&&<EditProfile profile={profile} onSave={onSave} close={()=>setEditing(false)}/>}
 </main>;
}
