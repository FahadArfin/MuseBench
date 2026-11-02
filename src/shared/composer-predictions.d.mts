import type {Task,Message} from './types';
export function latestPredictionReply(task?:Partial<Task>|null):Message|null;
export function predictionReady(task?:Partial<Task>|null,runtime?:Partial<import('./types').RuntimeState>):boolean;
export function predictionContext(task?:Partial<Task>|null):string;
export function localPrediction(task?:Partial<Task>|null):string;
export function parsePrediction(value:string):string;
export function predictionSuffix(prediction:string,draft:string):string;
export const predictionInstructions:string;
