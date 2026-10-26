import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function SidebarSection({ title, children, actions, fullRow=false }: { title: string; children: ReactNode; actions?: ReactNode; fullRow?:boolean }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return <section className="sidebar-section" aria-label={title}>
    <div className={`section-label ${fullRow?'section-label-full-row':''}`}>
      <button type="button" className="sidebar-section-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{title}{!fullRow&&<ChevronDown size={12} className={open ? '' : 'folded'} />}</button>
      {actions}
    </div>
    <div id={id} hidden={!open}>{children}</div>
  </section>;
}
