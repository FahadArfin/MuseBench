import type {WorkDocument} from './work-document-types';
export interface StudioSnapshot{document:WorkDocument;revision:number;dirty:boolean;status:'saved'|'saving'|'unsaved'|'conflict'|'failed';error:string;canUndo:boolean;canRedo:boolean}
export interface StudioSession{snapshot():StudioSnapshot;memoryBytes():number;acceptCommitted(next:WorkDocument,label?:string):void;change(next:WorkDocument,label?:string):void;flush():Promise<WorkDocument>;subscribe(listener:(value:StudioSnapshot)=>void):()=>void;undo():void;redo():void;reload(next:WorkDocument):void}
export function createStudioSession(options:{itemId:string;document:WorkDocument;commit:(request:any)=>Promise<any>}):StudioSession;
