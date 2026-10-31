import type {CodeImage,ImageMark} from './types';
export const MARK_COLORS:string[];
export function imageMarks(value:unknown):ImageMark[];
export function imageAnnotationNotes(images?:CodeImage[]):string;
