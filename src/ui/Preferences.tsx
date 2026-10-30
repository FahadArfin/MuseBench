import {useContext} from 'react';
import {AppUpdatesContext} from './AppUpdates';
import {useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction} from 'react';
import {Bell, BookOpen, Brain, Check, Code2, CreditCard, Database, Info, Keyboard, Mic, Monitor, Moon, Search, Settings2, ShieldCheck, Sun, Terminal, User, X} from 'lucide-react';
import {Modal} from './WorkspacePanels';
import {SettingsServicePanel} from './SettingsServicePanel';
import {BackgroundSettings} from './BackgroundSettings';
import {normalizePreferences, readPreferences, resolveTheme, writePreferences, type Preferences} from './preferences.mjs';
import {findSettings, type SettingsCategory} from './settings-catalog.mjs';
import {REASONING_LEVELS} from '../shared/run-options.mjs';
import type {Action, AppState, PersonalDestination} from '../shared/types';
import './preferences.css';
import {useSurfaceMotion} from './useSurfaceMotion';
export type {Preferences} from './preferences.mjs';

export function usePreferences(): [Preferences, Dispatch<SetStateAction<Preferences>>] {
  const [preferences, setValue] = useState<Preferences>(() => readPreferences());
  const setPreferences = useCallback<Dispatch<SetStateAction<Preferences>>>((next) => {
    setValue(current => normalizePreferences(typeof next === 'function' ? next(current) : next));
  }, []);
  useEffect(() => {
    writePreferences(preferences);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const root = document.documentElement;
    const applyTheme = () => {
      const theme = resolveTheme(preferences.theme, media.matches);
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
      root.dataset.windowOverlay = String(window.musebench?.windowControlsOverlay === true);
      void window.musebench?.setWindowTheme?.(theme).catch(() => {});
    };
    root.dataset.textSize = preferences.textSize;
    root.dataset.font = preferences.font;
    root.dataset.transcriptWidth = preferences.transcriptWidth;
    root.dataset.reducedMotion = String(preferences.reducedMotion);
    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [preferences]);
  useEffect(()=>{
    void window.musebench?.configureNotifications({completion:preferences.notifyCompletion,attention:preferences.notifyAttention,sound:preferences.notificationSound}).catch(()=>{});
  },[preferences.notifyCompletion,preferences.notifyAttention,preferences.notificationSound]);
  return [preferences, setPreferences];
}

export function SettingRow({title, description, children}: {title: string; description?: string; children: ReactNode}) {
  return <div className="preference-row"><div className="preference-copy"><span>{title}</span>{description && <p>{description}</p>}</div><div className="preference-control">{children}</div></div>;
}
function Toggle({label, value, change}: {label: string; value: boolean; change: (value:boolean) => void}) {
  return <button type="button" role="switch" aria-label={label} aria-checked={value} className={`preference-toggle ${value ? 'on' : ''}`} onClick={() => change(!value)}><span>{value && <Check size={10}/>}</span></button>;
}
const icons = {general:Settings2,notifications:Bell,voice:Mic,shortcuts:Keyboard,code:Code2,memory:Brain,skills:BookOpen,connection:Terminal,mobile:Monitor,control:Terminal,account:User,billing:CreditCard,data:Database,updates:Info,about:Info};
const effortNames:Record<string,string>={none:'None',minimal:'Minimal',low:'Low',medium:'Medium',high:'High',xhigh:'Extra high',max:'Max',ultra:'Ultra'};
type Props={initialCategory?:SettingsCategory;openCustomize:()=>void;preferences:Preferences;onChange:Dispatch<SetStateAction<Preferences>>;close:()=>void;openConnection:()=>void;state:AppState;busy:boolean;act:(action:Action)=>Promise<AppState|null>;openPersonal:(destination:PersonalDestination)=>void};

export function SettingsDialog({preferences, onChange, close, openConnection, state, busy, act, openPersonal,openCustomize,initialCategory='general'}:Props) {
  const {state:appUpdate}=useContext(AppUpdatesContext);
  const [category,setCategory]=useState<SettingsCategory>(initialCategory),[query,setQuery]=useState('');
  const [memory,setMemory]=useState(state.memories??''),[memoryMessage,setMemoryMessage]=useState(''),[saving,setSaving]=useState(false);
  const content=useRef<HTMLDivElement>(null);
  const categories=findSettings(query);
  const selected=categories.find(item=>item.id===category)??categories[0];
  const active=selected?.id;
  useSurfaceMotion(content,active??'empty');
  useEffect(()=>{content.current?.scrollTo(0,0);},[active]);
  const update = <K extends keyof Preferences>(key:K, value:Preferences[K]) => onChange(current => ({...current,[key]:value}));
  async function saveMemory(){
    setSaving(true);setMemoryMessage('');
    try {const next=await act({type:'setMemories',text:memory});if(next&&!next.error){setMemory(next.memories??'');setMemoryMessage('Instructions saved. Future Muse Code requests will use them.');}else setMemoryMessage('Could not save instructions. Please try again.');}
    finally {setSaving(false);}
  }
  return <Modal title="Settings" className="settings-modal" close={close}>
    <div className="settings-layout">
      <div className="settings-sidebar">
        <div className="settings-search"><Search size={15}/><input data-autofocus aria-label="Search settings" placeholder="Search" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();document.getElementById(`settings-nav-${categories[0]?.id}`)?.focus();}}}/>{query&&<button className="icon-button" aria-label="Clear settings search" onClick={()=>setQuery('')}><X size={13}/></button>}</div>
        <nav className="settings-nav" aria-label="Settings categories" onKeyDown={e=>{
          if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||(e.target as HTMLElement).tagName!=='BUTTON')return;
          e.preventDefault();const index=categories.findIndex(item=>`settings-nav-${item.id}`===(e.target as HTMLElement).id);
          const next=e.key==='Home'?0:e.key==='End'?categories.length-1:(index+(e.key==='ArrowDown'?1:-1)+categories.length)%categories.length;
          const item=categories[next];if(item){setCategory(item.id);document.getElementById(`settings-nav-${item.id}`)?.focus();}
        }}>
          {['Preferences','Coding','Account & data'].map(group=>{
            const items=categories.filter(item=>item.group===group);return items.length>0&&<div className="settings-nav-group" key={group}><p className="settings-nav-label">{group}</p>{items.map(({id,label})=>{const Icon=icons[id];return <button type="button" id={`settings-nav-${id}`} key={id} className={active===id?'active':''} aria-current={active===id?'page':undefined} onClick={()=>setCategory(id)}><Icon size={16}/><span>{label}</span></button>;})}</div>;
          })}
          {!categories.length&&<p className="settings-nav-empty">No matching sections</p>}
        </nav>
        <span className="settings-version">MuseBench <span>{appUpdate.version}</span></span>
      </div>
      <div className="settings-content" ref={content} aria-label={selected?`${selected.label} settings`:'Settings search results'}>
        {!active?<div className="settings-empty"><Search size={24}/><h3>No settings found</h3><p>Try “theme”, “approvals”, “microphone” or “export”.</p><button className="settings-action" onClick={()=>setQuery('')}>Clear search</button></div>:<>
        {query&&<p className="settings-search-summary" role="status">{categories.length} matching {categories.length===1?'section':'sections'}</p>}
        {active==='general'&&<>
          <section className="settings-section" aria-labelledby="appearance-heading"><h3 id="appearance-heading">Appearance</h3>
            <SettingRow title="Theme"><div className="theme-segments" role="group" aria-label="Theme">{([{value:'system',label:'System theme',icon:Monitor},{value:'light',label:'Light theme',icon:Sun},{value:'dark',label:'Dark theme',icon:Moon}] as const).map(({value,label,icon:Icon})=><button type="button" key={value} title={label} aria-label={label} aria-pressed={preferences.theme===value} onClick={()=>update('theme',value)}><Icon size={17}/></button>)}</div></SettingRow>
            <SettingRow title="Response font"><select aria-label="Response font" value={preferences.font} onChange={e=>update('font',e.target.value as Preferences['font'])}><option value="system">Match interface</option><option value="mono">Monospace</option></select></SettingRow>
            <SettingRow title="Transcript text size"><select aria-label="Transcript text size" value={preferences.textSize} onChange={e=>update('textSize',e.target.value as Preferences['textSize'])}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></SettingRow>
            <SettingRow title="Transcript width" description="Message and composer width in Muse Code."><select aria-label="Transcript width" value={preferences.transcriptWidth} onChange={e=>update('transcriptWidth',e.target.value as Preferences['transcriptWidth'])}><option value="narrow">Narrow</option><option value="wide">Wide</option></select></SettingRow>
            <SettingRow title="Reduce motion" description="Keep transitions and animations to a minimum."><Toggle label="Reduce motion" value={preferences.reducedMotion} change={value=>update('reducedMotion',value)}/></SettingRow>
          </section>
          <section className="settings-section"><h3>Composer</h3><SettingRow title="Enter to send" description={preferences.enterToSend?'Enter sends your message. Shift+Enter adds a new line.':'Ctrl+Enter sends your message. Enter adds a new line.'}><Toggle label="Enter to send" value={preferences.enterToSend} change={value=>update('enterToSend',value)}/></SettingRow></section>
          <BackgroundSettings/>
          <p className="settings-note">Preferences save automatically on this computer.</p>
        </>}
        {active==='notifications'&&<section className="settings-section"><h3>Notifications</h3><p className="settings-description">Get a Windows notification while MuseBench is in the background. These alerts cover Muse Code tasks.</p>
          <SettingRow title="Task completions" description="When Muse finishes working on a request."><Toggle label="Task completions" value={preferences.notifyCompletion} change={value=>update('notifyCompletion',value)}/></SettingRow>
          <SettingRow title="Needs attention" description="When a task needs approval or stops with a problem."><Toggle label="Needs attention" value={preferences.notifyAttention} change={value=>update('notifyAttention',value)}/></SettingRow>
          <SettingRow title="Notification sound"><Toggle label="Notification sound" value={preferences.notificationSound} change={value=>update('notificationSound',value)}/></SettingRow>
          <p className="settings-note">Notifications show a generic task status. Prompts, replies and project paths stay out of the notification. Windows notification settings and Do not disturb may silence alerts.</p>
        </section>}
        {active==='code'&&<><section className="settings-section"><h3>New chat defaults</h3><p className="settings-description">Choose how new Muse Code chats start. Existing chats keep their own reasoning and approval choices in the composer.</p>
          <SettingRow title="Reasoning effort" description="Higher effort can take longer and use more tokens."><select aria-label="Default reasoning effort" value={preferences.defaultReasoning} onChange={e=>update('defaultReasoning',e.target.value as Preferences['defaultReasoning'])}>{REASONING_LEVELS.map(value=><option key={value} value={value}>{effortNames[value]}</option>)}</select></SettingRow>
          <SettingRow title="Approval access"><select aria-label="Default approval access" value={preferences.defaultApproval} onChange={e=>update('defaultApproval',e.target.value as Preferences['defaultApproval'])}><option value="ask">Ask for approval</option><option value="auto">Auto-review</option><option value="never">No prompts</option></select></SettingRow>
          <p className="settings-note">{preferences.defaultApproval==='ask'?'Safe actions can run. Requests requiring approval stop the run for review.':preferences.defaultApproval==='auto'?'Muse reviews eligible requests automatically. Unresolved approvals stop the run.':'Commands run without approval prompts, within the Muse sandbox.'}</p>
        </section><section className="settings-section"><h3>Execution</h3><SettingRow title="Sandbox" description="Muse checks its native sandbox before running project commands."><span className="settings-badge"><ShieldCheck size={14}/>Always enabled</span></SettingRow><SettingRow title="Model"><span>{state.runtime.modelId||'Muse provider default'}</span></SettingRow><p className="settings-note">Use the composer to change a chat’s options. Plan mode is optional.</p></section></>}
        {active==='memory'&&<section className="settings-section"><h3>Memory</h3><p className="settings-description">Save instructions for future Muse Code requests across your projects. For example, your preferred language, test command or coding style.</p><label className="settings-editor-label" htmlFor="settings-memory">Your instructions</label><textarea className="settings-editor" id="settings-memory" disabled={saving} value={memory} onChange={e=>{setMemory(e.target.value);setMemoryMessage('');}} maxLength={1500} placeholder="Use TypeScript. Explain significant changes and run relevant tests."/><div className="settings-editor-footer"><span>{busy?'Wait for the current operation to finish. ':''}{memory.length} / 1,500 · {memory===(state.memories??'')?'Saved':'Unsaved changes'}</span><button className="settings-action" disabled={busy||saving||memory===(state.memories??'')} onClick={()=>void saveMemory()}>{saving?'Saving…':'Save instructions'}</button></div>{memoryMessage&&<p className="settings-note" role="status">{memoryMessage}</p>}<p className="settings-note">Instructions stay local until included in a request you send to Muse. Every request includes the current personal and project app settings. Clear the field and save so your next request explicitly replaces earlier personal settings with an empty scope. Saving sends nothing and does not erase native history or guarantee compliance. Repository rules, skills, direct requests, objectives and permission policy keep their own scope. Muse AI bot and Meta AI Chat manage their own memories.</p></section>}
        {active==='shortcuts'&&<section className="settings-section"><h3>Keyboard shortcuts</h3><p className="settings-description">Move around your workspace without leaving the keyboard.</p>{[['Search and commands',['Ctrl','K']],['New chat',['Ctrl','N']],['Toggle sidebar',['Ctrl','B']],['Open settings',['Ctrl',',']],['Send message',['Ctrl','Enter']],['Close a dialog',['Escape']]].map(([label,keys])=><div className="shortcut-row" key={String(label)}><span>{label as string}</span><span>{(keys as string[]).map(key=><kbd key={key}>{key}</kbd>)}</span></div>)}<p className="settings-note">Type / in the Muse Code composer to browse commands. {preferences.enterToSend?'Enter to send is also enabled; Shift+Enter adds a line.':'Enter adds a new line.'}</p></section>}
        {['voice','skills','connection','mobile','control','account','billing','data','updates','about'].includes(active)&&<SettingsServicePanel key={active} openCustomize={openCustomize} category={active} state={state} openConnection={openConnection} openPersonal={openPersonal}/>}
        </>}
      </div>
    </div>
  </Modal>;
}
