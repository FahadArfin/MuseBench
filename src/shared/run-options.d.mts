import type { RunOptions } from './types';
export const REASONING_LEVELS: readonly RunOptions['reasoning'][];
export const APPROVAL_MODES: readonly RunOptions['approval'][];
export const DEFAULT_RUN_OPTIONS: Readonly<RunOptions>;
export function validateRunOptions(value?: unknown): RunOptions;
export function restoreRunOptions(value?: unknown): RunOptions;
export function approvalArguments(approval: RunOptions['approval']): string[];

export const RUN_BUDGETS:Readonly<Record<NonNullable<RunOptions['budget']>,{label:string;minutes:number;steps:number}>>;
export function runBudget(id?:RunOptions['budget']):{label:string;minutes:number;steps:number};
