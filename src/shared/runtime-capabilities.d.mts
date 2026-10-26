import type {RuntimeState} from './types';
export interface RuntimeCapability {id:string;label:string;status:'available'|'disconnected'|'unavailable'|'simulated';reason:string;}
export function runtimeCapabilities(runtime?:RuntimeState):RuntimeCapability[];
