export interface ImportedMessage {role:'user'|'assistant';text:string;at:string|null;}
export interface ParsedConversation {title:string;format:string;sourceId:string|null;messages:ImportedMessage[];textBytes:number;omittedMessages:number;omittedBlocks:number;}
export interface ParsedConversationExport {conversations:ParsedConversation[];skippedConversations:number;textBytes:number;sourceMessageCount:number;}
export const IMPORT_LIMITS:Readonly<{sourceBytes:number;decodedBytes:number;conversations:number;messages:number;messageCharacters:number;textBytes:number;selectedConversations:number;selectedBytes:number}>;
export function parseConversationExport(text:string,fileName?:string,options?:{allowEmpty?:boolean}):ParsedConversationExport;
export function conversationFingerprintInput(conversation:ParsedConversation):string;
export function importExcerpt(title:string,message:Pick<ImportedMessage,'at'|'text'>):string;
