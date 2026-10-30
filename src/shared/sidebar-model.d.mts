import type {Project,TaskSummary} from './types';
type SidebarData={projects:Project[];tasks:TaskSummary[];orders?:Record<string,string[]>};
export function sidebarCollections(projects:Project[],tasks:TaskSummary[],orders?:Record<string,string[]>):{projects:Project[];byProject:Map<string,TaskSummary[]>;pinned:TaskSummary[];recents:TaskSummary[]};
export function sameSidebarData(a:SidebarData,b:SidebarData):boolean;
