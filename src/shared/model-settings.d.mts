import type {RunOptions,RuntimeState} from './types';
export interface ModelSettingsView {requested:{model:string;effort:RunOptions['reasoning'];unavailable:boolean};observed:{label:string;model:string;id:string}|null;submittedEffort:RunOptions['reasoning']|null;effectiveEffort:null;}
export function modelSettingsView(input?:{options?:Partial<RunOptions>;runtime?:Partial<RuntimeState>}):ModelSettingsView;
