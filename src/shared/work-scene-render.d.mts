import type {SceneNode} from './work-document-types';
export function escapeSceneHtml(value:unknown):string;
export function safeSceneAsset(value:unknown):string;
export function sceneNodeStyle(node:SceneNode):Record<string,string|number|undefined>;
export function sceneNodeContent(node:SceneNode,resolveAsset?:(id:string)=>string,resolveDimensions?:(id:string)=>{width:number;height:number}|undefined):string;
export function sceneStyleText(style:Record<string,string|number|undefined>):string;
