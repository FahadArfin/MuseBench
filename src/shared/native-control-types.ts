export type NativeNavigation={target:'code'|'codeSchedules'|'bot'|'chat'|'ideas'|'goals'|'search'|'feed'|'library'|'work'|'settings'|'customize'|'closeDialog';section?:string};
export type NativeRequest={id:string;operation:'inspect_ui'|'navigate';args:NativeNavigation;deadline:number};
export type NativeControlState={enabled:boolean;running:boolean;transport:string;scope:string;simulation?:boolean;connectionConfig:{command:string;args:string[];env:Record<string,string>}|null};
