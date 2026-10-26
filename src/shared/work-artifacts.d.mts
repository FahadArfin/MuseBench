import type {WorkArtifact, WorkItem, WorkKind, WorkSource, WorkTeam} from './work-types';

export function validateArtifact(value: unknown): WorkArtifact;
export function renderArtifactHtml(artifact: WorkArtifact, options?: {theme?: 'dark' | 'light'; updatedAt?: string | null; exportMode?: boolean; width?: number; height?: number}): string;
export function artifactMarkdown(artifact: WorkArtifact): string;
export function artifactCsv(artifact: WorkArtifact): string;
export function demoArtifact(kind: WorkKind, team?: WorkTeam): WorkArtifact;
export function artifactPrompt(options: {item: Pick<WorkItem, 'kind' | 'title'>; text: string; sources?: Pick<WorkSource, 'name' | 'path' | 'bytes'>[]}): string;
