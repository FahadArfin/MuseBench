import type { RunOptions } from './types';
import type { WorkTeam, WorkKind, WorkCommand, WorkArtifact, WorkExport } from './work-types';
export interface WorkTemplate { readonly id: string; readonly team: WorkTeam; readonly kind: WorkKind; readonly title: string; readonly description: string; readonly brief: string; readonly sample: boolean; }
export const WORK_TEAMS: ReadonlyArray<{ readonly id: WorkTeam; readonly label: string; readonly description: string }>;
export const WORK_KINDS: ReadonlyArray<{ readonly id: WorkKind; readonly label: string; readonly plural: string; readonly description: string }>;
export const WORK_TEMPLATES: ReadonlyArray<WorkTemplate>;
export const WORK_EXAMPLES: ReadonlyArray<WorkTemplate>;
export function filterWorkTemplates(filters?: { team?: WorkTeam | 'all'; kind?: WorkKind | 'all'; query?: string }): WorkTemplate[];
export function createWorkDraft(template: WorkTemplate, runOptions?: RunOptions): Extract<WorkCommand, { type: 'create' }>;
export function workExportOptions(artifact: WorkArtifact | null, capabilities?: { mp4: boolean }): { format: WorkExport; label: string; enabled: boolean; reason: string }[];
