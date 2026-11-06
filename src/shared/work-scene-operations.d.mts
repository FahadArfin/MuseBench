import type {SceneNode,WorkArtboard} from './work-document-types';
export function editScene(nodes:SceneNode[],ids:string[],patch:Partial<SceneNode>):SceneNode[];
export function duplicateSceneNodes(nodes:SceneNode[],ids:string[],idFactory?:()=>string):SceneNode[];
export function alignScene(nodes:SceneNode[],ids:string[],mode:string):SceneNode[];
export function resizeArtboard<T extends {width:number;height:number;nodes:SceneNode[]}>(board:T,width:number,height:number):T;
export function reorderScene(nodes:SceneNode[],id:string,direction:string):SceneNode[];
export function groupScene(nodes:SceneNode[],ids:string[],groupId?:string):SceneNode[];
export function transformScene(nodes:SceneNode[],ids:string[],transform?:{dx?:number;dy?:number;scaleX?:number;scaleY?:number;rotation?:number}):SceneNode[];
