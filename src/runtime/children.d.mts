import type {NativeChild} from '../shared/types';
export function createChildTracker():{
 observe(item:NativeChild):void;
 snapshot():{items:NativeChild[];truncated:boolean};
 reset():void;
 inspect(input:{itemId:string;revision:number}):{itemId:string;revision:number;childSessionId:string};
 prepare(input:{itemId:string;revision:number;action:string;childId?:string;attempt?:number;body?:string}):{method:string;params:Record<string,unknown>};
};
