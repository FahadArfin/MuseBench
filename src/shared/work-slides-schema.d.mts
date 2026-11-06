import type {SlideData} from './work-document-types';
export function validateSlidesData(value:unknown,context?:{assetIds?:Set<string>;ids?:Set<string>}):SlideData;
export function createSlidesData(options?:{width?:number;height?:number}):SlideData;
export function slideLayout(layout?:string,width?:number,height?:number):SlideData['slides'][number];
