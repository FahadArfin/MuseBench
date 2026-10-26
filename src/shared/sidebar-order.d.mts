import type {Action,Project,TaskSummary} from './types';
export type SidebarMove=Extract<Action,{type:'moveSidebarItem'}>;
export function validateSidebarMove(action:unknown):void;
export function sidebarKey(section:string,projectId?:string):string;
export function sidebarSort<T extends {id:string}>(items:T[],order?:string[]):T[];
export function planSidebarMove(projects:Project[],tasks:TaskSummary[],orders:Record<string,string[]>|undefined,action:SidebarMove):{orders:Record<string,string[]>;target:Project|TaskSummary};
