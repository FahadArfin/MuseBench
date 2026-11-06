export interface VideoCaption {id:string;start:number;end:number;text:string;style:{fontSize:number;color:string;background:string;position:'top'|'center'|'bottom';safeArea:number}}
export interface VideoStoryScene {id:string;title:string;duration:number;narration:string;assetId?:string;caption?:string;transition:'cut'|'crossfade'}
export interface VideoClip {id:string;kind:'video'|'audio'|'image'|'text'|'placeholder';assetId?:string;start:number;duration:number;sourceIn:number;speed:number;linkedGroupId?:string;text?:string;transform:{x:number;y:number;scale:number;rotation:number;fit:'contain'|'cover';crop:{left:number;top:number;right:number;bottom:number}};audio:{gain:number;muted:boolean;fadeIn:number;fadeOut:number;ducking?:{amount:number;attack:number;release:number;sidechainTrackId:string}};transition:{type:'cut'|'crossfade';duration:number}}
export interface VideoTrack {id:string;name:string;type:'video'|'audio'|'text'|'overlay';muted:boolean;locked:boolean;gain:number;clips:VideoClip[]}
export interface VideoData {width:number;height:number;timebase:number;frameRate:{numerator:number;denominator:number};tracks:VideoTrack[];captions:VideoCaption[];storyboard:VideoStoryScene[]}
export function validateVideoData(data:unknown):VideoData;
export function validateVideoCaptions(data:unknown):VideoCaption[];
export function validateVideoStoryboard(data:unknown):VideoStoryScene[];
export function createDefaultVideoData():VideoData;
