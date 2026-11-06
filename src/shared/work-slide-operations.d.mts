import type {SlideData,SceneNode} from './work-document-types';
export type SlideOperation={type:'addSlide';layout?:string;index?:number}|{type:'duplicateSlide'|'deleteSlide';slideId:string}|{type:'moveSlide';slideId:string;index:number}|{type:'setNotes';slideId:string;notes:string}|{type:'renameSlide';slideId:string;name:string}|{type:'setBackground';slideId:string;background:string}|{type:'replaceNodes';slideId:string;nodes:SceneNode[]}|{type:'setTheme';theme:NonNullable<SlideData['theme']>}|{type:'resizeDeck';width:number;height:number};
export function applySlideOperation(input:SlideData,operation:SlideOperation):SlideData;
export function convertLegacySlides(artifact:unknown):SlideData;
