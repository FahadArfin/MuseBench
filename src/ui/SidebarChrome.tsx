import {PanelLeft} from 'lucide-react';
import {NavigationButtons} from './NavigationHistory';
import './sidebar-chrome.css';

export function SidebarChrome({expanded,onToggle}:{expanded:boolean;onToggle:()=>void}){
 return <div className="sidebar-chrome"><NavigationButtons/><button className="icon-button" aria-label="Toggle sidebar" aria-expanded={expanded} title="Toggle sidebar · Ctrl+B" onClick={onToggle}><PanelLeft size={16}/></button></div>;
}
