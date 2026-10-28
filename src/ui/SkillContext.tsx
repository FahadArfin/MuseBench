import {useId,useState} from 'react';
import {ChevronRight,Gauge} from 'lucide-react';
import {summarizeSkillContext} from '../shared/skill-context.mjs';
import type {InspectedSkill,SkillCatalogInfo} from '../shared/skill-context.mjs';
import {MotionDisclosure} from './MotionDisclosure';
import './skill-context.css';

const estimate=(value:number|null|undefined)=>value==null?'Not reported':`~${value.toLocaleString()} tokens`;
function Diagnostics({items=[]}:{items?:string[]}){return items.length?<ul className="skill-diagnostics">{items.map((item,i)=><li key={i}>{item}</li>)}</ul>:null;}

export function SkillContextSummary({skills,catalog}:{skills:InspectedSkill[];catalog?:SkillCatalogInfo}){
 const [open,setOpen]=useState(false),id=useId(),summary=summarizeSkillContext(skills,catalog);
 return <section className="skill-context-summary" aria-label="Skill context">
  <button type="button" className="skill-context-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>
   <Gauge size={15}/><strong>Skill context</strong><span>{summary.startupTokens===null?'Estimate unavailable':`${estimate(summary.startupTokens)} at startup`}{summary.partial&&summary.startupTokens!==null?' · partial':''}</span>{catalog?.stale&&<span className="skill-context-note">Last refresh</span>}<ChevronRight size={14} className={open?'open':''}/>
  </button>
  <MotionDisclosure open={open} id={id}>
   <div className="skill-context-body">
    {catalog?.stale&&<p role="status">Showing the last successful refresh. Estimates and skill settings may have changed.</p>}
    <div className="skill-context-counts"><span>{summary.enabled} enabled</span><span>{summary.manual} manual only</span><span>{summary.disabled} disabled</span>{summary.diagnosticCount>0&&<span>{summary.diagnosticCount} loader notes</span>}</div>
    <p>Sum of Muse’s reported skill catalog estimates. Skill instructions load when used. Catalog compression and connection settings can change the actual context; this is not billed usage.</p>
    {summary.partial&&<p className="skill-context-coverage">Estimates reported for {summary.known} of {summary.count} listed skills.{summary.omitted>0?` ${summary.omitted} additional entries could not be displayed.`:''}{summary.startupTokens===null?' A complete total is unavailable.':''}</p>}
    <Diagnostics items={catalog?.diagnostics}/>
   </div>
  </MotionDisclosure>
 </section>;
}

export function SkillContextDetails({skill}:{skill:InspectedSkill}){
 const [open,setOpen]=useState(false),id=useId(),cost=skill.contextCost;
 return <div className="skill-context-details">
  <button type="button" className="skill-context-toggle" aria-label={`Context details for ${skill.title}`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>
   <ChevronRight size={12} className={open?'open':''}/><span>{cost?.startupTokens==null?'Context estimate unavailable':`${estimate(cost.startupTokens)} at startup`}</span>{!!skill.diagnostics?.length&&<span className="skill-context-note">{skill.diagnostics.length} loader notes</span>}
  </button>
  <MotionDisclosure open={open} id={id}>
   <dl><dt>Startup estimate</dt><dd>{estimate(cost?.startupTokens)}</dd><dt>Startup text</dt><dd>{cost?.startupBytes==null?'Not reported':`${cost.startupBytes.toLocaleString()} bytes`}</dd><dt>When used</dt><dd>{estimate(cost?.invokeTokens)}</dd><dt>Instruction text</dt><dd>{cost?.invokeBytes==null?'Not reported':`${cost.invokeBytes.toLocaleString()} bytes`}</dd></dl>
   <Diagnostics items={skill.diagnostics}/>
  </MotionDisclosure>
 </div>;
}
