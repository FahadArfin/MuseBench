/** Planned tools stay discoverable without exposing an executable action. */
export function WorkComingSoon({title,features}:{title:string;features:readonly string[]}){
 return <section className="work-coming-soon" aria-label={title}>
  <h3>{title}</h3>
  <div className="work-coming-soon-list">{features.map(feature=><button key={feature} type="button" className="studio-button work-coming-soon-feature" disabled title={`${feature} — Coming soon`}>
   <span>{feature}</span><span className="work-coming-soon-badge">Coming soon</span>
  </button>)}</div>
 </section>;
}

export function ImageComingSoon(){return <WorkComingSoon title="AI image tools" features={[
 'Edit selected area (mask)',
 'Remove background',
 'Remove object',
 'Replace background',
 'Expand image (outpainting)',
]}/>;}
