import type {Project,Check} from './types';
export interface ProjectLesson {id:string;title:string;text:string;applicability:string;sourceTaskId:string;sourceMessageId:string;revision:string;validation:Check|null;base:string;status:'proposed'|'accepted'|'rejected'|'revoked';createdAt:string;acceptedAt?:string;}
export function proposeLesson(project:Project,input:Omit<ProjectLesson,'base'|'status'|'createdAt'>):ProjectLesson;
export function decideLesson(project:Project,id:string,decision:'accept'|'reject'|'revoke'):void;
export function lessonBlock(lesson:ProjectLesson):string;
