export interface MuseSkill {id:string;name:string;title:string;description:string;scope:string;}
export interface SlashEntry {id:string;label:string;description:string;icon:string;kind:string;aliases:string[];detail?:string;skill?:MuseSkill;}
export interface SlashInput {name:string;args:string;prefix:string;}
export const COMMANDS:readonly SlashEntry[];
export function parseSlashInput(value:string):SlashInput|null;
export function parseSlashSubmission(value:string):SlashInput|null;
export function findCommand(name:string):SlashEntry|undefined;
export function filterCommands(query?:string,skills?:MuseSkill[]):SlashEntry[];
export function skillPrompt(skill:MuseSkill,draft?:string):string;
