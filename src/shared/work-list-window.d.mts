export interface ListWindowInput{count:number;itemSize:number;viewportSize:number;scrollOffset:number;overscan?:number}
export function listWindow(input:ListWindowInput):{start:number;end:number;totalSize:number};
export function scrollForListItem(input:Omit<ListWindowInput,'overscan'>&{index:number}):number;
export function listKeyboardIndex(key:string,index:number,count:number):number|null;
